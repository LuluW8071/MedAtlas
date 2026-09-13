/** Run chunking diagnostics against a local Markdown knowledge base. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
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
  console.log('\nPARSED TOPICS');

  for (const topic of topics) {
    console.log(`# ${topic.title}`);
    for (const section of topic.sections) {
      console.log(`  ## ${section.heading} (${section.wordCount} words)`);
    }
  }
}

/** Print chunk sizes and chunks shorter than 25 words. */
function printChunkInfo(chunks: KnowledgeBaseChunk[]): void {
  console.log('\nCHUNKING INFORMATION');
  console.log(`\nTotal chunks: ${chunks.length}`);

  const totalWords = chunks.reduce((sum, chunk) => sum + chunk.wordCount, 0);
  console.log(`Total words: ${totalWords}`);

  const shortChunks = chunks.filter(chunk => wordCount(chunk.content) < 25);
  console.log(`\nChunks under 25 words: ${shortChunks.length}`);

  for (const chunk of shortChunks) {
    console.log('----');
    console.log(`Chunk ${chunk.index} (${wordCount(chunk.content)} words):`);
    console.log(chunk.content);
    console.log('----');
  }
}

/** Print topic, section, and chunk-size summary. */
function printSummary(
  topics: KnowledgeBaseTopic[],
  chunks: KnowledgeBaseChunk[],
): void {
  console.log('\nSUMMARY');

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

  console.log(`Topics: ${topics.length}`);
  console.log(`Sections: ${totalSections}`);
  console.log(`Chunks: ${chunks.length}`);
  console.log(`Min chunk: ${minimum} words`);
  console.log(`Max chunk: ${maximum} words`);
  console.log(`Avg chunk: ${average.toFixed(2)} words`);
}

/** Read input, process knowledge-base chunks, and print diagnostics. */
function main(): void {
  const inputFile = process.argv[2] ?? './knowledge.txt';
  const resolvedPath = path.resolve(inputFile);

  if (!fs.existsSync(resolvedPath)) {
    console.error(`File not found: ${resolvedPath}`);
    process.exitCode = 1;
    return;
  }

  const markdown = fs.readFileSync(resolvedPath, 'utf8');
  const topics = parseKnowledgeBase(markdown);

  console.log('Input file:', resolvedPath);
  console.log('Input words:', wordCount(markdown));

  if (topics.length === 0) {
    console.error('\nNo # topics with ## subheadings found.');
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
