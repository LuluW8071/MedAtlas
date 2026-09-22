import { tool } from '@langchain/core/tools';
import { z } from 'zod';

import { logger } from '../../config/logger.js';
import { retrieveChunks } from '../../service/retrieve.js';

export const ragRetrievalTool = tool(
  async ({ query, topK }) => {
    logger.info({ query, topK }, 'rag tool called');
    try {
      const chunks = await retrieveChunks(query, topK ?? 5);
      if (chunks.length === 0) return `No knowledge-base context found for: ${query}`;
      return chunks
        .map(chunk => `[${chunk.topic} | score ${chunk.score.toFixed(3)}]\n${chunk.text}`)
        .join('\n\n');
    } catch (error) {
      logger.error({ err: error, query }, 'rag tool retrieval failed');
      return `Knowledge-base retrieval failed for: ${query}. Answer from general knowledge and note context unavailable.`;
    }
  },
  {
    name: 'rag_retrieval',
    description: 'Retrieve relevant context from the MedAtlas knowledge base.',
    schema: z.object({
      query: z.string().describe('User question to search for'),
      topK: z.number().int().min(1).max(20).optional().describe('Number of chunks to retrieve'),
    }),
  },
);
