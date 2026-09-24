import { tool } from '@langchain/core/tools';
import { z } from 'zod';

import { logger } from '../../config/logger.js';
import { retrieveChunks } from '../../service/retrieve.js';
import { serializeRetrieval } from '../citations.js';

export const ragRetrievalTool = tool(
  async ({ query, topK }) => {
    logger.info({ query, topK }, 'rag tool called');
    try {
      const chunks = await retrieveChunks(query, topK ?? 5);
      return serializeRetrieval(chunks);
    } catch (error) {
      logger.error({ err: error, query }, 'rag tool retrieval failed');
      return serializeRetrieval([]);
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
