/** Embed a query and retrieve the most relevant knowledge-base chunks from Pinecone. */
import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { retrieveRequestSchema } from '../schemas/api.js';
import { bm25, qdrant, type ChunkPayload } from './clients/qdrant_client.js';
import { embedQuery } from './clients/embedding_client.js';
import { rerank } from './rerank.js';
import { matchTopics } from './topic_match.js';

const DEFAULT_TOP_K = 5;
/** Candidates fetched from hybrid search and sent to the reranker; the final topK (default 5) is kept from them. */
const MAX_TOP_K = 15;

/** One retrieved chunk, flattened from its Pinecone match and metadata. */
export interface RetrievedChunk {
  id: string;
  score: number;
  text: string;
  topic: string;
  subheadings: string[];
  parts: number;
}

/** Optional metadata constraints to narrow a retrieval query. */
export interface RetrievalFilters {
  topic?: string;
  subheadings?: string[];
  /** Disease or treatment the user named; fuzzy-matched to topic titles, which then filter the search. */
  topicName?: string;
  topicTerms?: string[];
}

/** Build a Qdrant payload filter from optional topic/subheading constraints. */
function buildFilter(filters: RetrievalFilters) {
  const must: Array<{ key: string; match: { value: string } | { any: string[] } }> = [];

  if (filters.topic) must.push({ key: 'topic', match: { value: filters.topic } });
  if (filters.topicTerms?.length) must.push({ key: 'topic', match: { any: filters.topicTerms } });
  if (filters.subheadings?.length) {
    must.push({ key: 'subheadings', match: { any: filters.subheadings.map(subheading => subheading.toLowerCase()) } });
  }

  return must.length ? { must } : undefined;
}

/** Dense + BM25 prefetch fused by Qdrant's native Reciprocal Rank Fusion. */
export async function hybridSearch(
  vector: number[],
  query: string,
  limit: number,
  filters: RetrievalFilters = {},
): Promise<RetrievedChunk[]> {
  const filter = buildFilter(filters);
  const { points } = await qdrant.query(env.qdrantCollection, {
    prefetch: [
      { query: vector, using: 'dense', limit, filter },
      { query: bm25(query), using: 'bm25', limit, filter },
    ],
    query: { fusion: 'rrf' },
    limit,
    with_payload: true,
  });

  return points.map(point => {
    const payload = point.payload as ChunkPayload;
    return {
      id: String(point.id),
      score: point.score,
      text: payload.text,
      topic: payload.topic,
      subheadings: payload.subheadings,
      parts: payload.parts,
    };
  });
}

/** Hybrid retrieval (Qdrant dense + BM25, RRF-fused, scoped to a user-named topic), then Cohere rerank. */
export async function retrieveChunks(
  query: string,
  topK: number = DEFAULT_TOP_K,
  filters: RetrievalFilters = {},
): Promise<RetrievedChunk[]> {
  const limit = Math.min(Math.max(Math.trunc(topK), 1), MAX_TOP_K);

  logger.info({ query, topK: limit, ...filters }, 'retrieving knowledge-base chunks');

  const vector = await embedQuery(query);
  // Only a disease/treatment named by the user scopes the search; other questions stay unfiltered.
  const topicTerms = filters.topic || !filters.topicName ? undefined : await matchTopics(filters.topicName);
  let candidates = await hybridSearch(vector, query, MAX_TOP_K, { ...filters, topicTerms });
  // A wrong match must not hide the answer: retry unscoped when the scoped search finds nothing.
  if (!candidates.length && topicTerms?.length) {
    candidates = await hybridSearch(vector, query, MAX_TOP_K, { ...filters, topicTerms: undefined });
  }
  const results = await rerank(query, candidates, limit);

  logger.info({ candidates: candidates.length, returned: results.length }, 'retrieved knowledge-base chunks');
  return results;
}

/** Handle a retrieval request: validate input, run the similarity search, return matches. */
async function handleRetrieveRequest(
  request: Parameters<RequestHandler>[0],
  response: Parameters<RequestHandler>[1],
): Promise<void> {
  try {
    const parsedRequest = retrieveRequestSchema.safeParse(request.body ?? {});

    if (!parsedRequest.success) {
      response.status(400).json({ error: parsedRequest.error.issues[0]?.message ?? 'Invalid request' });
      return;
    }

    const { query, topK, topic, subheadings } = parsedRequest.data;
    const chunks = await retrieveChunks(query, topK, { topic, subheadings });

    response.status(200).json({ query, results: chunks });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Retrieval failed';
    logger.error({ err: error, message }, 'knowledge-base retrieval failed');
    response.status(500).json({ error: message });
  }
}

export const retrieveRoute: RequestHandler[] = [handleRetrieveRequest];
