import type { RequestHandler } from 'express';
import { HumanMessage, type BaseMessage } from '@langchain/core/messages';

import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { agentRequestSchema } from '../schemas/api.js';
import { getAgentGraph } from '../agent/graph.js';
import { newUserTurnsSince, summarizeHistoryDelta } from '../agent/nodes/summarize_history.js';
import { shouldStartSummarizing } from '../agent/nodes/truncate_history.js';
import type { RetrievedChunk } from './retrieve.js';
import { rememberConversation } from './conversations.js';
import { claimConversation } from './auth.js';

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

  const { message, threadId } = parsedRequest.data;
  const userId = response.locals.userId as string;
  try {
    if (!(await claimConversation(userId, threadId))) {
      response.status(403).json({ error: 'Conversation belongs to another account' });
      return;
    }
  } catch (error) {
    logger.error({ err: error, threadId }, 'conversation ownership check failed');
    response.status(500).json({ error: 'Could not start conversation' });
    return;
  }

  response.status(200);
  response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  response.setHeader('Cache-Control', 'no-cache, no-transform');
  response.setHeader('Connection', 'keep-alive');
  response.flushHeaders();

  try {
    const graph = await getAgentGraph();
    sendEvent(response, 'start', { threadId });

    // Off-critical-path summary: starts now, read by the next turn's router, awaited after streaming.
    const prior = (await graph.getState({ configurable: { thread_id: threadId } })).values as {
      messages?: BaseMessage[]; historySummary?: string; summaryThroughId?: string;
    };
    const priorMessages = prior.messages ?? [];
    const summaryTask = prior.historySummary || shouldStartSummarizing(priorMessages, env.historyTokenBudget)
      ? summarizeHistoryDelta(prior.historySummary ?? '', newUserTurnsSince(priorMessages, prior.summaryThroughId ?? ''))
      : undefined;

    const stream = await graph.stream(
      { messages: [new HumanMessage(message)] },
      { configurable: { thread_id: threadId }, streamMode: 'messages' },
    );
    let streamedResponse = '';

    for await (const [chunk] of stream) {
      if (chunk.type !== 'ai') continue;
      const token = contentText(chunk.content);
      if (!token) continue;
      streamedResponse += token;
      sendEvent(response, 'token', { token });
    }

    const { values } = await graph.getState({ configurable: { thread_id: threadId } });
    const citations = values.citations as RetrievedChunk[];

    const suggestions = (values.followups as string[] | undefined) ?? [];

    if (citations.length) sendEvent(response, 'sources', { citations });
    if (suggestions.length) sendEvent(response, 'suggestions', { suggestions });
    sendEvent(response, 'done', { threadId, response: streamedResponse, citations, suggestions });
    const folded = await summaryTask;
    if (folded) {
      await graph.updateState({ configurable: { thread_id: threadId } }, { historySummary: folded.summary, summaryThroughId: folded.throughId });
    }
    if (userId) await rememberConversation(userId, threadId, message.slice(0, 80));
    response.end();
  } catch (error) {
    logger.error({ err: error, threadId }, 'agent graph invocation failed');
    sendEvent(response, 'error', { error: 'Agent invocation failed' });
    response.end();
  }
};
