/** Validate uploads, generate embeddings, and persist chunks in Qdrant. */
import { createHash, randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import multer from 'multer';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { type KnowledgeBaseChunk } from '../models/chunk.js';
import { processKnowledgeBase } from './chunker.js';
import { deleteStaleTopicChunks, ensureCollection, existingIds, upsertChunks } from './clients/qdrant_client.js';
import { embedBatch } from './clients/embedding_client.js';
import { getRedisClient } from './clients/redis_client.js';
import { bumpCorpusGeneration } from './answer_cache.js';
import { invalidateTopicCache, topicsRedisKey } from './topic_match.js';

const allowedExtensions = new Set(['.txt', '.md']);

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
    ...chunk.metadata,
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
export async function storeTopics(chunks: KnowledgeBaseChunk[]): Promise<void> {
  const topics = collectTopics(chunks);
  const redis = await getRedisClient();
  await redis.set(topicsRedisKey, JSON.stringify(topics));
  invalidateTopicCache();
}

/** Parse multipart payload flag, preserving Pinecone ingestion by default. */
function parsePayload(value: unknown): boolean | undefined {
  if (value === undefined || value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return undefined;
}

/** Stable UUID from chunk content, so re-ingesting the same text overwrites instead of duplicating. */
export function chunkId(chunk: KnowledgeBaseChunk): string {
  const hex = createHash('sha1').update(`${chunk.topicTitle}\n${chunk.content}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export interface IngestProgress {
  embedded: number;
  skipped: number;
}

/**
 * Embed and upsert chunks into Qdrant. Idempotent: unchanged chunks are skipped, and a
 * re-ingested topic loses any of its old chunks that the new text no longer produces.
 */
export async function ingestChunks(
  chunks: KnowledgeBaseChunk[],
  onProgress: (progress: IngestProgress) => void = () => undefined,
): Promise<IngestProgress> {
  const batchSize = env.maxBatchUpsert;
  await ensureCollection();

  const progress: IngestProgress = { embedded: 0, skipped: 0 };

  for (let start = 0; start < chunks.length; start += batchSize) {
    const batch = chunks.slice(start, start + batchSize);
    const ids = batch.map(chunkId);
    const stored = await existingIds(ids);
    const pending = batch.map((chunk, i) => ({ chunk, id: ids[i] })).filter(({ id }) => !stored.has(id));
    progress.skipped += batch.length - pending.length;

    if (pending.length > 0) {
      const vectors = await embedBatch(pending.map(({ chunk }) => chunk.content));

      logger.info({ collection: env.qdrantCollection, records: pending.length }, 'upserting embedded chunks');

      await upsertChunks(pending.map(({ chunk, id }, i) => ({
        id,
        vector: vectors[i],
        payload: getChunkMetadata(chunk),
      })));
      progress.embedded += pending.length;
    }

    onProgress({ ...progress });
  }

  const idsByTopic = new Map<string, string[]>();
  for (const chunk of chunks) {
    idsByTopic.set(chunk.topicTitle, [...(idsByTopic.get(chunk.topicTitle) ?? []), chunkId(chunk)]);
  }
  for (const [topic, keepIds] of idsByTopic) await deleteStaleTopicChunks(topic, keepIds);

  await bumpCorpusGeneration();
  return progress;
}

export interface IngestJob {
  jobId: string;
  status: 'running' | 'completed' | 'failed';
  total: number;
  embedded: number;
  skipped: number;
  error?: string;
}

// shortcut: job state is in-memory, so it is lost on restart; persist it if jobs must survive deploys.
const ingestJobs = new Map<string, IngestJob>();

/** Run ingestion in the background so a large upload doesn't hold the HTTP request open. */
function startIngestJob(chunks: KnowledgeBaseChunk[]): IngestJob {
  const job: IngestJob = { jobId: randomUUID(), status: 'running', total: chunks.length, embedded: 0, skipped: 0 };
  ingestJobs.set(job.jobId, job);

  void ingestChunks(chunks, progress => Object.assign(job, progress))
    .then(() => storeTopics(chunks))
    .then(() => {
      job.status = 'completed';
      logger.info({ ...job }, 'ingest job completed');
    })
    .catch(error => {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : 'Ingestion failed';
      logger.error({ err: error, jobId: job.jobId }, 'ingest job failed');
    });

  return job;
}

export const ingestStatusRoute: RequestHandler = (request, response) => {
  const job = ingestJobs.get(String(request.params.jobId));
  if (!job) {
    response.status(404).json({ error: 'Ingest job not found' });
    return;
  }
  response.json(job);
};

/** Handle one multipart document upload; ingestion runs as a background job. */
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
      const job = startIngestJob(chunks);
      response.status(202).json({
        message: 'Document ingestion started',
        chunks: chunks.length,
        jobId: job.jobId,
      });
      return;
    }

    await storeTopics(chunks);

    logger.info({ filename: request.file.originalname, chunks: chunks.length }, 'document topics stored');

    response.status(201).json({ message: 'Document topics stored successfully', chunks: chunks.length });
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
