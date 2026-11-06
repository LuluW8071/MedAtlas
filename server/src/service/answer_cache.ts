/** MongoDB exact cache + Redis vector-set semantic cache, keyed by query text, corpus generation, and a manual logic version. */
import { createHash } from 'node:crypto';

import { agentConfig } from '../config/agent_config.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import type { RetrievedChunk } from './retrieve.js';
import { embedQuery } from './clients/embedding_client.js';
import { getDb } from './clients/mongo_client.js';
import { getRedisClient } from './clients/redis_client.js';

/** Bump when prompts, chunking, or retrieval logic change enough to invalidate cached answers. */
const LOGIC_VERSION = 1;

interface CacheDoc {
  _id: string;
  answer: string;
  citations: RetrievedChunk[];
  createdAt: Date;
}

const cache = () => getDb().collection<CacheDoc>('answer_cache');
const meta = () => getDb().collection<{ _id: string; value: number }>('meta');

let indexReady: Promise<unknown> | undefined;

export function normalizeQuery(query: string): string {
  return query.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

export function cacheKey(query: string, generation: number): string {
  return createHash('sha256').update(`${LOGIC_VERSION}|${generation}|${normalizeQuery(query)}`).digest('hex');
}

async function corpusGeneration(): Promise<number> {
  return (await meta().findOne({ _id: 'corpus_generation' }))?.value ?? 0;
}

/** Invalidate every cached answer; called after the corpus changes. */
export async function bumpCorpusGeneration(): Promise<void> {
  await meta().updateOne({ _id: 'corpus_generation' }, { $inc: { value: 1 } }, { upsert: true });
  try {
    const redis = await getRedisClient();
    const keys = await redis.keys('semcache:*'); // shortcut: KEYS blocks Redis, fine at this scale; use SCAN if the cache grows large
    if (keys.length) await redis.del(...keys);
  } catch (error) {
    logger.warn({ err: error }, 'semantic cache purge failed');
  }
}

const NEGATION = /\b(not|no|never|without|avoid|except|excluding|none|neither|nor)\b|\bnon-|n['\u2019]t\b|\b(other|rather) than\b/i;

/** Embeddings treat "symptoms of X" and "not symptoms of X" as near-identical, so negated queries skip the semantic tier. */
export function hasNegation(query: string): boolean {
  return NEGATION.test(query);
}

interface SemanticPoint { score: number; payload?: Record<string, unknown> | null }
type CacheHit = { answer: string; citations: RetrievedChunk[] };

/** Redis vector sets score (cosine + 1) / 2; convert back so the threshold stays a plain cosine. */
export const cosineFromRedis = (score: number) => 2 * score - 1;

/** Defensive re-check of what Redis returned (threshold, payload shape). */
export function acceptSemanticHit(point: SemanticPoint | undefined, threshold: number): CacheHit | null {
  const p = point?.payload;
  if (!point || !p || point.score < threshold || typeof p.answer !== 'string') return null;
  return { answer: p.answer, citations: (p.citations ?? []) as RetrievedChunk[] };
}

export interface SemanticDeps {
  embed: (text: string) => Promise<number[]>;
  search: (vector: number[], generation: number) => Promise<SemanticPoint[]>;
}

/** One vector set per corpus generation + logic version, so a bump orphans old entries by key. */
const setKey = (generation: number) => `semcache:g${generation}:v${LOGIC_VERSION}`;
const docKey = (id: string) => `semcache:doc:${id}`;
const vectorBlob = (vector: number[]) => Buffer.from(new Float32Array(vector).buffer);

const defaultDeps: SemanticDeps = {
  embed: embedQuery,
  search: async (vector, generation) => {
    const redis = await getRedisClient();
    // COUNT 5: an expired doc (TTL) can shadow the nearest vector, so look past it.
    const reply = (await redis.call('VSIM', setKey(generation), 'FP32', vectorBlob(vector), 'WITHSCORES', 'COUNT', 5)) as string[] | null;
    const points: SemanticPoint[] = [];
    for (let i = 0; i + 1 < (reply?.length ?? 0); i += 2) {
      const raw = await redis.get(docKey(reply![i]));
      if (raw) points.push({ score: cosineFromRedis(Number(reply![i + 1])), payload: JSON.parse(raw) });
    }
    return points;
  },
};

export async function semanticLookup(query: string, generation: number, deps: SemanticDeps = defaultDeps): Promise<CacheHit | null> {
  if (!agentConfig.semanticCache.enabled || !normalizeQuery(query) || hasNegation(query)) return null;
  const { threshold } = agentConfig.semanticCache;
  try {
    const points = await deps.search(await deps.embed(query), generation);
    return points.map(point => acceptSemanticHit(point, threshold)).find(Boolean) ?? null;
  } catch (error) {
    logger.warn({ err: error }, 'semantic cache lookup failed');
    return null;
  }
}

/** Deterministic uuid from the sha256 cache key so rewrites upsert. */
export function keyToUuid(key: string): string {
  return `${key.slice(0, 8)}-${key.slice(8, 12)}-${key.slice(12, 16)}-${key.slice(16, 20)}-${key.slice(20, 32)}`;
}

async function semanticStore(queries: string[], generation: number, answer: string, citations: RetrievedChunk[]) {
  const fresh = queries.filter(query => !hasNegation(query));
  if (!agentConfig.semanticCache.enabled || !fresh.length) return;
  try {
    const redis = await getRedisClient();
    await Promise.all(fresh.map(async query => {
      const id = keyToUuid(cacheKey(query, generation));
      await redis.set(docKey(id), JSON.stringify({ answer, citations, query }), 'EX', env.answerCacheTtlSeconds);
      await redis.call('VADD', setKey(generation), 'FP32', vectorBlob(await embedQuery(query)), id);
    }));
  } catch (error) {
    logger.warn({ err: error }, 'semantic cache store failed');
  }
}

export async function getCachedAnswer(query: string) {
  if (!normalizeQuery(query)) return null;
  const generation = await corpusGeneration();
  const doc = await cache().findOne({ _id: cacheKey(query, generation) });
  return doc ? { answer: doc.answer, citations: doc.citations } : semanticLookup(query, generation);
}

export async function putCachedAnswer(queries: string[], answer: string, citations: RetrievedChunk[]) {
  indexReady ??= cache().createIndex({ createdAt: 1 }, { expireAfterSeconds: env.answerCacheTtlSeconds });
  await indexReady;
  const generation = await corpusGeneration();
  const distinct = [...new Set(queries.filter(normalizeQuery))];
  await Promise.all(distinct.map(query => cache().updateOne(
    { _id: cacheKey(query, generation) },
    { $set: { answer, citations, createdAt: new Date() } },
    { upsert: true },
  )));
  await semanticStore(distinct, generation, answer, citations);
}
