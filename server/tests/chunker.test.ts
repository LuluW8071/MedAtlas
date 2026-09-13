import assert from 'node:assert/strict';
import test from 'node:test';
import {
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

test('limits each chunk to three distinct sections', () => {
  const markdown = ['One', 'Two', 'Three', 'Four']
    .map(section => `## ${section}\nContent for ${section}.`)
    .join('\n\n');

  const chunks = processKnowledgeBase(`# Topic\n\n${markdown}`);

  assert.equal(chunks.length, 2);
  assert.deepEqual(chunks[0].sections, ['One', 'Two', 'Three']);
  assert.deepEqual(chunks[1].sections, ['Four']);
});

test('splits oversized sections with overlap and numbered headings', () => {
  const words = Array.from({ length: 1_700 }, (_, index) => `word${index}`);
  const chunks = processKnowledgeBase(
    `# Topic\n\n## Definition\n${words.join(' ')}`,
  );

  assert.equal(chunks.length, 3);
  assert.ok(chunks.every(chunk => chunk.wordCount <= 950));
  assert.ok(chunks.every(chunk => chunk.hasOverlap));
  assert.deepEqual(
    chunks.map(chunk => chunk.sections[0]),
    ['Definition (1/3)', 'Definition (2/3)', 'Definition (3/3)'],
  );

  assert.match(chunks[0].content, /word849/);
  assert.match(chunks[1].content, /word775/);
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
