/** Load and validate application configuration from environment variables. */
import 'dotenv/config';

/** Read one environment variable, returning fallback when unset. */
function optionalEnv(name: string, fallback?: string): string | undefined {
  return process.env[name] ?? fallback;
}

/** Parse positive integer environment values. */
function positiveIntegerEnv(name: string, fallback: number): number {
  const value = Number(optionalEnv(name));

  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/** Central application environment configuration. */
export const env = {
  port: positiveIntegerEnv('PORT', 4000),
  clientUrl: optionalEnv('CLIENT_URL', 'http://localhost:3000')!,
  redisUrl: optionalEnv('REDIS_URL', 'redis://localhost:6379')!,

  pineconeApiKey: optionalEnv('PINECONE_API_KEY'),
  pineconeIndexName: optionalEnv('PINECONE_INDEX_NAME'),
  pineconeNamespace: optionalEnv('PINECONE_NAMESPACE'),
  
  embeddingModel: optionalEnv('EMBEDDING_MODEL'),
  maxBatchUpsert: positiveIntegerEnv('MAX_BATCH_UPSERT', 96),
  embeddingDelayMs: positiveIntegerEnv('EMBEDDING_DELAY_MS', 15000),
  topK: positiveIntegerEnv('TOP_K', 5),

  logLevel: optionalEnv('LOG_LEVEL', 'info')!,
} as const;
