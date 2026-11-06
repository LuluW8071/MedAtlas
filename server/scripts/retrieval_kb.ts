/** Smoke-check retrieval on the ingested knowledge base: hybrid top hits, then Cohere rerank. Run from server/. */
import { logger } from '../src/config/logger.js';
import { mongoClient } from '../src/service/clients/mongo_client.js';
import { embedQuery } from '../src/service/clients/embedding_client.js';
import { rerank } from '../src/service/rerank.js';
import { hybridSearch } from '../src/service/retrieve.js';

const QUERIES: Array<[string, string]> = [
  ['what are the symptoms of anemia', 'anemia'],
  ['how is abdominal ultrasound performed', 'abdominal ultrasound'],
  ['can I take aspirin if I have a stomach ulcer', 'aspirin|ulcer'],
  ['what causes high blood pressure', 'hypertension|blood pressure'],
  ['treatment for strep throat', 'strep|streptococcal|pharyngitis'],
  ['symptoms of diabetes without insulin', 'diabetes'],
];

async function main() {
  for (const [question, expected] of QUERIES) {
    const candidates = await hybridSearch(await embedQuery(question), question, 20);
    const reranked = await rerank(question, candidates, 5).catch(error => { logger.warn({ err: error }, 'rerank unavailable'); return candidates.slice(0, 5); });
    const hit = new RegExp(expected, 'i');
    const row = (c: (typeof candidates)[number]) => `${c.topic} > ${c.subheadings?.join(', ')}`;
    logger.info({
      question,
      hybridTop3: candidates.slice(0, 3).map(row),
      rerankTop3: reranked.slice(0, 3).map(row),
      hitInHybrid5: candidates.slice(0, 5).some(c => hit.test(c.topic)),
      hitInRerank3: reranked.slice(0, 3).some(c => hit.test(c.topic)),
    }, 'retrieval');
  }
}

main().catch(error => { logger.error({ err: error }, 'retrieval check failed'); process.exitCode = 1; }).finally(() => mongoClient.close().catch(() => undefined));
