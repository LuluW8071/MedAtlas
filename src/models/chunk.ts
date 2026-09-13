/** Define data models exchanged by Markdown chunking and ingestion services. */

/** Parsed Markdown section belonging to one knowledge-base topic. */
export interface KnowledgeBaseSection {
  topicTitle: string;
  heading: string;
  content: string;
  wordCount: number;
}

/** Parsed knowledge-base topic containing ordered sections. */
export interface KnowledgeBaseTopic {
  title: string;
  sections: KnowledgeBaseSection[];
}

/** Chunk ready for embedding and vector-store ingestion. */
export interface KnowledgeBaseChunk {
  index: number;
  topicTitle: string;
  sections: string[];
  content: string;
  wordCount: number;
  hasOverlap: boolean;
}

/** Intermediate section piece produced during Markdown splitting. */
export interface SectionPiece {
  section: KnowledgeBaseSection;
  hasOverlap: boolean;
}
