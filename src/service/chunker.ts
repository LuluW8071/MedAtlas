/** Parse Markdown knowledge bases into embedding-ready chunks. */
import type {
  KnowledgeBaseChunk,
  KnowledgeBaseSection,
  KnowledgeBaseTopic,
  SectionPiece,
} from '../models/chunk.js';

// Configuration.

const MAX_CHUNK_WORDS = 950;
const MARKDOWN_SPLIT_WORDS = 850;
const OVERLAP_WORDS = 75;
const MAX_DISTINCT_SECTIONS = 3;

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

    const content = normalizeWhitespace(currentContent.join("\n"));

    if (!content) {
      currentContent = [];
      return;
    }

    currentTopic.sections.push({
      topicTitle: currentTopic.title,
      heading: toTitleCase(currentHeading),
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
        title: toTitleCase(rawTitle),
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

/** Split text into overlapping chunks limited by word count. */
function splitByWords(
  text: string,
  maxWords: number,
  overlapWords: number,
): string[] {
  const words = text
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length <= maxWords) {
    return [text.trim()];
  }

  const chunks: string[] = [];

  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + maxWords, words.length);

    chunks.push(words.slice(start, end).join(" "));

    if (end >= words.length) {
      break;
    }

    start = end - overlapWords;
  }

  return chunks;
}

/** Split oversized section content into numbered section pieces. */
function recursivelySplitSection(
  section: KnowledgeBaseSection,
  maxWords: number = MARKDOWN_SPLIT_WORDS,
  overlapWords: number = OVERLAP_WORDS,
): KnowledgeBaseSection[] {
  if (section.wordCount <= maxWords) {
    return [section];
  }

  const pieces = splitByWords(
    section.content,
    maxWords,
    overlapWords,
  );

  return pieces.map((content, index): KnowledgeBaseSection => ({
    topicTitle: section.topicTitle,

    heading:
      pieces.length > 1
        ? `${section.heading} (${index + 1}/${pieces.length})`
        : section.heading,

    content,

    wordCount: wordCount(content),
  }));
}

/** Split section Markdown blocks while preserving paragraph boundaries. */
function splitSectionByMarkdown(section: KnowledgeBaseSection): SectionPiece[] {
  const blocks = section.content
    .split(/\n\s*\n/)
    .map(block => block.trim())
    .filter(Boolean);

  const pieces: Array<{ content: string; hasOverlap: boolean }> = [];
  let currentBlocks: string[] = [];
  let currentWords = 0;

  /** Flush accumulated Markdown blocks into one section piece. */
  function flushMarkdownBlocks() {
    if (currentBlocks.length === 0) return;

    pieces.push({
      content: currentBlocks.join("\n\n"),
      hasOverlap: false,
    });
    currentBlocks = [];
    currentWords = 0;
  }

  for (const block of blocks) {
    const blockWords = wordCount(block);

    if (blockWords > MARKDOWN_SPLIT_WORDS) {
      flushMarkdownBlocks();
      pieces.push(
        ...recursivelySplitSection(
          {
            ...section,
            content: block,
            wordCount: blockWords,
          },
          MARKDOWN_SPLIT_WORDS,
          OVERLAP_WORDS,
        ).map(piece => ({
          content: piece.content,
          hasOverlap: true,
        })),
      );
      continue;
    }

    if (
      currentWords > 0 &&
      currentWords + blockWords > MARKDOWN_SPLIT_WORDS
    ) {
      flushMarkdownBlocks();
    }

    currentBlocks.push(block);
    currentWords += blockWords;
  }

  flushMarkdownBlocks();

  const needsLabels = pieces.length > 1;

  return pieces.map((piece, index) => ({
    section: {
      ...section,
      heading: needsLabels
        ? `${section.heading} (${index + 1}/${pieces.length})`
        : section.heading,
      content: piece.content,
      wordCount: wordCount(piece.content),
    },
    hasOverlap: piece.hasOverlap,
  }));
}

/** Build embedding chunks for one parsed knowledge-base topic. */
function chunkTopic(topic: KnowledgeBaseTopic): KnowledgeBaseChunk[] {
  const chunks: KnowledgeBaseChunk[] = [];

  let currentContent: string[] = [];
  let currentSections: string[] = [];
  let currentSectionKeys = new Set<string>();
  let currentHasOverlap = false;

  /** Flush accumulated sections into one embedding chunk. */
  function flushCurrent() {
    if (currentContent.length === 0) return;

    const content = `# ${topic.title}\n\n${currentContent.join("\n\n")}`;

    chunks.push({
      index: chunks.length + 1,
      topicTitle: topic.title,
      sections: [...currentSections],
      content,
      wordCount: wordCount(content),
      hasOverlap: currentHasOverlap,
    });

    currentContent = [];
    currentSections = [];
    currentSectionKeys = new Set<string>();
    currentHasOverlap = false;
  }

  for (const originalSection of topic.sections) {
    for (const { section, hasOverlap } of splitSectionByMarkdown(
      originalSection,
    )) {
      const sectionKey = originalSection.heading;
      const renderedSection = `## ${section.heading}\n\n${section.content}`;
      const candidate = `# ${topic.title}\n\n${[
        ...currentContent,
        renderedSection,
      ].join("\n\n")}`;

      if (
        currentContent.length > 0 &&
        (wordCount(candidate) > MAX_CHUNK_WORDS ||
          (!currentSectionKeys.has(sectionKey) &&
            currentSectionKeys.size >= MAX_DISTINCT_SECTIONS))
      ) {
        flushCurrent();
      }

      currentContent.push(renderedSection);
      currentSections.push(section.heading);
      currentSectionKeys.add(sectionKey);
      currentHasOverlap ||= hasOverlap;
    }
  }

  // Flush remaining content.

  if (currentContent.length > 0) {
    flushCurrent();
  }

  return chunks;
}

/** Ensure every chunk starts with its topic heading. */
function addTopicHeaders(chunks: KnowledgeBaseChunk[]): KnowledgeBaseChunk[] {
  return chunks.map(chunk => {
    if (!chunk.content.startsWith(`# ${chunk.topicTitle}`)) {
      const content =
        `# ${chunk.topicTitle}\n\n${chunk.content}`;

      return {
        ...chunk,
        content,
        wordCount: wordCount(content),
      };
    }

    return chunk;
  });
}

/** Parse Markdown and return globally indexed embedding chunks. */
export function processKnowledgeBase(markdown: string): KnowledgeBaseChunk[] {
  const topics = parseKnowledgeBase(markdown);

  const allChunks: KnowledgeBaseChunk[] = [];

  for (const topic of topics) {
    const chunks = chunkTopic(topic);

    allChunks.push(...addTopicHeaders(chunks));
  }

  return allChunks.map((chunk, index) => ({
    ...chunk,
    index: index + 1,
  }));
}
