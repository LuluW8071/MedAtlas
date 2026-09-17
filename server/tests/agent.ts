import { AIMessage, BaseMessage, HumanMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { Annotation, END, MessagesAnnotation, START, StateGraph } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';

import { logger } from '../src/config/logger.js';
import { retrieveChunks } from '../src/service/retrieve.js';
import { showAndSaveGraph } from './helper/visualize.js';

const ragTool = tool(
  async ({ query, topK }) => {
    logger.info({ query, topK }, 'rag tool called');
    try {
      const chunks = await retrieveChunks(query, topK ?? 5);
      if (chunks.length === 0) return `No knowledge-base context found for: ${query}`;
      return chunks
        .map(chunk => `[${chunk.topic} | score ${chunk.score.toFixed(3)}]\n${chunk.text}`)
        .join('\n\n');
    } catch (error) {
      logger.error({ err: error, query }, 'rag tool retrieval failed');
      return `Knowledge-base retrieval failed for: ${query}. Answer from general knowledge and note context unavailable.`;
    }
  },
  {
    name: 'rag_retrieval',
    description: 'Retrieve relevant context from the MedAtlas knowledge base.',
    schema: z.object({
      query: z.string().describe('User question to search for'),
      topK: z.number().int().min(1).max(20).optional().describe('Number of chunks to retrieve'),
    }),
  },
);

const AgentState = Annotation.Root({
  ...MessagesAnnotation.spec,
  retrievedContext: Annotation<string>({
    reducer: (_, update) => update,
    default: () => '',
  }),
  refinedContext: Annotation<string>({
    reducer: (_, update) => update,
    default: () => '',
  }),
});

type AgentState = typeof AgentState.State;

const model = new ChatOpenAI({
  model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
  temperature: 0,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: process.env.OPENAI_BASE_URL
    ? { baseURL: process.env.OPENAI_BASE_URL }
    : undefined,
});

const modelWithTools = model.bindTools([ragTool]);

async function agentNode(state: AgentState) {
  logger.info({ messageCount: state.messages.length }, 'agent node start');
  const contextInstruction = state.refinedContext
    ? `Use this refined context to answer. Do not call the tool again:\n${state.refinedContext}`
    : 'Use rag_retrieval when the question needs knowledge-base context. Otherwise answer directly.';

  const response = await modelWithTools.invoke([
    { role: 'system', content: `You are a concise MedAtlas assistant. ${contextInstruction}` },
    ...state.messages,
  ]);

  logger.info(
    { type: response.type, toolCalls: response.tool_calls ?? [] },
    'agent node done',
  );
  return { messages: [response] };
}

function messageText(message: BaseMessage): string {
  if (typeof message.content === 'string') return message.content;

  return message.content
    .map(part => typeof part === 'string' ? part : 'text' in part ? part.text : '')
    .join('');
}

async function refinerNode(state: AgentState) {
  logger.info('refiner node start');
  const toolMessage = [...state.messages].reverse().find(message => message.type === 'tool');
  const retrievedContext = toolMessage ? messageText(toolMessage) : '';
  const refinedContext = retrievedContext
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n');

  logger.info({ retrievedContext, refinedContext }, 'refiner node done');
  return { retrievedContext, refinedContext };
}

function routeAfterAgent(state: AgentState): 'rag' | 'refiner' | typeof END {
  const latestMessage = state.messages.at(-1);
  const decision =
    latestMessage instanceof AIMessage && (latestMessage.tool_calls?.length ?? 0) > 0
      ? 'rag'
      : state.messages.some(message => message.type === 'tool')
        ? 'refiner'
        : END;
  logger.info({ decision }, 'route after agent');
  return decision;
}

export const agentGraph = new StateGraph(AgentState)
  .addNode('agent', agentNode)
  .addNode('rag tool', new ToolNode([ragTool]))
  .addNode('refiner', refinerNode)
  .addEdge(START, 'agent')
  .addConditionalEdges('agent', routeAfterAgent, {
    rag: 'rag tool',
    refiner: 'refiner',
    [END]: END,
  })
  .addEdge('rag tool', 'agent')
  .addEdge('refiner', END)
  .compile();

function finalText(messages: BaseMessage[]): string {
  const response = [...messages].reverse().find(message => message.type === 'ai');
  return response ? messageText(response) : '';
}

async function main(): Promise<void> {
  const query = process.argv.slice(2).join(' ') || 'Hi how are you also can you tell me about who is father of medicine?';
  logger.info({ query }, 'agent start');
  const stream = await agentGraph.stream(
    { messages: [new HumanMessage(query)] },
    { streamMode: 'updates' },
  );
  let messages: BaseMessage[] = [];
  for await (const chunk of stream) {
    logger.info(chunk, 'graph step');
    for (const nodeState of Object.values(chunk)) {
      const nodeMessages = (nodeState as { messages?: BaseMessage[] }).messages;
      if (nodeMessages) messages = nodeMessages;
    }
  }
  logger.info({ response: finalText(messages) }, 'final response');
  await logger.flush();
}

if (process.argv[1]?.endsWith('/tests/agent.ts')) {
  void showAndSaveGraph(agentGraph, 'graph.png')
    .then(main)
    .catch(error => {
      logger.error({ error }, 'agent execution failed');
      process.exitCode = 1;
    });
}

