/** Live smoke run of the agent graph against the ingested knowledge base. Run from server/. */
import { HumanMessage } from '@langchain/core/messages';

import { logger } from '../src/config/logger.js';
import { getAgentGraph } from '../src/agent/graph.js';
import { messageText } from '../src/agent/message_text.js';
import { mongoClient } from '../src/service/clients/mongo_client.js';

const QUERIES = [
  'What are the symptoms of strep throat?',
  'Which treatments for strep throat do NOT involve antibiotics?',
  'is it serious?',
];

async function main() {
  const graph = await getAgentGraph();
  for (const [i, query] of QUERIES.entries()) {
    const state = await graph.invoke({ messages: [new HumanMessage(query)] }, { configurable: { thread_id: `kb-smoke-${Date.now()}-${i}` } });
    logger.info({ query, route: state.route, answer: messageText(state.messages.at(-1)!).slice(0, 500), sources: state.citations?.length, followups: state.followups }, 'agent');
  }
}

main().catch(error => { logger.error({ err: error }, 'agent run failed'); process.exitCode = 1; }).finally(() => mongoClient.close().catch(() => undefined));
