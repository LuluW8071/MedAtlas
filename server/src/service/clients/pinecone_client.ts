/** Pinecone inference client; used only to embed text (vectors live in Qdrant). */

import { Pinecone } from '@pinecone-database/pinecone';
import { env } from '../../config/env.js';

export interface EmbeddingConfig {
  model: string;
  batchSize: number;
}

/** Create a Pinecone client */
export function createPineconeClient(): Pinecone {
  const apiKey = env.pineconeApiKey;
  if (!apiKey) {
    throw new Error('PINECONE_API_KEY is required');
  }
  return new Pinecone({ apiKey });
}

/** Return required embedding configuration or throw a readable error. */
export function getEmbeddingConfig(): EmbeddingConfig {
  const model = env.embeddingModel;
  const batchSize = env.maxBatchUpsert;

  if (!model) {
    throw new Error('EMBEDDING_MODEL is required');
  }

  return { model, batchSize };
}
