import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_CHUNK_OPTIONS,
  estimateTokens,
  parseKnowledgeBase,
  processKnowledgeBase,
} from '../src/service/chunker.js';

test('parses topics, sections, and normalized headings', () => {
  const topics = parseKnowledgeBase(`
## Ignored heading
Ignored content.

# CARDIOLOGY
## DEFINITION
  Heart-related content.  

## Purpose
Treatment content.
`);

  assert.deepEqual(topics, [
    {
      title: 'CARDIOLOGY',
      sections: [
        {
          topicTitle: 'CARDIOLOGY',
          heading: 'DEFINITION',
          content: 'Heart-related content.',
          wordCount: 2,
        },
        {
          topicTitle: 'CARDIOLOGY',
          heading: 'Purpose',
          content: 'Treatment content.',
          wordCount: 2,
        },
      ],
    },
  ]);
});

test('returns no chunks for documents without populated sections', () => {
  assert.deepEqual(processKnowledgeBase('# Empty topic\n\n## Empty section'), []);
  assert.deepEqual(processKnowledgeBase('Plain text without Markdown headings.'), []);
});

test('assigns globally increasing chunk indexes across topics', () => {
  const chunks = processKnowledgeBase(`
# First
## Definition
First content.

# Second
## Definition
Second content.
`);

  assert.deepEqual(chunks.map(chunk => chunk.index), [1, 2]);
  assert.deepEqual(chunks.map(chunk => chunk.topicTitle), ['First', 'Second']);
});

test('decodes HTML entities in titles and content', () => {
  const [chunk] = processKnowledgeBase('# Salt &amp; pepper\n\n## Use\nA &lt;b&gt; tag &amp; more.');

  assert.equal(chunk.topicTitle, 'Salt & Pepper');
  assert.match(chunk.content, /A <b> tag & more\./);
});

test('rejoins paragraphs broken mid-sentence', () => {
  const [chunk] = processKnowledgeBase('# Topic\n\n## Use\nThe drug is given to patients\n\nwith severe disease. Done.');

  assert.match(chunk.content, /patients with severe disease\./);
});

/** One token per word keeps budgets easy to reason about. */
const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

test('splits oversized text on sentence boundaries and overlaps whole sentences', () => {
  const sentences = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} has exactly seven words.`);
  const chunks = processKnowledgeBase(`# Topic\n\n## Body\n${sentences.join(' ')}`, {
    maxChunkTokens: 100, overlapTokens: 16, length: words,
  });

  assert.ok(chunks.length > 2);
  assert.ok(chunks.every(chunk => words(chunk.content) <= 100));
  assert.ok(chunks.every(chunk => /\.\s*$/.test(chunk.content)));
  assert.ok(chunks.slice(1).every(chunk => chunk.hasOverlap));
  assert.deepEqual(chunks.map(chunk => chunk.sections[0]), chunks.map((_, i) => `Body (${i + 1}/${chunks.length})`));
});

test('merges small neighbouring sections into one chunk and keeps each heading', () => {
  const chunks = processKnowledgeBase('# Topic\n\n## One\nFirst body.\n\n## Two\nSecond body.\n\n## Three\nThird body.', {
    maxChunkTokens: 100, length: words,
  });

  assert.equal(chunks.length, 1);
  assert.deepEqual(chunks[0].sections, ['One', 'Two', 'Three']);
  assert.match(chunks[0].content, /^# Topic\n## One\n\nFirst body\.\n\n## Two\n\nSecond body\./);
});

test('does not merge sections that no longer fit the budget', () => {
  const body = Array.from({ length: 40 }, (_, i) => `w${i}`).join(' ');
  const chunks = processKnowledgeBase(`# Topic\n\n## One\n${body}\n\n## Two\n${body}`, { maxChunkTokens: 60, length: words });

  assert.deepEqual(chunks.map(chunk => chunk.sections), [['One'], ['Two']]);
});

test('splits a long list by items and a table by rows with the header repeated', () => {
  const list = Array.from({ length: 30 }, (_, i) => `- item ${i} alpha beta gamma`).join('\n');
  const table = ['| a | b |', '| - | - |', ...Array.from({ length: 30 }, (_, i) => `| r${i} | x y z |`)].join('\n');
  const chunks = processKnowledgeBase(`# Topic\n\n## List\n${list}\n\n## Table\n${table}`, { maxChunkTokens: 60, length: words });

  assert.ok(chunks.every(chunk => words(chunk.content) <= 60));
  const tableChunks = chunks.filter(chunk => chunk.sections[0].startsWith('Table'));
  assert.ok(tableChunks.length > 1);
  assert.ok(tableChunks.every(chunk => chunk.content.includes('| a | b |\n| - | - |')));
  assert.ok(chunks.filter(chunk => chunk.sections[0].startsWith('List')).every(chunk => !/^[a-z]/.test(chunk.content.split('\n\n')[1])));
});

test('cuts a separator-free run to the budget instead of overflowing', () => {
  const chunks = processKnowledgeBase(`# Topic\n\n## Blob\n${'x'.repeat(5000)}`);

  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(chunk => estimateTokens(chunk.content) <= DEFAULT_CHUNK_OPTIONS.maxChunkTokens));
});
