/**
 * Read-only retrieval eval against the live Qdrant collection: 50 seeded-random questions from
 * tests/data/retrieval_eval.json, scored per query for hybrid (RRF) and hybrid+Cohere rerank.
 * Usage: tsx scripts/retrieval_eval_live.ts [seed] [n]. Writes tests/data/retrieval_eval_results.json.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import '../src/config/env.js';
import { embedQuery } from '../src/service/clients/embedding_client.js';
import { rerank } from '../src/service/rerank.js';
import { hybridSearch, type RetrievedChunk } from '../src/service/retrieve.js';
import { normalize } from '../tests/helper/eval_corpus.js';

const [, , seedArg = '42', nArg = '50'] = process.argv;
const K = 10;
const dataPath = (name: string) => fileURLToPath(new URL(`./data/${name}`, import.meta.url));

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function embedWithRetry(text: string) {
  for (let attempt = 1; ; attempt++) {
    try { return await embedQuery(text); } catch (error) {
      if (attempt === 4) throw error;
      await new Promise(resolve => setTimeout(resolve, 3000 * attempt)); // transient network timeouts
    }
  }
}

const metrics = (rank: number) => ({
  rank: rank || null, // null = not in top 10
  'R@1': +(rank === 1), 'R@5': +(rank > 0 && rank <= 5), 'R@10': +(rank > 0 && rank <= K),
  RR: rank ? +(1 / rank).toFixed(4) : 0,
});

const mean = (rows: Array<Record<string, any>>, target: 'quote' | 'topic', mode: 'hybrid' | 'rerank', key: string) =>
  +(rows.reduce((sum, row) => sum + row[mode][target][key], 0) / rows.length).toFixed(4);

async function main() {
  const { questions } = JSON.parse(readFileSync(dataPath('retrieval_eval.json'), 'utf8')) as {
    questions: Array<{ question: string; topic: string; quote: string }>;
  };
  const rand = mulberry32(Number(seedArg));
  const sample = questions.map(q => [rand(), q] as const).sort((a, b) => a[0] - b[0]).slice(0, Number(nArg)).map(([, q]) => q);

  const rows: Array<Record<string, any>> = [];
  let rerankFallbacks = 0;

  for (const [i, { question, topic, quote }] of sample.entries()) {
    const vector = await embedWithRetry(question);
    const candidates = await hybridSearch(vector, question, 20);
    const reranked = await rerank(question, candidates, K);
    if (reranked[0] && candidates[0] && reranked[0].score === candidates[0].score) rerankFallbacks++;

    const score = (results: RetrievedChunk[]) => {
      const top = results.slice(0, K);
      const rankOf = (hit: (c: RetrievedChunk) => boolean) => top.findIndex(hit) + 1;
      return {
        quote: metrics(rankOf(c => normalize(c.text).includes(normalize(quote)))),
        topic: metrics(rankOf(c => normalize(c.topic) === normalize(topic))),
      };
    };
    rows.push({
      id: i + 1, question, topic, quote,
      hybrid: score(candidates),
      rerank: score(reranked),
      top3_topics_rerank: reranked.slice(0, 3).map(c => c.topic),
    });
    process.stdout.write(`${i + 1}/${sample.length}\r`);
    await new Promise(resolve => setTimeout(resolve, 7000)); // Cohere trial-key rate limit
  }

  const summarize = (mode: 'hybrid' | 'rerank') => Object.fromEntries((['quote', 'topic'] as const).map(target => [
    target, { 'R@1': mean(rows, target, mode, 'R@1'), 'R@5': mean(rows, target, mode, 'R@5'), 'R@10': mean(rows, target, mode, 'R@10'), MRR: mean(rows, target, mode, 'RR') },
  ]));

  writeFileSync(dataPath('retrieval_eval_results.json'), `${JSON.stringify({
    seed: Number(seedArg),
    queries: rows.length,
    relevance: { quote: 'a top-10 chunk contains the verbatim answer quote (strict)', topic: 'a top-10 chunk belongs to the source topic (lenient)' },
    rerankFallbacks,
    summary: { hybrid: summarize('hybrid'), rerank: summarize('rerank') },
    perQuery: rows,
  }, null, 2)}\n`);
  console.log(JSON.stringify({ rerankFallbacks, hybrid: summarize('hybrid'), rerank: summarize('rerank') }, null, 2));
  process.exit(0);
}

void main();
