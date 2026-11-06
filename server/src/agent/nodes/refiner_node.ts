import { AIMessage } from '@langchain/core/messages';

import { agentConfig } from '../../config/agent_config.js';
import { logger } from '../../config/logger.js';
import { putCachedAnswer } from '../../service/answer_cache.js';
import { messageText } from '../message_text.js';
import { chatModel } from '../model.js';
import { buildRefinerPrompt } from '../prompt/prompt_loader.js';
import type { RetrievedChunk } from '../../service/retrieve.js';
import type { AgentState } from '../state.js';

/** Refiner-off answer: top retrieved passages verbatim, no scores or ids. */
export function passthroughAnswer(citations: RetrievedChunk[], limit = 3): AIMessage {
  return new AIMessage(citations.slice(0, limit).map(c => `### ${c.topic}\n\n${c.text}`).join('\n\n'));
}

export async function refinerNode(state: AgentState) {
  logger.info('refiner node start');
  const { citations, retrievedContext } = state;
  const response = agentConfig.refiner.enabled
    ? await chatModel.invoke([
      { role: 'system', content: await buildRefinerPrompt(retrievedContext, state.query) },
      { role: 'user', content: 'Answer the user question using only approved retrieved evidence.' },
    ])
    : passthroughAnswer(citations);
  const refinedContext = messageText(response);

  if (citations.length) {
    const rawQuery = messageText([...state.messages].reverse().find(message => message.type === 'human')!);
    // Raw-query key is first-turn only: later raw queries depend on history.
    await putCachedAnswer(state.firstTurn ? [rawQuery, state.query] : [state.query], refinedContext, citations)
      .catch(error => logger.warn({ err: error }, 'answer cache write failed'));
  }

  logger.info({ mode: 'rag', retrievedContext, refinedContext }, 'refiner node done');
  return { messages: [response], refinedContext };
}
