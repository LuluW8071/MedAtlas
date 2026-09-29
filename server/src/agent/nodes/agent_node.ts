import { ChatOpenAI } from '@langchain/openai';
import { AIMessage } from '@langchain/core/messages';

import { logger } from '../../config/logger.js';
import { buildAgentPrompt } from '../prompt/prompt_loader.js';
import { agentTools } from '../tools/index.js';
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

const modelWithRequiredTool = model.bindTools(agentTools, {
  tool_choice: 'required',
});
const basicConversationPattern = /^(?:hi|hello|hey|thanks|thank you|good morning|good afternoon|good evening)[!.? ]*$/i;
const greetingMessages = [
  'Hello. How can I help with your health question today?',
  'Hi. I can help with MedAtlas medical information or appointment booking.',
  'Welcome. What would you like help with today?',
];

export async function agentNode(state: AgentState) {
  logger.info({ messageCount: state.messages.length }, 'agent node start');

  // Tool result already contains response material; shared refiner owns final output.
  if (state.messages.at(-1)?.type === 'tool') {
    logger.info('agent node passing tool result to response refiner');
    return { messages: [] };
  }

  const latestHumanMessage = [...state.messages].reverse().find(message => message.type === 'human');
  const userText = latestHumanMessage?.content?.toString().trim() ?? '';
  if (basicConversationPattern.test(userText)) {
    const greeting = greetingMessages[Math.floor(Math.random() * greetingMessages.length)] ?? greetingMessages[0];
    return { messages: [new AIMessage(greeting)] };
  }

  const systemPrompt = await buildAgentPrompt(state.guardrailNotice);
  let latestHumanIndex = -1;
  let latestBookingToolIndex = -1;
  state.messages.forEach((message, index) => {
    if (message.type === 'human') latestHumanIndex = index;
    if (message.type === 'tool' && message.name === 'book_appointment') latestBookingToolIndex = index;
  });
  const followsBookingResult = latestBookingToolIndex >= 0 && latestHumanIndex > latestBookingToolIndex;
  // Existing booking follow-ups should explain prior result, not create another booking.
  const routedModel = followsBookingResult ? model : modelWithRequiredTool;
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
