import type { BaseMessage } from '@langchain/core/messages';

import { env } from '../config/env.js';
import { tailWithinBudget } from './nodes/truncate_history.js';
import type { AgentState } from './state.js';

/** Messages a model call should see: the full transcript, or its verbatim tail once truncate_history has fired. */
export function contextMessages(state: AgentState): BaseMessage[] {
  return state.truncated ? tailWithinBudget(state.messages, env.historyTokenBudget) : state.messages;
}
