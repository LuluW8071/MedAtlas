/** One-off: chunk assets/knowledge_base.txt and ingest it into a fresh Qdrant collection. Run from server/. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { env } from '../src/config/env.js';
import { logger } from '../src/config/logger.js';
import { qdrant } from '../src/service/clients/qdrant_client.js';
import { mongoClient } from '../src/service/clients/mongo_client.js';
import { processKnowledgeBase } from '../src/service/chunker.js';
import { ingestChunks, storeTopics } from '../src/service/ingest.js';

async function main() {
  const chunks = processKnowledgeBase(readFileSync(fileURLToPath(new URL('../../assets/knowledge_base.txt', import.meta.url)), 'utf8'));
  logger.info({ chunks: chunks.length }, 'chunked');
  await qdrant.deleteCollection(env.qdrantCollection).catch(() => undefined);
  await storeTopics(chunks);
  await ingestChunks(chunks, progress => { if (progress.embedded % 960 < 96) logger.info(progress, 'progress'); });
  logger.info('ingest done');
}

main().catch(error => { logger.error({ err: error }, 'ingest failed'); process.exitCode = 1; }).finally(() => mongoClient.close().catch(() => undefined));
