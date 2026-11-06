import { z } from 'zod';

import { agentConfig } from '../../config/agent_config.js';
import { logger } from '../../config/logger.js';
import { contextMessages } from '../context.js';
import { routerModel } from '../model.js';
import { loadPrompt } from '../prompt/prompt_loader.js';
import type { AgentState } from '../state.js';
import { routerShortcut } from './router_shortcuts.js';

const routeSchema = z.object({
  route: z.enum(['chitchat', 'knowledge_base', 'appointment', 'clarify']),
  query: z.string().describe('Standalone version of the latest user message'),
  topicName: z.string().describe('Disease or treatment the user names directly, else empty'),
});

const router = routerModel.withStructuredOutput(routeSchema, { name: 'route' });

export async function routerNode(state: AgentState) {
  // ika's route node: deterministic shortcuts first, the LLM only when they do not apply.
  const shortcut = routerShortcut(state);
  if (shortcut) {
    logger.info(shortcut, 'router shortcut');
    return { ...shortcut, topicName: '', followups: [] };
  }

  const summary = state.historySummary ? `\n\nSummary of earlier conversation:\n${state.historySummary}` : '';
  const decision = await router.invoke(
    [{ role: 'system', content: `${await loadPrompt('router_node.md')}${summary}` }, ...contextMessages(state)],
    // Keep the structured JSON out of the user-facing token stream.
    { tags: ['langsmith:nostream'] },
  );
  logger.info(decision, 'router decision');
  return { route: decision.route, query: decision.query, topicName: decision.topicName.trim(), followups: [] };
}

export function routeAfterRouter(state: AgentState, clarifyEnabled: boolean = agentConfig.clarify.enabled) {
  if (state.route === 'clarify') return clarifyEnabled ? 'clarify' : 'cache_lookup';
  return state.route === 'knowledge_base' ? 'cache_lookup' : state.route === 'appointment' ? 'booking' : 'chitchat';
}
