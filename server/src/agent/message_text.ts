import type { BaseMessage } from '@langchain/core/messages';

export function messageText(message: BaseMessage): string {
  if (typeof message.content === 'string') return message.content;

  return message.content
    .map(part => typeof part === 'string' ? part : 'text' in part ? part.text : '')
    .join('');
}
