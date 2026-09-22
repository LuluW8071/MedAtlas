import { AIMessage } from '@langchain/core/messages';
import { END } from '@langchain/langgraph';

import { logger } from '../../config/logger.js';
import type { AgentState } from '../state.js';

export function routeAfterAgent(state: AgentState): 'rag' | 'refiner' | typeof END {
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
