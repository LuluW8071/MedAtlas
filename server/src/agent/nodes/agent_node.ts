import { ChatOpenAI } from '@langchain/openai';

import { logger } from '../../config/logger.js';
import { buildMedAtlasPrompt } from '../prompt/medatlas_assistant_prompt.js';
import { ragRetrievalTool } from '../tools/rag_retrieval_tool.js';
import type { AgentState } from '../state.js';

const model = new ChatOpenAI({
  model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
  temperature: 0,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: process.env.OPENAI_BASE_URL
    ? { baseURL: process.env.OPENAI_BASE_URL }
    : undefined,
});

const modelWithTools = model.bindTools([ragRetrievalTool]);

export async function agentNode(state: AgentState) {
  logger.info({ messageCount: state.messages.length }, 'agent node start');

  const response = await modelWithTools.invoke([
    { role: 'system', content: buildMedAtlasPrompt(state.refinedContext, state.guardrailNotice) },
    ...state.messages,
  ]);

  logger.info(
    { type: response.type, toolCalls: response.tool_calls ?? [] },
    'agent node done',
  );
  return { messages: [response] };
}
