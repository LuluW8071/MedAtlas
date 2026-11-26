/** Dense embeddings from a local llama.cpp server: `llama-server -hf luluw/Qwen3-MedEmbed-0.6B-Miriad-32k-en-trim-gguf:Q4_K_M -c 4096 --batch-size 768 --ubatch-size 768 -t 4 -ngl 999 --host 0.0.0.0 --port 8080 --embedding --pooling last --parallel 8 --flash-attn on`. */
import { env } from '../../config/env.js';

/** -c 4096 / --parallel 8 = 512 tokens per slot; leave room for special tokens. */
const MAX_INPUT_TOKENS = 500;

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${env.embeddingUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`Embedding server ${path} returned ${response.status}`);
  return response.json() as Promise<T>;
}

/** Exact cap with the server's own tokenizer: chunker estimates drift, and the server rejects oversized input. */
async function fitContext(text: string): Promise<string> {
  const { tokens } = await post<{ tokens: number[] }>('/tokenize', { content: text, add_special: true });
  if (tokens.length <= MAX_INPUT_TOKENS) return text;
  const { content } = await post<{ content: string }>('/detokenize', { tokens: tokens.slice(0, MAX_INPUT_TOKENS) });
  return content;
}

/** Embed texts through llama-server's OpenAI-compatible endpoint; vectors come back L2-normalized. */
export async function embedBatch(contents: string[]): Promise<number[][]> {
  const input = await Promise.all(contents.map(fitContext));
  const { data } = await post<{ data: Array<{ index: number; embedding: number[] }> }>(
    '/v1/embeddings', { model: env.embeddingModel, input },
  );
  if (data.length !== contents.length) throw new Error('Embedding server returned a wrong vector count');
  // shortcut: no Qwen3 query instruction prefix, add one if recall on short queries is weak.
  return data.sort((a, b) => a.index - b.index).map(item => item.embedding);
}

/** Embed a single search query and return its dense vector. */
export async function embedQuery(query: string): Promise<number[]> {
  return (await embedBatch([query]))[0];
}
