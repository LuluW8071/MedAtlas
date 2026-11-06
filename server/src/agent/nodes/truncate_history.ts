import type { BaseMessage } from '@langchain/core/messages';

/** Rough token estimate (~4 chars per token); no tokenizer dependency needed. */
function estimateTokens(message: BaseMessage): number {
  return Math.ceil(JSON.stringify(message.content).length / 4) + 4;
}

export function historyTokens(messages: BaseMessage[]): number {
  return messages.reduce((sum, message) => sum + estimateTokens(message), 0);
}

/** The transcript no longer fits the budget. */
export function needsTruncation(messages: BaseMessage[], budget: number): boolean {
  return historyTokens(messages) > budget;
}

/** A lower bar so a summary exists before truncation starts dropping turns. */
export function shouldStartSummarizing(messages: BaseMessage[], budget: number, ratio = 0.6): boolean {
  return historyTokens(messages) >= budget * ratio;
}

/** Verbatim tail that fits the budget and starts on a human turn. Pure: the stored transcript is never changed. */
export function tailWithinBudget(messages: BaseMessage[], budget: number): BaseMessage[] {
  let used = 0;
  let start = messages.length;
  while (start > 0 && (used += estimateTokens(messages[start - 1])) <= budget) start -= 1;

  // Always keep the newest message even if it alone exceeds the budget.
  start = Math.min(start, messages.length - 1);
  // Never start mid tool exchange: tool results need their originating AI message.
  while (start < messages.length - 1 && messages[start].type !== 'human') start += 1;

  return messages.slice(Math.max(start, 0));
}
