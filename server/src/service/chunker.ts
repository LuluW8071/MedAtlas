/** Parse Markdown knowledge bases into embedding-ready chunks. */
import { createHash } from 'node:crypto';

import type {
  KnowledgeBaseChunk,
  KnowledgeBaseSection,
  KnowledgeBaseTopic,
} from '../models/chunk.js';

// Configuration.

/** Chunk-size knobs, in embedder tokens. */
export interface ChunkOptions {
  /** Hard budget per chunk, headings included; the embedder context is 512 tokens. */
  maxChunkTokens: number;
  /** Trailing sentences carried from one chunk into the next when they share a section. */
  overlapTokens: number;
  length: (text: string) => number;
}

// shortcut: chars/3.8 estimates Qwen3 tokens (measured 4.5 chars/token on the corpus); ingest verifies the exact count with llama-server and truncates the rare overflow.
export const estimateTokens = (text: string): number => Math.ceil(text.length / 3.8);

export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = {
  maxChunkTokens: 480,
  overlapTokens: 50,
  length: estimateTokens,
};

// Text utilities.

/** Count non-empty whitespace-delimited words in text. */
function wordCount(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

/** Normalize line endings, spaces, and excessive blank lines. */
function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Decode the few HTML entities present in the source text. */
function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Rejoin paragraphs that the source extraction cut mid-sentence: a block that does not end a
 * sentence, followed by one starting in lowercase, is a single paragraph.
 */
function rejoinBrokenParagraphs(text: string): string {
  const joined: string[] = [];

  for (const block of text.split(/\n\s*\n/)) {
    const previous = joined.at(-1);

    if (previous !== undefined && !/[.!?:;)"'\]]$/.test(previous.trimEnd()) && /^[a-z]/.test(block.trimStart())) {
      joined[joined.length - 1] = `${previous.trimEnd()} ${block.trimStart()}`;
    } else {
      joined.push(block);
    }
  }

  return joined.join("\n\n");
}

const SENTENCE_BOUNDARY = /(?<=[.!?]["')\]]?)\s+(?=[A-Z0-9"'(\[\u2022-])/;

/** Convert headings to title case while preserving acronyms and digits. */
export function toTitleCase(text: string): string {
  const words = text
    .trim()
    .replace(/\s+/g, " ")
    .split(" ");

  return words
    .map(word => {
       // Keep acronyms.
      if (/^[A-Z]{2,}$/.test(word)) {
        return word;
      }

       // Preserve words containing digits.
      if (/\d/.test(word)) {
        return word;
      }

       // Preserve punctuation around each word.
      const match = word.match(/^([^A-Za-z0-9]*)(.*?)([^A-Za-z0-9]*)$/);

      if (!match) {
        return word;
      }

      const [, prefix, core, suffix] = match;

      if (!core) {
        return word;
      }

      return (
        prefix +
        core.charAt(0).toUpperCase() +
        core.slice(1).toLowerCase() +
        suffix
      );
    })
    .join(" ");
}

/** Parse top-level Markdown topics and second-level section headings. */
export function parseKnowledgeBase(markdown: string): KnowledgeBaseTopic[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");

  const topics: KnowledgeBaseTopic[] = [];

  let currentTopic: KnowledgeBaseTopic | null = null;
  let currentHeading: string | null = null;
  let currentContent: string[] = [];

  /** Flush current section into current topic when content exists. */
  function flushSection() {
    if (!currentTopic || !currentHeading) {
      currentContent = [];
      return;
    }

    const content = rejoinBrokenParagraphs(normalizeWhitespace(decodeEntities(currentContent.join("\n"))));

    if (!content) {
      currentContent = [];
      return;
    }

    currentTopic.sections.push({
      topicTitle: currentTopic.title,
      heading: toTitleCase(decodeEntities(currentHeading)),
      content,
      wordCount: wordCount(content),
    });

    currentContent = [];
  }

  /** Flush current topic into parsed topics when sections exist. */
  function flushTopic() {
    flushSection();

    if (currentTopic && currentTopic.sections.length > 0) {
      topics.push(currentTopic);
    }

    currentTopic = null;
    currentHeading = null;
    currentContent = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

     // Ignore empty lines while preserving paragraph separation.
    if (!line) {
      if (currentHeading) {
        currentContent.push("");
      }

      continue;
    }

    // Parse top-level topic heading.

    if (/^#\s+/.test(line) && !/^##/.test(line)) {
      flushTopic();

      const rawTitle = line.replace(/^#\s+/, "").trim();

      currentTopic = {
        title: toTitleCase(decodeEntities(rawTitle)),
        sections: [],
      };

      continue;
    }

    // Parse section heading.

    if (/^##\s+/.test(line)) {
      // Ignore section headings before first topic.
      if (!currentTopic) {
        continue;
      }

      flushSection();

      currentHeading = line.replace(/^##\s+/, "").trim();

      continue;
    }

    // Collect section content.

    if (currentTopic && currentHeading) {
      currentContent.push(rawLine);
    }
  }

  flushTopic();

  return topics;
}

// Structure-aware chunking, ported from the internal knowledge agent's markdown chunker.

type BlockKind = 'paragraph' | 'list' | 'table';
interface Block { kind: BlockKind; text: string }
/** A chunk under construction: bodies grouped under the section heading they came from. */
interface Draft {
  parts: Array<{ heading: string; body: string }>;
  table: boolean;
  overlap: boolean;
  kind: BlockKind;
  /** Set on table pieces: stable table id plus this piece's position. */
  tablePart?: { id: string; part: number; total: number };
}

const LIST_ITEM = /^(\s*)([-+*]|\d+[.)])\s+/;
const SEPARATORS: Array<string | RegExp> = ['\n\n', '\n', SENTENCE_BOUNDARY, ' '];

function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.includes('|') && trimmed.replace(/^\||\|$/g, '').split('|').every(cell => /^\s*:?-+:?\s*$/.test(cell));
}

/** Split section text into paragraph, list, and table blocks. */
function parseBlocks(text: string): Block[] {
  const lines = text.split('\n');
  const blocks: Block[] = [];
  const separatorFollows = (index: number) => {
    let next = index + 1;
    while (next < lines.length && !lines[next].trim()) next += 1;
    return next < lines.length && isTableSeparator(lines[next]);
  };
  const indent = (line: string) => line.length - line.trimStart().length;

  for (let i = 0; i < lines.length;) {
    if (!lines[i].trim()) { i += 1; continue; }
    const start = i;
    let kind: BlockKind = 'paragraph';

    if (lines[i].includes('|') && separatorFollows(i)) {
      kind = 'table';
      while (i < lines.length && lines[i].trim() && (lines[i].includes('|') || isTableSeparator(lines[i]))) i += 1;
    } else if (LIST_ITEM.test(lines[i])) {
      kind = 'list';
      const base = indent(lines[i]);
      i += 1;
      while (i < lines.length && lines[i].trim() && (LIST_ITEM.test(lines[i]) || indent(lines[i]) > base)) i += 1;
    } else {
      i += 1;
      while (i < lines.length && lines[i].trim() && !LIST_ITEM.test(lines[i]) && !(lines[i].includes('|') && separatorFollows(i))) i += 1;
    }
    blocks.push({ kind, text: lines.slice(start, i).join('\n') });
  }

  return blocks;
}

/** Last resort for text without separators: cut by length, preferring a space. */
function hardSplit(text: string, budget: number, length: ChunkOptions['length']): string[] {
  const pieces: string[] = [];
  let rest = text;

  while (rest) {
    let end = Math.min(rest.length, budget * 4);
    while (end > 1 && length(rest.slice(0, end)) > budget) end = Math.floor(end * 0.8);
    const space = rest.lastIndexOf(' ', end);
    if (end < rest.length && space > 0) end = space;
    pieces.push(rest.slice(0, end).trim());
    rest = rest.slice(end).trim();
  }

  return pieces.filter(Boolean);
}

/** Recursive splitter: paragraphs, then lines, then sentences, then words. */
function splitText(text: string, budget: number, length: ChunkOptions['length'], level = 0): string[] {
  if (length(text) <= budget) return [text];
  if (level >= SEPARATORS.length) return hardSplit(text, budget, length);

  const separator = SEPARATORS[level];
  const parts = text.split(separator).map(part => part.trim()).filter(Boolean);
  if (parts.length < 2) return splitText(text, budget, length, level + 1);

  const joiner = typeof separator === 'string' ? separator : ' ';
  const out: string[] = [];
  let current = '';

  for (const part of parts) {
    for (const piece of splitText(part, budget, length, level + 1)) {
      const candidate = current ? `${current}${joiner}${piece}` : piece;
      if (current && length(candidate) > budget) {
        out.push(current);
        current = piece;
      } else {
        current = candidate;
      }
    }
  }

  if (current) out.push(current);
  return out;
}

/** Pack list items into pieces; an item over budget is split as text. */
function splitList(text: string, budget: number, length: ChunkOptions['length']): string[] {
  if (length(text) <= budget) return [text];

  const items: string[] = [];
  for (const line of text.split('\n')) {
    if (LIST_ITEM.test(line) || items.length === 0) items.push(line);
    else items[items.length - 1] += `\n${line}`;
  }

  const out: string[] = [];
  let current = '';
  for (const item of items) {
    if (length(item) > budget) {
      if (current) out.push(current);
      current = '';
      out.push(...splitText(item, budget, length));
    } else if (current && length(`${current}\n${item}`) > budget) {
      out.push(current);
      current = item;
    } else {
      current = current ? `${current}\n${item}` : item;
    }
  }

  if (current) out.push(current);
  return out;
}

/** Split a table by rows, repeating its header row in every piece. */
function splitTable(text: string, budget: number, length: ChunkOptions['length']): string[] {
  if (length(text) <= budget) return [text];

  const lines = text.split('\n');
  const hasSeparator = lines.length > 1 && isTableSeparator(lines[1]);
  let base = hasSeparator ? `${lines[0]}\n${lines[1]}` : lines[0];
  if (length(base) + 1 > budget) base = '';
  const rows = lines.slice(hasSeparator ? 2 : 1);
  const room = Math.max(1, budget - (base ? length(base) + 1 : 0));

  const out: string[] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length > 0) out.push([base, ...current].filter(Boolean).join('\n'));
    current = [];
  };

  for (const row of rows) {
    if (length([...current, row].join('\n')) > room) flush();
    if (length(row) > room) {
      for (const piece of splitText(row, room, length)) out.push([base, piece].filter(Boolean).join('\n'));
    } else {
      current.push(row);
    }
  }

  flush();
  return out.length > 0 ? out : [text];
}

/** Trailing whole sentences of text totalling at most maxTokens; empty if none fit. */
function tailSentences(text: string, maxTokens: number, length: ChunkOptions['length']): string {
  const tail: string[] = [];
  let total = 0;

  for (const sentence of text.split(SENTENCE_BOUNDARY).reverse()) {
    total += length(sentence);
    if (total > maxTokens) break;
    tail.unshift(sentence);
  }

  return tail.join(' ');
}

/** Render a draft: `# Topic`, then each section heading once, then bodies. */
function render(topicTitle: string, parts: Draft['parts']): string {
  let out = `# ${topicTitle}`;
  let heading = '';

  for (const [index, part] of parts.entries()) {
    if (part.heading !== heading) {
      out += index === 0 ? `\n## ${part.heading}\n\n${part.body}` : `\n\n## ${part.heading}\n\n${part.body}`;
      heading = part.heading;
    } else {
      out += `\n\n${part.body}`;
    }
  }

  return out;
}

/** Split every section into block pieces that each fit the budget alongside their heading. */
function emitDrafts(topic: KnowledgeBaseTopic, options: ChunkOptions): Draft[] {
  const { maxChunkTokens: max, length } = options;
  const drafts: Draft[] = [];

  for (const section of topic.sections) {
    const budget = Math.max(1, max - length(`# ${topic.title}\n## ${section.heading}\n\n`));
    // Leave room for the overlap tail, otherwise full pieces could never receive one.
    const textBudget = Math.max(Math.ceil(budget / 2), budget - options.overlapTokens);

    for (const block of parseBlocks(section.content)) {
      const pieces = block.kind === 'table'
        ? splitTable(block.text, budget, length)
        : block.kind === 'list'
          ? splitList(block.text, textBudget, length)
          : splitText(block.text, textBudget, length);

      const id = createHash('sha256').update(block.text).digest('hex').slice(0, 16);
      pieces.forEach((body, i) => {
        drafts.push({
          parts: [{ heading: section.heading, body }],
          table: block.kind === 'table',
          overlap: false,
          kind: block.kind,
          tablePart: block.kind === 'table' ? { id, part: i + 1, total: pieces.length } : undefined,
        });
      });
    }
  }

  return drafts;
}

/** Greedily merge neighbours: same section when it fits, or two small sections. Tables stay alone. */
function mergeDrafts(topicTitle: string, drafts: Draft[], options: ChunkOptions): Draft[] {
  const { maxChunkTokens: max, length } = options;
  const merged: Draft[] = [];

  for (const draft of drafts) {
    const current = merged.at(-1);

    if (current && !current.table && !draft.table) {
      const sameSection = current.parts.at(-1)!.heading === draft.parts[0].heading;
      const bothSmall = length(render(topicTitle, current.parts)) <= max / 2
        && length(render(topicTitle, draft.parts)) <= max / 2;

      if (sameSection || bothSmall) {
        const parts = [...current.parts, ...draft.parts];
        if (length(render(topicTitle, parts)) <= max) {
          merged[merged.length - 1] = { ...current, parts };
          continue;
        }
      }
    }

    merged.push(draft);
  }

  return merged;
}

/** Carry the previous chunk's closing sentences into the next one when they continue the same section. */
function addOverlap(topicTitle: string, drafts: Draft[], options: ChunkOptions): void {
  const { maxChunkTokens: max, overlapTokens, length } = options;
  const lastBodies = drafts.map(draft => draft.parts.at(-1)!.body);

  for (let i = 1; i < drafts.length; i += 1) {
    const [previous, current] = [drafts[i - 1], drafts[i]];
    if (previous.table || current.table) continue;
    if (previous.parts.at(-1)!.heading !== current.parts[0].heading) continue;

    const tail = tailSentences(lastBodies[i - 1], overlapTokens, length);
    if (!tail || tail === lastBodies[i - 1]) continue;

    const [first, ...rest] = current.parts;
    const parts = [{ ...first, body: `${tail}\n\n${first.body}` }, ...rest];
    if (length(render(topicTitle, parts)) > max) continue;

    drafts[i] = { ...current, parts, overlap: true };
  }
}

/** Build embedding chunks for one parsed knowledge-base topic. */
function chunkTopic(topic: KnowledgeBaseTopic, options: ChunkOptions): KnowledgeBaseChunk[] {
  const drafts = mergeDrafts(topic.title, emitDrafts(topic, options), options);
  addOverlap(topic.title, drafts, options);

  // A section that ended up in several chunks is labelled "(k/n)", which ingest reads back as `parts`.
  const total = new Map<string, number>();
  for (const draft of drafts) {
    for (const heading of new Set(draft.parts.map(part => part.heading))) total.set(heading, (total.get(heading) ?? 0) + 1);
  }
  const seen = new Map<string, number>();

  return drafts.map((draft, index) => {
    const content = render(topic.title, draft.parts);
    const sections = [...new Set(draft.parts.map(part => part.heading))].map(heading => {
      const k = (seen.get(heading) ?? 0) + 1;
      seen.set(heading, k);
      return total.get(heading)! > 1 ? `${heading} (${k}/${total.get(heading)})` : heading;
    });

    const headings = [...new Set(draft.parts.map(part => part.heading))];
    const metadata: Record<string, unknown> = {
      heading: headings[0],
      heading_path: [`# ${topic.title}`, `## ${headings[0]}`],
      level: 2,
      parent_section: topic.title,
      block_kind: draft.kind,
      char_count: content.length,
      token_count: options.length(content),
      token_limit: options.maxChunkTokens,
      chunk_index: index,
    };
    if (draft.tablePart) Object.assign(metadata, { table_id: draft.tablePart.id, table_part: draft.tablePart.part, table_total: draft.tablePart.total });
    if (draft.overlap) metadata.overlap_with_previous = true;
    if (headings.length > 1) metadata.merged_heading_paths = headings.map(heading => [`# ${topic.title}`, `## ${heading}`]);

    return { index: index + 1, topicTitle: topic.title, sections, content, wordCount: wordCount(content), hasOverlap: draft.overlap, metadata };
  });
}

/** Parse Markdown and return globally indexed embedding chunks. */
export function processKnowledgeBase(
  markdown: string,
  options: Partial<ChunkOptions> = {},
): KnowledgeBaseChunk[] {
  const resolved = { ...DEFAULT_CHUNK_OPTIONS, ...options };

  return parseKnowledgeBase(markdown)
    .flatMap(topic => chunkTopic(topic, resolved))
    .map((chunk, index) => ({ ...chunk, index: index + 1 }));
}
