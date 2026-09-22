import type { RequestHandler } from 'express';

import { getAgentGraph } from '../agent/graph.js';
import { conversationsRequestSchema } from '../schemas/api.js';
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
  const parsed = conversationsRequestSchema.safeParse(request.query);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid user ID' });
    return;
  }

  try {
    const graph = await getAgentGraph();
    const indexedConversations = await listConversationIds(parsed.data.userId);
    const conversations = await Promise.all(indexedConversations.map(async (conversation) => {
      const state = await graph.getState({ configurable: { thread_id: conversation.threadId } });
      const stateMessages = state.values.messages as Array<{ type: string; content: unknown }>;
      const messages = normalizeMessages(conversation.threadId, stateMessages);
      return { ...conversation, messages };
    }));

    // Threads created before user indexing can still be loaded by their Redis thread ID.
    if (conversations.length === 0) {
      const state = await graph.getState({ configurable: { thread_id: parsed.data.userId } });
      const stateMessages = state.values.messages as Array<{ type: string; content: unknown }>;
      const messages = normalizeMessages(parsed.data.userId, stateMessages);
      if (messages.length > 0) {
        conversations.push({
          threadId: parsed.data.userId,
          title: messages.find((message) => message.role === 'user')?.content.slice(0, 80) ?? 'Conversation',
          updatedAt: Date.now(),
          messages,
        });
      }
    }
    response.json({ conversations });
  } catch {
    response.status(500).json({ error: 'Could not load conversations' });
  }
};
