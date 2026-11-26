import { agentConfig } from '../../config/agent_config.js';
import { logger } from '../../config/logger.js';
import { messageText } from '../message_text.js';
import { chatModel } from '../model.js';
import { loadPrompt, renderPrompt } from '../prompt/prompt_loader.js';
import type { AgentState } from '../state.js';

const norm = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ');

/** Defensively turn model output into a deduped, capped list of questions. */
export function parseFollowups(text: string, count: number, askedBefore: string[] = []): string[] {
  const seen = new Set(askedBefore.map(norm));
  const out: string[] = [];
  for (const line of text.split('\n')) {
    const item = line
      .replace(/^\s*(?:[-*•]+|\d+[.)]|\(\d+\))\s*/, '')
      .trim()
      .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
      .trim();
    if (!item || /^none\.?$/i.test(item) || seen.has(norm(item))) continue;
    seen.add(norm(item));
    out.push(item);
    if (out.length >= count) break;
  }
  return out;
}

export async function followupNode(state: AgentState) {
  const { citations } = state;
  if (!citations.length) return { followups: [] };

  try {
    const prompt = renderPrompt(await loadPrompt('followup_node.md'), {
      count: String(agentConfig.followup.count),
      user_query: state.query,
      answer: state.refinedContext,
      topics: [...new Set(citations.map(c => c.topic))].join('\n'),
    });
    const response = await chatModel.invoke([{ role: 'user', content: prompt }], {
      // Keep suggestions out of the user-facing token stream.
      tags: ['langsmith:nostream'],
    });
    const asked = state.messages.filter(m => m.type === 'human').map(messageText);
    return { followups: parseFollowups(messageText(response), agentConfig.followup.count, asked) };
  } catch (error) {
    logger.warn({ err: error }, 'followup generation failed');
    return { followups: [] };
  }
}
