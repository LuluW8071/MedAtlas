import { AIMessage } from '@langchain/core/messages';

import { logger } from '../../config/logger.js';
import { getCachedAnswer } from '../../service/answer_cache.js';
import { inspectUserInput } from '../guardrails/input_guardrail.js';
import { messageText } from '../message_text.js';
import type { AgentState } from '../state.js';

async function lookup(query: string) {
  try {
    return await getCachedAnswer(query);
  } catch (error) {
    logger.warn({ err: error }, 'answer cache unavailable');
    return null;
  }
}

function hit(cached: NonNullable<Awaited<ReturnType<typeof lookup>>>) {
  return { route: 'cache_hit' as const, messages: [new AIMessage(cached.answer)], citations: cached.citations };
}

/** Pre-router probe on the raw first-turn query; a hit skips the routing model call. */
export async function fastCacheProbeNode(state: AgentState) {
  const humans = state.messages.filter(message => message.type === 'human');
  const firstTurn = humans.length === 1;
  const cached = firstTurn ? await lookup(messageText(humans[0])) : null;
  logger.info({ firstTurn, hit: Boolean(cached) }, 'fast cache probe');
  if (cached) return hit(cached);

  // Per-turn reset (the router still reads last turn's followups for the click shortcut, so they stay).
  const latest = messageText(humans.at(-1)!);
  return {
    firstTurn, route: '' as const, query: '', citations: [], retrievedContext: '', refinedContext: '',
    truncated: false, guardrailNotice: inspectUserInput(latest).notice,
  };
}

/** Post-router lookup on the standalone rewritten query. */
export async function cacheLookupNode(state: AgentState) {
  const cached = await lookup(state.query);
  logger.info({ query: state.query, hit: Boolean(cached) }, 'cache lookup');
  return cached ? hit(cached) : {};
}

export function routeAfterCache(state: AgentState, miss: string) {
  return state.route === 'cache_hit' ? 'hit' : miss;
}
