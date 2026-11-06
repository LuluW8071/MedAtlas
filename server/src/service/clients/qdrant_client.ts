/** Local Qdrant: one collection holding dense vectors plus server-side BM25 sparse vectors. */
import { QdrantClient } from '@qdrant/js-client-rest';

import { env } from '../../config/env.js';

export const qdrant = new QdrantClient({ url: env.qdrantUrl });

/** Payload stored with each chunk. */
export interface ChunkPayload {
  text: string;
  topic: string;
  subheadings: string[];
  parts: number;
  [key: string]: unknown;
}

/** Sparse vectors are inferred by Qdrant itself from the chunk text. */
export const bm25 = (text: string) => ({ text, model: 'qdrant/bm25' });

export const TURBO_QUANTIZATION = { turbo: { bits: 'bits4', memory: 'pinned' } } as const;

/** Create the collection if missing and make sure filterable payload fields are indexed. */
export async function ensureCollection(): Promise<void> {
  const { exists } = await qdrant.collectionExists(env.qdrantCollection);

  if (!exists) {
    await qdrant.createCollection(env.qdrantCollection, {
      vectors: { dense: { size: env.embeddingDimensions, distance: 'Cosine' } },
      sparse_vectors: { bm25: { modifier: 'idf' } },
    // TurboQuant (Qdrant >= 1.19): 4-bit is ~8x smaller for ~1-2 pp recall; 'pinned' keeps vectors in RAM.
    quantization_config: TURBO_QUANTIZATION,
    });
  }

  // Idempotent: also upgrades collections created before these indexes existed.
  await Promise.all(['topic', 'subheadings'].map(field_name =>
    qdrant.createPayloadIndex(env.qdrantCollection, { field_name, field_schema: 'keyword', wait: true })));
}

/** Return the subset of ids already stored, so unchanged chunks skip re-embedding. */
export async function existingIds(ids: string[]): Promise<Set<string>> {
  const points = await qdrant.retrieve(env.qdrantCollection, { ids, with_payload: false, with_vector: false });
  return new Set(points.map(point => String(point.id)));
}

/** Drop a topic's chunks that are no longer part of its latest ingest. */
export async function deleteStaleTopicChunks(topic: string, keepIds: string[]): Promise<void> {
  await qdrant.delete(env.qdrantCollection, {
    wait: true,
    filter: {
      must: [{ key: 'topic', match: { value: topic } }],
      must_not: [{ has_id: keepIds }],
    },
  });
}

export async function upsertChunks(records: Array<{ id: string; vector: number[]; payload: ChunkPayload }>) {
  await ensureCollection();
  await qdrant.upsert(env.qdrantCollection, {
    wait: true,
    points: records.map(({ id, vector, payload }) => ({
      id,
      vector: { dense: vector, bm25: bm25(payload.text) },
      payload,
    })),
  });
}
