import { writeFile } from 'node:fs/promises';

import { END, START, StateGraph } from '@langchain/langgraph';
import { MongoDBSaver } from '@langchain/langgraph-checkpoint-mongodb';

import { agentConfig } from '../config/agent_config.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AgentState } from './state.js';
import { bookingNode } from './nodes/booking_node.js';
import { refinerNode } from './nodes/refiner_node.js';
import { cacheLookupNode, fastCacheProbeNode, routeAfterCache } from './nodes/cache_nodes.js';
import { clarifyNode } from './nodes/clarify_node.js';
import { followupNode } from './nodes/followup_node.js';
import { chitchatNode } from './nodes/chitchat_node.js';
import { retrieveNode } from './nodes/retrieve_node.js';
import { routeAfterRouter, routerNode } from './nodes/router_node.js';
import { mongoClient } from '../service/clients/mongo_client.js';
import { routeAfterProbe, truncateHistoryNode } from './nodes/truncate_history_node.js';

function buildGraph() {
  const graph = new StateGraph(AgentState)
    .addNode('fast_cache_probe', fastCacheProbeNode)
    .addNode('truncate_history', truncateHistoryNode)
    .addNode('router', routerNode)
    .addNode('chitchat', chitchatNode)
    .addNode('cache_lookup', cacheLookupNode)
    .addNode('retrieve', retrieveNode)
    .addNode('clarify', clarifyNode)
    .addNode('booking', bookingNode)
    .addNode('response_refiner', refinerNode)
    .addNode('followup', followupNode)
    .addEdge(START, 'fast_cache_probe')
    .addConditionalEdges('fast_cache_probe', routeAfterProbe, { hit: END, truncate_history: 'truncate_history', router: 'router' })
    .addEdge('truncate_history', 'router')
    .addConditionalEdges('router', state => routeAfterRouter(state), ['chitchat', 'cache_lookup', 'booking', 'clarify'])
    .addEdge('clarify', END)
    .addEdge('chitchat', END)
    .addConditionalEdges('cache_lookup', state => routeAfterCache(state, 'retrieve'), {
      hit: END,
      retrieve: 'retrieve',
    })
    .addEdge('retrieve', 'response_refiner')
    .addEdge('booking', END)
    .addConditionalEdges('response_refiner', () => (agentConfig.followup.enabled ? 'followup' : END), ['followup', END])
    .addEdge('followup', END)
    .compile({ checkpointer: new MongoDBSaver({ client: mongoClient, dbName: env.mongoDbName }) });

  void showAndSaveGraph(graph).catch(error => {
    logger.warn({ err: error }, 'agent graph visualization failed');
  });
  logger.info({ mongoDb: env.mongoDbName }, 'agent graph compiled with MongoDB checkpointer');
  return graph;
}

const graphPromise = Promise.resolve(buildGraph());

async function showAndSaveGraph(graph: AgentGraph): Promise<void> {
  const drawableGraph = await graph.getGraphAsync();
  const mermaidOptions = {
    curveStyle: 'basis' as const,
    withStyles: true,
    wrapLabelNWords: 4,
  };
  logger.info({ mermaid: drawableGraph.drawMermaid(mermaidOptions) }, 'agent graph');
  const png = await drawableGraph.drawMermaidPng({
    ...mermaidOptions,
    backgroundColor: 'white',
  });
  const outputPath = process.env.AGENT_GRAPH_IMAGE_PATH ?? 'graph.png';
  await writeFile(outputPath, Buffer.from(await png.arrayBuffer()));
  logger.info({ outputPath }, 'agent graph image saved');
}

export type AgentGraph = Awaited<typeof graphPromise>;

export function getAgentGraph(): Promise<AgentGraph> {
  return graphPromise;
}
