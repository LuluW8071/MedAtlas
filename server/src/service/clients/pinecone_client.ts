/** Pinecone client Instance Configs. */

import { Pinecone, type RecordMetadata } from '@pinecone-database/pinecone';
import { env } from '../../config/env.js';


export interface IngestionConfig {
  indexName: string;
  model: string;
  namespace: string;
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

/** Return required ingestion configuration or throw a readable error. */
export function getIngestionConfig(): IngestionConfig {
  const indexName = env.pineconeIndexName;
  const model = env.embeddingModel;
  const namespace = env.pineconeNamespace;
  const batchSize = env.maxBatchUpsert;

  if (!indexName || !model || !namespace || !Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error(
      'PINECONE_INDEX_NAME, EMBEDDING_MODEL, PINECONE_NAMESPACE, and valid MAX_BATCH_UPSERT are required',
    );
  }

  return { indexName, model, namespace, batchSize };
}



// Cache the resolved host per index name so repeated ingest calls don't pay
// for an extra describeIndex lookup each time (see Pinecone's "Target an
// index" guidance: name-targeting resolves the host via describeIndex under
// the hood on every call, and is not recommended for production use).
const hostCache = new Map<string, string>();



/** Resolve and cache the DNS host for an index, looking it up once. */
async function resolveIndexHost(pinecone: Pinecone, indexName: string): Promise<string> {
  const cached = hostCache.get(indexName);

  if (cached) {
    return cached;
  }

  const indexModel = await pinecone.indexes.describe(indexName);
  hostCache.set(indexName, indexModel.host);
  return indexModel.host;
}

/** Return the configured Pinecone index scoped to the ingestion namespace. */
export async function getIngestionIndex<T extends RecordMetadata = RecordMetadata>(
  pinecone: Pinecone,
  config: Pick<IngestionConfig, 'indexName' | 'namespace'>,
) {
  const host = await resolveIndexHost(pinecone, config.indexName);
  return pinecone.index<T>({ host }).namespace(config.namespace);
}