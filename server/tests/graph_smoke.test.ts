import assert from 'node:assert/strict';
import test, { after } from 'node:test';

import './helper/test_env.js';

import { HumanMessage } from '@langchain/core/messages';

import { getAgentGraph } from '../src/agent/graph.js';
import { putCachedAnswer } from '../src/service/answer_cache.js';
import { getDb, mongoClient } from '../src/service/clients/mongo_client.js';

after(async () => {
  await getDb().dropDatabase();
  await mongoClient.close();
});

test('cached first-turn question ends at the fast probe and persists to the Mongo checkpointer', async () => {
  const citation = { id: '1', score: 1, text: 'x', topic: 'Asthma', subheadings: [], parts: 1 };
  await putCachedAnswer(['What is asthma?'], 'A chronic lung condition.', [citation]);

  const graph = await getAgentGraph();
  const config = { configurable: { thread_id: 'smoke' } };
  const result = await graph.invoke({ messages: [new HumanMessage('what is asthma')] }, config);

  assert.equal(result.messages.at(-1)?.content, 'A chronic lung condition.');
  assert.deepEqual(result.citations, [citation]);
  const saved = await graph.getState(config);
  assert.equal(saved.values.messages.length, 2);
});
