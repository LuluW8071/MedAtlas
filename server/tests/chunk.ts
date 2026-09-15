/** Run chunking diagnostics against a local Markdown knowledge base. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { logger } from '../src/config/logger.js';
import {
  parseKnowledgeBase,
  processKnowledgeBase,
  toTitleCase,
} from '../src/service/chunker.js';
import type {
  KnowledgeBaseChunk,
  KnowledgeBaseTopic,
} from '../src/models/chunk.js';

/** Count non-empty whitespace-delimited words in text. */
function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Print parsed topic headings. */
function printTopics(topics: KnowledgeBaseTopic[]): void {
  logger.info('PARSED TOPICS');

  for (const topic of topics) {
    logger.info(`# ${topic.title}`);
    for (const section of topic.sections) {
      logger.info(`  ## ${section.heading} (${section.wordCount} words)`);
    }
  }
}

/** Print chunk sizes and chunks shorter than 25 words. */
function printChunkInfo(chunks: KnowledgeBaseChunk[]): void {
  logger.info('CHUNKING INFORMATION');
  logger.info({ totalChunks: chunks.length }, 'total chunks');

  const totalWords = chunks.reduce((sum, chunk) => sum + chunk.wordCount, 0);
  logger.info({ totalWords }, 'total words');

  const shortChunks = chunks.filter(chunk => wordCount(chunk.content) < 25);
  logger.info({ shortChunks: shortChunks.length }, 'chunks under 25 words');

  for (const chunk of shortChunks) {
    logger.info({
      index: chunk.index,
      words: wordCount(chunk.content),
      content: chunk.content,
    }, 'short chunk');
  }
}

/** Print topic, section, and chunk-size summary. */
function printSummary(
  topics: KnowledgeBaseTopic[],
  chunks: KnowledgeBaseChunk[],
): void {
  logger.info('SUMMARY');

  const totalSections = topics.reduce(
    (sum, topic) => sum + topic.sections.length,
    0,
  );
  const sizes = chunks.map(chunk => chunk.wordCount);
  const minimum = sizes.length > 0 ? Math.min(...sizes) : 0;
  const maximum = sizes.length > 0 ? Math.max(...sizes) : 0;
  const average = sizes.length > 0
    ? sizes.reduce((sum, size) => sum + size, 0) / sizes.length
    : 0;

  logger.info({ topics: topics.length }, 'topics');
  logger.info({ sections: totalSections }, 'sections');
  logger.info({ chunks: chunks.length }, 'chunks');
  logger.info({ minimum }, 'minimum chunk words');
  logger.info({ maximum }, 'maximum chunk words');
  logger.info({ average: average.toFixed(2) }, 'average chunk words');
}

/** Read input, process knowledge-base chunks, and print diagnostics. */
function main(): void {
  const inputFile = process.argv[2] ?? './knowledge.txt';
  const resolvedPath = path.resolve(inputFile);

  if (!fs.existsSync(resolvedPath)) {
    logger.error({ path: resolvedPath }, 'input file not found');
    process.exitCode = 1;
    return;
  }

  const markdown = fs.readFileSync(resolvedPath, 'utf8');
  const topics = parseKnowledgeBase(markdown);

  logger.info({ path: resolvedPath, words: wordCount(markdown) }, 'input loaded');

  if (topics.length === 0) {
    logger.error('no topics with subheadings found');
    process.exitCode = 1;
    return;
  }

  const chunks = processKnowledgeBase(markdown);
  printTopics(topics);
  printChunkInfo(chunks);
  printSummary(topics, chunks);
}

export { toTitleCase, processKnowledgeBase };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
