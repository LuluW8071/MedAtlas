/** Validate uploads, generate embeddings, and persist chunks in Pinecone. */
import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import multer from 'multer';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { type KnowledgeBaseChunk } from '../models/chunk.js';
import { processKnowledgeBase } from './chunker.js';
import { createPineconeClient, getIngestionConfig, getIngestionIndex } from './clients/pinecone_client.js';
import { delay, embedBatch } from './clients/embedding_client.js';
import { getRedisClient } from './clients/redis_client.js';

const allowedExtensions = new Set(['.txt', '.md']);
const topicsRedisKey = 'topics';
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

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

/** Build a deduplicated topic-to-subheading map from processed chunks. */
function collectTopics(chunks: KnowledgeBaseChunk[]): Record<string, string[]> {
  const topics = new Map<string, Set<string>>();

  for (const chunk of chunks) {
    const subheadings = topics.get(chunk.topicTitle) ?? new Set<string>();

    for (const section of chunk.sections) {
      subheadings.add(section.replace(/\s+\(\d+\/\d+\)$/, '').toLowerCase());
    }

    topics.set(chunk.topicTitle, subheadings);
  }

  return Object.fromEntries(
    [...topics].map(([topic, subheadings]) => [topic, [...subheadings]]),
  );
}

/** Persist all topics and subheadings in Redis. */
async function storeTopics(chunks: KnowledgeBaseChunk[]): Promise<void> {
  const topics = collectTopics(chunks);
  const redis = await getRedisClient();
  await redis.set(topicsRedisKey, JSON.stringify(topics));
}

/** Parse multipart payload flag, preserving Pinecone ingestion by default. */
function parsePayload(value: unknown): boolean | undefined {
  if (value === undefined || value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return undefined;
}

/** Embed chunks with Pinecone inference and store vectors in configured namespace. */
async function ingestChunks(chunks: KnowledgeBaseChunk[]): Promise<void> {
  const config = getIngestionConfig();
  const pinecone = createPineconeClient();
  const index = await getIngestionIndex(pinecone, config);

  for (let start = 0; start < chunks.length; start += config.batchSize) {
    if (start > 0) {
      logger.info({ delayMs: env.embeddingDelayMs }, 'waiting between embedding batches');
      await delay(env.embeddingDelayMs);
    }

    const batch = chunks.slice(start, start + config.batchSize);
    const embeddings = await embedBatch(
      pinecone,
      config.model,
      batch.map(chunk => chunk.content),
      'passage'
    );

    if (
      embeddings.vectorType !== 'dense' ||
      embeddings.data.some(
  (embedding: { vectorType: string }) => embedding.vectorType !== 'dense',
)
    ) {
      throw new Error('Configured embedding model did not return dense vectors');
    }

    const records = batch.map((chunk, i) => ({
      id: `${randomUUID()}-${start + i}`,
      values: embeddings.data[i].vectorType === 'dense' ? embeddings.data[i].values : [],
      metadata: getChunkMetadata(chunk),
    }));

    logger.info({
      namespace: config.namespace,
      records: records.length,
      parts: records.map(record => record.metadata.parts),
    }, 'upserting embedded chunks');

    await index.upsert({ records });
  }
}

/** Handle one multipart document upload and optionally ingest its chunks into Pinecone. */
async function handleIngestRequest(
  request: Parameters<RequestHandler>[0],
  response: Parameters<RequestHandler>[1],
): Promise<void> {
  try {
    if (!request.file) {
      response.status(400).json({ error: 'Upload one file in field "file"' });
      return;
    }

    const payload = parsePayload(request.body?.payload);

    if (payload === undefined) {
      response.status(400).json({ error: 'payload must be true or false' });
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

    if (payload) {
      await ingestChunks(chunks);
    }

    await storeTopics(chunks);

    logger.info({
      filename: request.file.originalname,
      chunks: chunks.length,
      payload,
    }, 'document ingested');

    response.status(201).json({
      message: payload
        ? 'Document ingested successfully'
        : 'Document topics stored successfully',
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
