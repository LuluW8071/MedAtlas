/**
 * Retrieval eval: chunk a fixed corpus subset with one profile, ingest it into an isolated Qdrant
 * collection, then score hybrid retrieval. Usage: tsx scripts/retrieval_eval.ts <profile> [rerank]
 * Needs PINECONE_API_KEY (embeddings); `rerank` also needs COHERE_API_KEY.
 */
import '../tests/helper/eval_env.js';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { processKnowledgeBase, type ChunkOptions } from '../src/service/chunker.js';
import { embedQuery } from '../src/service/clients/embedding_client.js';
import { qdrant } from '../src/service/clients/qdrant_client.js';
import { env } from '../src/config/env.js';
import { ingestChunks } from '../src/service/ingest.js';
import { rerank } from '../src/service/rerank.js';
import { hybridSearch } from '../src/service/retrieve.js';
import { mongoClient } from '../src/service/clients/mongo_client.js';
import { corpusTopics, normalize } from '../tests/helper/eval_corpus.js';

const PROFILES: Record<string, Partial<ChunkOptions>> = {
  default: {},
  t350: { maxChunkTokens: 350, overlapTokens: 40 },
};

const [, , profileName = 'c350', mode = 'hybrid'] = process.argv;
const options = PROFILES[profileName];
if (!options) throw new Error(`Unknown profile ${profileName}; known: ${Object.keys(PROFILES).join(', ')}`);

async function main() {
  const dataset = JSON.parse(readFileSync(
    fileURLToPath(new URL('../tests/data/retrieval_eval.json', import.meta.url)), 'utf8',
  )) as { topics: string[]; questions: Array<{ question: string; topic: string; quote: string }> };

  const subset = new Set(dataset.topics);
  const markdown = corpusTopics().filter(([title]) => subset.has(title)).map(([, block]) => block).join('\n');
  const chunks = processKnowledgeBase(markdown, options);
  const words = chunks.map(chunk => chunk.wordCount).sort((a, b) => a - b);

  await qdrant.deleteCollection(env.qdrantCollection).catch(() => undefined);
  await ingestChunks(chunks);

  const K = 10;
  const ranks = { topic: [] as number[], quote: [] as number[] };

  for (const { question, topic, quote } of dataset.questions) {
    const vector = await embedQuery(question);
    const candidates = await hybridSearch(vector, question, 20);
    const results = mode === 'rerank' ? await rerank(question, candidates, K) : candidates.slice(0, K);
    const rankOf = (hit: (chunk: (typeof results)[number]) => boolean) => results.findIndex(hit) + 1; // 0 = miss
    ranks.topic.push(rankOf(chunk => normalize(chunk.topic) === normalize(topic)));
    ranks.quote.push(rankOf(chunk => normalize(chunk.text).includes(normalize(quote))));
    if (mode === 'rerank') await new Promise(resolve => setTimeout(resolve, 7000)); // trial-key rate limit
  }

  const recallAt = (list: number[], k: number) => list.filter(r => r > 0 && r <= k).length / list.length;
  const mrr = (list: number[]) => list.reduce((sum, r) => sum + (r ? 1 / r : 0), 0) / list.length;
  const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

  console.log(JSON.stringify({
    profile: profileName,
    mode,
    chunks: chunks.length,
    words: { p10: words[Math.floor(words.length * 0.1)], median: words[Math.floor(words.length / 2)], p90: words[Math.floor(words.length * 0.9)], max: words.at(-1) },
    questions: dataset.questions.length,
    topic: { 'recall@1': pct(recallAt(ranks.topic, 1)), 'recall@5': pct(recallAt(ranks.topic, 5)), mrr: mrr(ranks.topic).toFixed(3) },
    quote: { 'recall@1': pct(recallAt(ranks.quote, 1)), 'recall@5': pct(recallAt(ranks.quote, 5)), mrr: mrr(ranks.quote).toFixed(3) },
  }, null, 2));

  await mongoClient.close();
}

void main();
