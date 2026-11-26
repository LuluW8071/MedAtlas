import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { retrieveChunks } from '../../service/retrieve.js';
import { formatRetrieval } from '../citations.js';
import type { AgentState } from '../state.js';

export async function retrieveNode(state: AgentState) {
  try {
    const citations = await retrieveChunks(state.query, env.topK, { topicName: state.topicName });
    return { citations, retrievedContext: formatRetrieval(citations) };
  } catch (error) {
    // An empty result makes the writer say evidence is unavailable instead of failing the turn.
    logger.error({ err: error, query: state.query }, 'retrieval failed');
    return { citations: [], retrievedContext: formatRetrieval([]) };
  }
}
