/** Define data models exchanged by Knowledge Base retrieval service. */
import type { RecordMetadata } from '@pinecone-database/pinecone';
 
/** Metadata stored alongside each embedded knowledge-base chunk in Pinecone. */
export interface KnowledgeBaseMetadata extends RecordMetadata {
  text: string;
  topic: string;    
  subheadings: string[];  // subheadings useful for filtering
  parts: number;
  score: number;          // similarity score 
}
