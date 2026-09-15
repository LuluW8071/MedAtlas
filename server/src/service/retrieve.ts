/** Embed a query and retrieve the most relevant knowledge-base chunks from Pinecone. */
import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { retrieveRequestSchema } from '../schemas/api.js';
import { createPineconeClient, getIngestionConfig, getIngestionIndex } from './clients/pinecone_client.js';
import { embedQuery } from './clients/embedding_client.js';
import { type KnowledgeBaseMetadata } from '../models/retrieve.js';

const DEFAULT_TOP_K = 5;
const MAX_TOP_K = 20;

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
  topicTerms?: string[];
  subheadings?: string[];
}

interface NerEntity {
  text: string;
  label: string;
}

interface NerResponse {
  entities?: NerEntity[];
}

/** Match topic headings stored in title case. */
function toTitleCase(value: string): string {
  return value.toLowerCase().replace(/\b\w/g, character => character.toUpperCase());
}

/** Extract disease topics locally; retrieval stays available when NER is offline. */
async function extractTopics(query: string): Promise<string[]> {
  try {
    const response = await fetch(env.nerUrl, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ text: query }),
      signal: AbortSignal.timeout(env.nerTimeoutMs),
    });

    if (!response.ok) {
      throw new Error(`NER service returned ${response.status}`);
    }

    const payload = await response.json() as NerResponse;
    return [...new Set((payload.entities ?? [])
      .filter(entity => entity.label.toLowerCase() === 'disease')
      .map(entity => toTitleCase(entity.text.trim()))
      .filter(Boolean))];
  } catch (error) {
    logger.warn({ err: error, nerUrl: env.nerUrl }, 'NER topic extraction unavailable');
    return [];
  }
}

/** Build a Pinecone metadata filter from optional topic/subheading constraints. */
function buildFilter(filters: RetrievalFilters): Record<string, unknown> | undefined {
  const clauses: Record<string, unknown>[] = [];

  if (filters.topic) {
    clauses.push({ topic: { $eq: filters.topic } });
  }

  if (filters.topicTerms?.length) {
    clauses.push({ topic: { $in: filters.topicTerms } });
  }

  if (filters.subheadings?.length) {
    clauses.push({ subheadings: { $in: filters.subheadings.map(subheading => subheading.toLowerCase()) } });
  }

  if (clauses.length === 0) {
    return undefined;
  }

  return clauses.length === 1 ? clauses[0] : { $and: clauses };
}

/** Embed a natural-language query and return the closest matching knowledge-base chunks. */
export async function retrieveChunks(
  query: string,
  topK: number = DEFAULT_TOP_K,
  filters: RetrievalFilters = {},
): Promise<RetrievedChunk[]> {
  const config = getIngestionConfig();
  const pinecone = createPineconeClient();
  const index = await getIngestionIndex<KnowledgeBaseMetadata>(pinecone, config);

  const vector = await embedQuery(pinecone, config.model, query);

  logger.info(
    {
      namespace: config.namespace,
      query,
      topK,
      topic: filters.topic,
      topicTerms: filters.topicTerms,
      subheadings: filters.subheadings,
    },
    'retrieving knowledge-base chunks',
  );

  const results = await index.query({
    vector,
    topK: Math.min(Math.max(Math.trunc(topK), 1), MAX_TOP_K),
    includeMetadata: true,
    filter: buildFilter(filters),
  });

  logger.info(
    { namespace: config.namespace, matches: results.matches.length },
    'retrieved knowledge-base chunks',
  );

  return results.matches
    .filter((match): match is typeof match & { metadata: KnowledgeBaseMetadata } => match.metadata !== undefined)
    .map(match => ({
      id: match.id,
      score: match.score ?? 0,
      text: match.metadata.text,
      topic: match.metadata.topic,
      subheadings: match.metadata.subheadings,
      parts: match.metadata.parts,
    }));
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
    const topicTerms = topic ? [] : await extractTopics(query);
    const chunks = await retrieveChunks(query, topK, { topic, topicTerms, subheadings });

    response.status(200).json({ query, results: chunks });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Retrieval failed';
    logger.error({ err: error, message }, 'knowledge-base retrieval failed');
    response.status(500).json({ error: message });
  }
}

export const retrieveRoute: RequestHandler[] = [handleRetrieveRequest];
