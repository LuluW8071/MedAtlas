import { writeFile } from 'node:fs/promises';

import { END, START, StateGraph } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { RedisSaver } from '@langchain/langgraph-checkpoint-redis';

import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AgentState } from './state.js';
import { agentNode } from './nodes/agent_node.js';
import { refinerNode } from './nodes/refiner_node.js';
import { routeAfterAgent } from './nodes/route_after_agent.js';
import { prepareConversationNode } from './nodes/prepare_conversation_node.js';
import { ragRetrievalTool } from './tools/rag_retrieval_tool.js';

const graphPromise = RedisSaver.fromUrl(env.redisUrl, {
  refreshOnRead: true,
}).then(checkpointer => {
  const graph = new StateGraph(AgentState)
    .addNode('agent', agentNode)
    .addNode('rag_tool', new ToolNode([ragRetrievalTool]))
    .addNode('refiner', refinerNode)
    .addNode('prepare_conversation', prepareConversationNode)
    .addEdge(START, 'prepare_conversation')
    .addEdge('prepare_conversation', 'agent')
    .addConditionalEdges('agent', routeAfterAgent, {
      rag: 'rag_tool',
      [END]: END,
    })
    .addEdge('rag_tool', 'refiner')
    .addEdge('refiner', END)
    .compile({ checkpointer });

  void showAndSaveGraph(graph).catch(error => {
    logger.warn({ err: error }, 'agent graph visualization failed');
  });
  logger.info({ redisUrl: env.redisUrl }, 'agent graph compiled with Redis checkpointer');
  return graph;
});

async function showAndSaveGraph(graph: AgentGraph): Promise<void> {
  const drawableGraph = await graph.getGraphAsync();
  logger.info({ mermaid: drawableGraph.drawMermaid() }, 'agent graph');
  const png = await drawableGraph.drawMermaidPng({ backgroundColor: 'white' });
  const outputPath = process.env.AGENT_GRAPH_IMAGE_PATH ?? 'graph.png';
  await writeFile(outputPath, Buffer.from(await png.arrayBuffer()));
  logger.info({ outputPath }, 'agent graph image saved');
}

export type AgentGraph = Awaited<typeof graphPromise>;

export function getAgentGraph(): Promise<AgentGraph> {
  return graphPromise;
}
