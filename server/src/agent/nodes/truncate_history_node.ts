import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import type { AgentState } from '../state.js';
import { needsTruncation } from './truncate_history.js';

/** Edge after the cache probe: only an over-budget transcript passes through truncate_history. */
export function routeAfterProbe(state: AgentState) {
  if (state.route === 'cache_hit') return 'hit';
  return needsTruncation(state.messages, env.historyTokenBudget) ? 'truncate_history' : 'router';
}

/** Pure and free: flag the turn so every model call sees only the verbatim tail; the stored transcript is untouched. */
export function truncateHistoryNode(_state: AgentState) {
  logger.info('history over budget; using verbatim tail');
  return { truncated: true };
}
