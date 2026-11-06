import type { BaseMessage } from '@langchain/core/messages';

import { logger } from '../../config/logger.js';
import { messageText } from '../message_text.js';
import { chatModel } from '../model.js';
import { loadPrompt, renderPrompt } from '../prompt/prompt_loader.js';

/** User turns after the watermark message (all of them when it is unset or not found). */
export function newUserTurnsSince(messages: BaseMessage[], watermarkId: string): Array<{ id: string; text: string }> {
  const start = watermarkId ? messages.findIndex(message => message.id === watermarkId) + 1 : 0;
  return messages.slice(start)
    .filter(message => message.type === 'human' && message.id)
    .map(message => ({ id: message.id!, text: messageText(message) }));
}

/**
 * ika's summarize_history_delta: fold new user turns into the running summary. It runs
 * alongside the turn (see service/agent.ts), never ahead of routing, and never throws:
 * on failure the previous summary and watermark stay as they were so the next turn retries.
 */
export async function summarizeHistoryDelta(existing: string, turns: Array<{ id: string; text: string }>) {
  if (turns.length === 0) return null;
  try {
    const prompt = renderPrompt(await loadPrompt('summarize_history.md'), {
      existing: existing ? `Existing summary:\n${existing}` : '',
      questions: turns.map(turn => `- ${turn.text}`).join('\n'),
    });
    const response = await chatModel.invoke([{ role: 'user', content: prompt }], { tags: ['langsmith:nostream'] });
    const summary = messageText(response).trim();
    return summary ? { summary, throughId: turns.at(-1)!.id } : null;
  } catch (error) {
    logger.warn({ err: error }, 'history summarization failed; keeping previous summary');
    return null;
  }
}
