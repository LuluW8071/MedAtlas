import type { RequestHandler } from 'express';

import { getAgentGraph } from '../agent/graph.js';
import { listConversationIds } from './conversations.js';

function messageText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((part) => typeof part === 'string' ? part : part && typeof part === 'object' && 'text' in part ? String(part.text) : '').join('');
}

function normalizeMessages(threadId: string, rawMessages: Array<{ type: string; content: unknown }>) {
  return rawMessages
    .map((message, index) => ({
      id: `${threadId}-${index}`,
      role: message.type === 'human' ? 'user' as const : message.type === 'ai' ? 'assistant' as const : null,
      content: messageText(message.content),
    }))
    .filter((message): message is { id: string; role: 'user' | 'assistant'; content: string } => Boolean(message.role && message.content));
}

export const conversationsRoute: RequestHandler = async (request, response) => {
  const userId = response.locals.userId as string;

  try {
    const graph = await getAgentGraph();
    const indexedConversations = await listConversationIds(userId);
    const conversations = await Promise.all(indexedConversations.map(async (conversation) => {
      const state = await graph.getState({ configurable: { thread_id: conversation.threadId } });
      const stateMessages = state.values.messages as Array<{ type: string; content: unknown }>;
      const messages = normalizeMessages(conversation.threadId, stateMessages);
      return { ...conversation, messages };
    }));

    response.json({ conversations });
  } catch {
    response.status(500).json({ error: 'Could not load conversations' });
  }
};
