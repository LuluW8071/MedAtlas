import type { BaseMessage } from '@langchain/core/messages';

import { logger } from '../../config/logger.js';
import type { AgentState } from '../state.js';

function messageText(message: BaseMessage): string {
  if (typeof message.content === 'string') return message.content;

  return message.content
    .map(part => typeof part === 'string' ? part : 'text' in part ? part.text : '')
    .join('');
}

export async function refinerNode(state: AgentState) {
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
