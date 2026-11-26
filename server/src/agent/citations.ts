import type { RetrievedChunk } from '../service/retrieve.js';

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
