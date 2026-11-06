/** Cohere reranking over fused hybrid candidates. */
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import type { RetrievedChunk } from './retrieve.js';

/** Rerank with Cohere; on failure keep fused order so chat stays available. */
export async function rerank(query: string, candidates: RetrievedChunk[], topN: number): Promise<RetrievedChunk[]> {
  if (candidates.length === 0) return [];
  if (!env.cohereApiKey) {
    logger.warn('COHERE_API_KEY not set; skipping rerank');
    return candidates.slice(0, topN);
  }

  try {
    const response = await fetch('https://api.cohere.com/v2/rerank', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.cohereApiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: env.cohereRerankModel,
        query,
        documents: candidates.map(chunk => `${chunk.topic}\n${chunk.text}`),
        top_n: topN,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Cohere rerank returned ${response.status}`);

    const { results } = await response.json() as { results: Array<{ index: number; relevance_score: number }> };
    return results.map(({ index, relevance_score }) => ({ ...candidates[index], score: relevance_score }));
  } catch (error) {
    logger.warn({ err: error }, 'Cohere rerank failed; using fused order');
    return candidates.slice(0, topN);
  }
}
