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
  redisUrl: optionalEnv('REDIS_URL', 'redis://127.0.0.1:6380')!,
  mongoUri: optionalEnv('MONGODB_URI', 'mongodb://127.0.0.1:27017')!,
  mongoDbName: optionalEnv('MONGODB_DB_NAME', 'medatlas')!,
  appointmentTimezone: optionalEnv('APPOINTMENT_TIMEZONE', 'Asia/Kathmandu')!,

  pineconeApiKey: optionalEnv('PINECONE_API_KEY'),
  qdrantUrl: optionalEnv('QDRANT_URL', 'http://127.0.0.1:6333')!,
  qdrantCollection: optionalEnv('QDRANT_COLLECTION', 'medatlas')!,
  embeddingDimensions: positiveIntegerEnv('EMBEDDING_DIMENSIONS', 1024),

  embeddingUrl: optionalEnv('EMBEDDING_URL', 'http://127.0.0.1:8080')!,
  embeddingModel: optionalEnv('EMBEDDING_MODEL'),
  maxBatchUpsert: positiveIntegerEnv('MAX_BATCH_UPSERT', 96),
  embeddingDelayMs: positiveIntegerEnv('EMBEDDING_DELAY_MS', 15000),
  topK: positiveIntegerEnv('TOP_K', 5),

  cohereApiKey: optionalEnv('COHERE_API_KEY'),
  cohereRerankModel: optionalEnv('COHERE_RERANK_MODEL', 'rerank-v3.5')!,
  historyTokenBudget: positiveIntegerEnv('HISTORY_TOKEN_BUDGET', 3000),
  answerCacheTtlSeconds: positiveIntegerEnv('ANSWER_CACHE_TTL_SECONDS', 7 * 24 * 60 * 60),

  logLevel: optionalEnv('LOG_LEVEL', 'info')!,
} as const;
