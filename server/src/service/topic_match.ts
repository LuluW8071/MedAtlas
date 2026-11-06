/** Fuzzy-match a query against ingested topic titles (kept in Redis) to scope retrieval. */
import { logger } from '../config/logger.js';
import { getRedisClient } from './clients/redis_client.js';

export const topicsRedisKey = 'topics';
const MAX_TOPICS = 3;
const CACHE_MS = 60_000;
const STOPWORDS = new Set(['of', 'and', 'the', 'in', 'a', 'an', 'to', 'for', 'with', 'on']);

let cache: { titles: string[]; loadedAt: number } | undefined;

/** Drop the in-memory title list so the next query re-reads Redis (called after ingest). */
export function invalidateTopicCache(): void {
  cache = undefined;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(token => token && !STOPWORDS.has(token));
}

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = row;
  }
  return previous[b.length];
}

/** Exact, or one typo (7+ chars, same first letter); shorter words must match exactly. */
function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  return a.length >= 7 && a[0] === b[0] && Math.abs(a.length - b.length) <= 1 && editDistance(a, b) <= 1;
}

/**
 * Titles whose every word appears (typos tolerated, any order) in the query. More matched
 * words rank first, so "Breast Cancer" beats "Cancer" for "breast cancer treatment".
 */
export function matchTopicTitles(query: string, titles: string[], max = MAX_TOPICS): string[] {
  const queryTokens = [...new Set(tokenize(query))];

  return titles
    .map(title => ({ title, tokens: tokenize(title) }))
    .filter(({ tokens }) => tokens.length > 0 && tokens.every(token => queryTokens.some(word => tokensMatch(token, word))))
    .sort((a, b) => b.tokens.length - a.tokens.length)
    .slice(0, max)
    .map(({ title }) => title);
}

async function loadTitles(): Promise<string[]> {
  if (cache && Date.now() - cache.loadedAt < CACHE_MS) return cache.titles;

  const raw = await (await getRedisClient()).get(topicsRedisKey);
  const titles = raw ? Object.keys(JSON.parse(raw) as Record<string, string[]>) : [];
  cache = { titles, loadedAt: Date.now() };
  return titles;
}

/** Up to 3 topic titles named in the query; empty when Redis is empty or unreachable. */
export async function matchTopics(query: string): Promise<string[]> {
  try {
    return matchTopicTitles(query, await loadTitles());
  } catch (error) {
    logger.warn({ err: error }, 'topic matching unavailable');
    return [];
  }
}
