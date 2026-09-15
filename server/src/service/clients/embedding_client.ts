/** Generate dense embeddings via Pinecone inference, retrying on rate limits. */

import type { Pinecone } from '@pinecone-database/pinecone';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

/** Embedding input type for Pinecone inference. */
export type EmbeddingInputType = 'passage' | 'query';
 
/** Pause execution for the given number of milliseconds. */
export function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}
 
/**
 * Generate embeddings for a batch of texts, waiting and retrying when
 * Pinecone returns HTTP 429. Pass inputType 'passage' for documents being
 * indexed and 'query' for search text — the embedding model is asymmetric,
 * so mixing these up degrades retrieval quality even though both compile.
 */
export async function embedBatch(
  pinecone: Pinecone,
  model: string,
  contents: string[],
  inputType: EmbeddingInputType,
) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await pinecone.inference.embed({
        model,
        inputs: contents,
        parameters: { inputType, truncate: 'END' },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const isRateLimited = message.includes('429') || message.includes('max tokens per minute');
 
      if (!isRateLimited || attempt === 3) {
        throw error;
      }
 
      logger.warn({ attempt, delayMs: env.embeddingDelayMs }, 'Pinecone rate limit reached; retrying');
      await delay(env.embeddingDelayMs);
    }
  }
 
  throw new Error('Embedding failed after retries');
}
 
/** Embed a single search query and return its dense vector. */
export async function embedQuery(
  pinecone: Pinecone,
  model: string,
  query: string,
): Promise<number[]> {
  const embeddings = await embedBatch(pinecone, model, [query], 'query');
  const [embedding] = embeddings.data;
 
  if (embeddings.vectorType !== 'dense' || embedding?.vectorType !== 'dense') {
    throw new Error('Configured embedding model did not return a dense query vector');
  }
 
  return embedding.values;
}