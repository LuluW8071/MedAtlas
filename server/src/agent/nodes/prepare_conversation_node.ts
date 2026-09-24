import { RemoveMessage } from '@langchain/core/messages';

import type { AgentState } from '../state.js';
import { inspectUserInput } from '../guardrails/input_guardrail.js';

const MAX_CONVERSATION_MESSAGES = 8;

/** Keep latest eight human/AI exchanges while preserving tool messages in retained suffix. */
export function prepareConversationNode(state: AgentState) {
  const latestHumanMessage = [...state.messages].reverse().find(message => message.type === 'human');
  const input = latestHumanMessage?.content;
  const guardrail = typeof input === 'string'
    ? inspectUserInput(input)
    : { flagged: false, notice: '' };
  const conversationIndexes = state.messages
    .map((message, index) => ({ index, type: message.type }))
    .filter(message => message.type === 'human' || message.type === 'ai')
    .map(message => message.index);

  if (conversationIndexes.length <= MAX_CONVERSATION_MESSAGES) {
    return { retrievedContext: '', refinedContext: '', guardrailNotice: guardrail.notice };
  }

  const firstRetainedIndex = conversationIndexes.at(-MAX_CONVERSATION_MESSAGES)!;
  return {
    retrievedContext: '',
    refinedContext: '',
    guardrailNotice: guardrail.notice,
    messages: state.messages
      .slice(0, firstRetainedIndex)
      .filter(message => message.id)
      .map(message => new RemoveMessage({ id: message.id! })),
  };
}
