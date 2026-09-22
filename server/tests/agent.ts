import { BaseMessage, HumanMessage } from '@langchain/core/messages';

import { logger } from '../src/config/logger.js';
import { getAgentGraph } from '../src/agent/graph.js';

function finalText(messages: BaseMessage[]): string {
  const response = [...messages].reverse().find(message => message.type === 'ai');
  if (!response) return '';
  if (typeof response.content === 'string') return response.content;
  return response.content
    .map(part => typeof part === 'string' ? part : 'text' in part ? part.text : '')
    .join('');
}

async function main(): Promise<void> {
  const query = process.argv.slice(2).join(' ') || 'Hi how are you also can you tell me about who is father of medicine?';
  const agentGraph = await getAgentGraph();
  logger.info({ query }, 'agent start');
  const stream = await agentGraph.stream(
    { messages: [new HumanMessage(query)] },
    { configurable: { thread_id: 'cli' }, streamMode: 'updates' },
  );
  let messages: BaseMessage[] = [];
  for await (const chunk of stream) {
    logger.info(chunk, 'graph step');
    for (const nodeState of Object.values(chunk)) {
      const nodeMessages = (nodeState as { messages?: BaseMessage[] }).messages;
      if (nodeMessages) messages = nodeMessages;
    }
  }
  logger.info({ response: finalText(messages) }, 'final response');
  await logger.flush();
}

if (process.argv[1]?.endsWith('/tests/agent.ts')) {
  void main().catch(error => {
    logger.error({ error }, 'agent execution failed');
    process.exitCode = 1;
  });
}
