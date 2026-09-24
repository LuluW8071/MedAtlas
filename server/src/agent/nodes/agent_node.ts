import { ChatOpenAI } from '@langchain/openai';

import { logger } from '../../config/logger.js';
import { buildAgentPrompt } from '../prompt/prompt_loader.js';
import { ragRetrievalTool } from '../tools/rag_retrieval_tool.js';
import type { AgentState } from '../state.js';

const model = new ChatOpenAI({
  model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
  temperature: 0,
  maxTokens: 1024,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: process.env.OPENAI_BASE_URL
    ? { baseURL: process.env.OPENAI_BASE_URL }
    : undefined,
});

const modelWithTools = model.bindTools([ragRetrievalTool]);
const modelWithRequiredTool = model.bindTools([ragRetrievalTool], {
  tool_choice: 'required',
});

const basicConversationPattern = /^(?:hi|hello|hey|thanks|thank you|good morning|good afternoon|good evening)[!.? ]*$/i;
// Force retrieval for medical requests; model tool choice remains optional for basic chat.
const medicalRequestPattern =
  /\b(?:symptom|symptoms|pain|ache|cold|cough|fever|medicine|medication|drug|dose|diagnos|treatment|remedy|rash|vomit|nausea|diarrhea|breath|bleed|injur|infection|disease|pregnan|chest|injection|inject|vaccine|vaccination|rabies|rabid|animal\s+bite|post[- ]exposure|exposure|hydrophobia|swallow)\w*\b/i;

export async function agentNode(state: AgentState) {
  logger.info({ messageCount: state.messages.length }, 'agent node start');

  const systemPrompt = await buildAgentPrompt(state.guardrailNotice);
  const latestHumanMessage = [...state.messages].reverse().find(message => message.type === 'human');
  const userText = latestHumanMessage?.content?.toString() ?? '';
  const requiresRetrieval =
    medicalRequestPattern.test(userText) && !basicConversationPattern.test(userText.trim());
  const routedModel = requiresRetrieval ? modelWithRequiredTool : modelWithTools;
  const response = await routedModel.invoke([
    { role: 'system', content: systemPrompt },
    ...state.messages,
  ]);

  logger.info(
    { type: response.type, toolCalls: response.tool_calls ?? [] },
    'agent node done',
  );
  return { messages: [response] };
}
