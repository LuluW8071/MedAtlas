import type { BaseMessage } from '@langchain/core/messages';

import { messageText } from '../message_text.js';
import type { AgentState } from '../state.js';

// Whole-message matches only: "hello, what is anemia" must still reach the router.
const CHITCHAT_WORDS = new Set(['hi', 'hello', 'hey', 'thanks', 'thx', 'bye', 'goodbye', 'cheers']);
const CHITCHAT_PHRASES = new Set([
  'thank you', 'thanks a lot', 'good morning', 'good afternoon', 'good evening', 'good night',
  'who are you', 'what are you', 'what can you do', 'what do you do', 'how do you work',
  'what can you help with', 'what can you answer', 'what do you know', 'are you an ai',
  'are you a bot', 'are you human', 'who made you', 'who built you', 'how are you',
  'see you', 'take care', "that's all", 'thats all', 'good bye',
]);
const ACKNOWLEDGEMENTS = new Set([
  'ok', 'okay', 'k', 'kk', 'sure', 'yes', 'yeah', 'yep', 'got it', 'alright', 'cool', 'great', 'nice',
  'perfect', 'noted', 'fine', 'no', 'nope', 'nah', 'understood', 'makes sense',
]);

const phrase = (text: string) => text.toLowerCase().replace(/[?!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim();

export function isObviousChitchat(text: string): boolean {
  const normalized = phrase(text);
  if (!normalized) return false;
  const words = normalized.split(' ');
  return words.every(word => CHITCHAT_WORDS.has(word)) || CHITCHAT_PHRASES.has(normalized) || ACKNOWLEDGEMENTS.has(normalized);
}

/** True when the assistant's last turn was a clarifying question, so a short reply ("no") is an answer, not small talk. */
export function hasPendingClarification(messages: BaseMessage[]): boolean {
  const lastHuman = messages.map(message => message.type).lastIndexOf('human');
  const previous = messages[lastHuman - 1];
  return previous?.type === 'ai' && previous.additional_kwargs?.clarification === true;
}

/** ika's route-node shortcuts: skip the router LLM for a follow-up click or whole-message small talk. */
export function routerShortcut(state: AgentState): { route: 'knowledge_base' | 'chitchat'; query: string } | null {
  const text = messageText(state.messages.filter(message => message.type === 'human').at(-1)!).trim();
  if (hasPendingClarification(state.messages)) return null;
  if (state.followups.includes(text)) return { route: 'knowledge_base', query: text };
  return isObviousChitchat(text) ? { route: 'chitchat', query: text } : null;
}
