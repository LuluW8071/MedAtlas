import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { after } from 'node:test';

import './helper/test_env.js';

import { AIMessage, HumanMessage } from '@langchain/core/messages';

import { mongoClient, getDb } from '../src/service/clients/mongo_client.js';
import { tailWithinBudget } from '../src/agent/nodes/truncate_history.js';
import { qdrant, upsertChunks } from '../src/service/clients/qdrant_client.js';
import { hybridSearch } from '../src/service/retrieve.js';
import { bumpCorpusGeneration, getCachedAnswer, putCachedAnswer } from '../src/service/answer_cache.js';
import { listConversationIds, rememberConversation } from '../src/service/conversations.js';
import { cacheLookupNode, fastCacheProbeNode } from '../src/agent/nodes/cache_nodes.js';

after(async () => {
  await qdrant.deleteCollection(process.env.QDRANT_COLLECTION!);
  await getDb().dropDatabase();
  await mongoClient.close();
});

const chunk = (id: string, text: string, topic = 'Asthma') => ({ id, score: 0, text, topic, subheadings: ['overview'], parts: 1 });

test('truncation drops oldest turns and keeps a human-first tail', () => {
  const messages = ['a'.repeat(400), 'b'.repeat(400), 'c'.repeat(400), 'd'.repeat(40)]
    .map((text, i) => Object.assign(i % 2 ? new AIMessage(text) : new HumanMessage(text), { id: String(i) }));
  const tail = tailWithinBudget(messages, 120).map(m => m.id);
  assert.deepEqual(tail, ['2', '3']); // tail starts at human message 2; AI "d" fits only with it
  assert.equal(tailWithinBudget(messages, 10_000).length, 4);
});

test('hybrid search fuses dense and BM25 legs and honours topic filter', async () => {
  const payload = (text: string, topic: string) => ({ text, topic, subheadings: ['overview'], parts: 1 });
  await upsertChunks([
    { id: randomUUID(), vector: [1, 0, 0, 0], payload: payload('Wheezing and shortness of breath are common asthma symptoms.', 'Asthma') },
    { id: randomUUID(), vector: [0, 1, 0, 0], payload: payload('Insulin helps regulate blood sugar.', 'Diabetes') },
    { id: randomUUID(), vector: [0, 0, 1, 0], payload: payload('Hypertension means high blood pressure.', 'Hypertension') },
  ]);

  // Dense vector points at Diabetes; the keyword "wheezing" only matches Asthma via BM25.
  const topics = (await hybridSearch([0, 1, 0, 0], 'wheezing', 2)).map(c => c.topic);
  assert.deepEqual(new Set(topics), new Set(['Diabetes', 'Asthma']));

  const filtered = await hybridSearch([0, 1, 0, 0], 'wheezing', 5, { topic: 'Asthma' });
  assert.deepEqual(filtered.map(c => c.topic), ['Asthma']);
});

test('cache probe hits on first turn, misses on later turns, and corpus bump invalidates', async () => {
  await putCachedAnswer(['What are asthma symptoms?'], 'Wheezing.', [chunk('1', 'x')]);
  const first = { messages: [new HumanMessage('what are ASTHMA symptoms')] } as never;
  const hit = await fastCacheProbeNode(first) as { route: string; messages: AIMessage[] };
  assert.equal(hit.route, 'cache_hit');
  assert.equal(hit.messages[0].content, 'Wheezing.');

  const later = { messages: [new HumanMessage('hi'), new AIMessage('hello'), new HumanMessage('what are asthma symptoms')] } as never;
  assert.equal((await fastCacheProbeNode(later) as { route: string }).route, '');

  assert.equal((await cacheLookupNode({ query: 'What are asthma symptoms?' } as never) as { route?: string }).route, 'cache_hit');
  await bumpCorpusGeneration();
  assert.equal(await getCachedAnswer('What are asthma symptoms?'), null);
});

test('conversations are stored per user, newest first', async () => {
  await rememberConversation('u1', 't1', 'first');
  await rememberConversation('u1', 't2', 'second');
  await rememberConversation('u2', 't3', 'other');
  assert.deepEqual((await listConversationIds('u1')).map(c => c.threadId), ['t2', 't1']);
});
