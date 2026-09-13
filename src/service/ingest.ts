/** Validate uploads, generate embeddings, and persist chunks in Pinecone. */
import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { Pinecone } from '@pinecone-database/pinecone';
import multer from 'multer';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { type KnowledgeBaseChunk } from '../models/chunk.js';
import { processKnowledgeBase } from './chunker.js';

const allowedExtensions = new Set(['.txt', '.md']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

/** Create a Pinecone client from environment configuration. */
function createPineconeClient(): Pinecone {
  const apiKey = env.pineconeApiKey;

  if (!apiKey) {
    throw new Error('PINECONE_API_KEY is required');
  }

  return new Pinecone({ apiKey });
}

/** Return required ingestion configuration or throw a readable error. */
function getIngestionConfig() {
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

/** Extract topic and subheading metadata from one chunk. */
function getChunkMetadata(chunk: KnowledgeBaseChunk) {
  const subheadings = chunk.sections.map(section =>
    section.replace(/\s+\(\d+\/\d+\)$/, '').toLowerCase(),
  );
  const parts = chunk.sections
    .map(section => section.match(/\((\d+)\/\d+\)$/)?.[1])
    .filter((part): part is string => part !== undefined)
    .map(Number);

  return {
    text: chunk.content,
    topic: chunk.topicTitle,
    subheadings,
    parts: parts[0] ?? 0,
  };
}

/** Pause between Pinecone embedding requests to avoid token-rate limits. */
function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

/** Generate embeddings, waiting and retrying when Pinecone returns HTTP 429. */
async function embedBatch(
  pinecone: Pinecone,
  model: string,
  contents: string[],
) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await pinecone.inference.embed({
        model,
        inputs: contents,
        parameters: { inputType: 'passage', truncate: 'END' },
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

/** Embed chunks with Pinecone inference and store vectors in configured namespace. */
async function ingestChunks(chunks: KnowledgeBaseChunk[]): Promise<void> {
  const { indexName, model, namespace, batchSize } = getIngestionConfig();
  const pinecone = createPineconeClient();
  const index = pinecone.index(indexName).namespace(namespace);

  for (let start = 0; start < chunks.length; start += batchSize) {
    if (start > 0) {
      logger.info({ delayMs: env.embeddingDelayMs }, 'waiting between embedding batches');
      await delay(env.embeddingDelayMs);
    }

    const batch = chunks.slice(start, start + batchSize);
    const embeddings = await embedBatch(
      pinecone,
      model,
      batch.map(chunk => chunk.content),
    );

    if (
      embeddings.vectorType !== 'dense' ||
      embeddings.data.some(embedding => embedding.vectorType !== 'dense')
    ) {
      throw new Error('Configured embedding model did not return dense vectors');
    }

    const records = batch.map((chunk, index) => ({
        id: `${randomUUID()}-${start + index}`,
        values: embeddings.data[index].vectorType === 'dense'
          ? embeddings.data[index].values
          : [],
        metadata: getChunkMetadata(chunk),
      }));

    logger.info({
      namespace,
      records: records.length,
      parts: records.map(record => record.metadata.parts),
    }, 'upserting embedded chunks');

    await index.upsert({
      records,
    });
  }
}

/** Handle one multipart document upload and ingest its chunks into Pinecone. */
async function handleIngestRequest(
  request: Parameters<RequestHandler>[0],
  response: Parameters<RequestHandler>[1],
): Promise<void> {
  try {
    if (!request.file) {
      response.status(400).json({ error: 'Upload one file in field "file"' });
      return;
    }

    const extension = request.file.originalname
      .slice(request.file.originalname.lastIndexOf('.'))
      .toLowerCase();

    if (!allowedExtensions.has(extension)) {
      response.status(400).json({ error: 'Only .txt and .md files are supported' });
      return;
    }

    const document = request.file.buffer.toString('utf8');
    const chunks = processKnowledgeBase(document);

    logger.info({
      filename: request.file.originalname,
      chunks: chunks.length,
    }, 'document chunked');

    if (chunks.length === 0) {
      response.status(400).json({
        error: 'Document contains no # topics with ## subheadings',
      });
      return;
    }

    await ingestChunks(chunks);

    logger.info({
      filename: request.file.originalname,
      chunks: chunks.length,
    }, 'document ingested');

    response.status(201).json({
      message: 'Document ingested successfully',
      chunks: chunks.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ingestion failed';
    logger.error({ err: error, message }, 'document ingestion failed');
    response.status(500).json({ error: message });
  }
}

export const ingestRoute: RequestHandler[] = [
  upload.single('file'),
  handleIngestRequest,
];
