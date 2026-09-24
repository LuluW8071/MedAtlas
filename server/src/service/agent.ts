import type { RequestHandler } from 'express';
import { HumanMessage, type BaseMessage } from '@langchain/core/messages';

import { logger } from '../config/logger.js';
import { agentRequestSchema } from '../schemas/api.js';
import { getAgentGraph } from '../agent/graph.js';
import { parseRetrieval } from '../agent/citations.js';
import type { RetrievedChunk } from './retrieve.js';
import { rememberConversation } from './conversations.js';

function contentText(content: BaseMessage['content']): string {
  if (typeof content === 'string') return content;

  return content
    .map(part => typeof part === 'string' ? part : 'text' in part ? part.text : '')
    .join('');
}

function sendEvent(response: Parameters<RequestHandler>[1], event: string, data: unknown): void {
  if (!response.writableEnded) {
    response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
}

export const agentRoute: RequestHandler = async (request, response) => {
  const parsedRequest = agentRequestSchema.safeParse(request.body ?? {});
  if (!parsedRequest.success) {
    response.status(400).json({ error: parsedRequest.error.issues[0]?.message ?? 'Invalid request' });
    return;
  }

  const { message, threadId, userId } = parsedRequest.data;
  response.status(200);
  response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  response.setHeader('Cache-Control', 'no-cache, no-transform');
  response.setHeader('Connection', 'keep-alive');
  response.flushHeaders();

  try {
    const graph = await getAgentGraph();
    sendEvent(response, 'start', { threadId });

    const stream = await graph.stream(
      { messages: [new HumanMessage(message)] },
      { configurable: { thread_id: threadId }, streamMode: 'messages' },
    );
    let streamedResponse = '';
    let citations: RetrievedChunk[] = [];

    for await (const [chunk] of stream) {
      if (chunk.type === 'tool') {
        const nextCitations = parseRetrieval(contentText(chunk.content));
        if (nextCitations.length) citations = nextCitations;
      }
      if (chunk.type !== 'ai') continue;
      const token = contentText(chunk.content);
      if (!token) continue;
      streamedResponse += token;
      sendEvent(response, 'token', { token });
    }

    if (citations.length) sendEvent(response, 'sources', { citations });
    sendEvent(response, 'done', { threadId, response: streamedResponse, citations });
    if (userId) await rememberConversation(userId, threadId, message.slice(0, 80));
    response.end();
  } catch (error) {
    logger.error({ err: error, threadId }, 'agent graph invocation failed');
    sendEvent(response, 'error', { error: 'Agent invocation failed' });
    response.end();
  }
};
