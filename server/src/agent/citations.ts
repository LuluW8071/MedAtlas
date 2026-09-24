import type { RetrievedChunk } from '../service/retrieve.js';

export interface RetrievalPayload {
  chunks: RetrievedChunk[];
}

/** Encode retrieved chunks so ToolNode preserves citation metadata. */
export function serializeRetrieval(chunks: RetrievedChunk[]): string {
  return JSON.stringify({ chunks } satisfies RetrievalPayload);
}

/** Safely recover citation chunks from a serialized tool result. */
export function parseRetrieval(value: string): RetrievedChunk[] {
  try {
    const payload = JSON.parse(value) as Partial<RetrievalPayload>;
    return Array.isArray(payload.chunks) ? payload.chunks : [];
  } catch {
    return [];
  }
}

/** Build evidence text for the refiner without exposing raw transport data. */
export function formatRetrieval(chunks: RetrievedChunk[]): string {
  if (!chunks.length) return 'No retrieved evidence is available.';

  return chunks
    .map(chunk => [
      `Source: ${chunk.topic} (score: ${chunk.score.toFixed(3)})`,
      chunk.subheadings.length ? `Sections: ${chunk.subheadings.join(' > ')}` : '',
      chunk.text,
    ].filter(Boolean).join('\n'))
    .join('\n\n');
}
