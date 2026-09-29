import type { BaseMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';

import { logger } from '../../config/logger.js';
import { formatRetrieval, parseRetrieval } from '../citations.js';
import { buildBookingRefinerPrompt, buildRefinerPrompt } from '../prompt/prompt_loader.js';
import type { AgentState } from '../state.js';

function messageText(message: BaseMessage): string {
  if (typeof message.content === 'string') return message.content;

  return message.content
    .map(part => typeof part === 'string' ? part : 'text' in part ? part.text : '')
    .join('');
}

const refinerModel = new ChatOpenAI({
  model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
  temperature: 0,
  maxTokens: 1024,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: process.env.OPENAI_BASE_URL
    ? { baseURL: process.env.OPENAI_BASE_URL }
    : undefined,
});

export async function refinerNode(state: AgentState) {
  logger.info('refiner node start');
  const toolMessage = [...state.messages].reverse().find(message => message.type === 'tool');
  const citations = toolMessage ? parseRetrieval(messageText(toolMessage)) : [];
  const retrievedContext = formatRetrieval(citations);
  const humanMessage = [...state.messages].reverse().find(message => message.type === 'human');
  const userQuery = humanMessage ? messageText(humanMessage) : '';
  const isBookingResult = toolMessage?.name === 'book_appointment';
  const prompt = isBookingResult
    ? await buildBookingRefinerPrompt(messageText(toolMessage), userQuery)
    : await buildRefinerPrompt(retrievedContext, userQuery);
  const response = await refinerModel.invoke([
    { role: 'system', content: prompt },
    {
      role: 'user',
      content: isBookingResult
        ? 'Write the appointment response using only the booking result.'
        : 'Answer the user question using only approved retrieved evidence.',
    },
  ]);
  const refinedContext = messageText(response);

  logger.info({ mode: isBookingResult ? 'booking' : 'rag', retrievedContext, refinedContext }, 'refiner node done');
  return { messages: [response], retrievedContext, refinedContext, citations };
}
