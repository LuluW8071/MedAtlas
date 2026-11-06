import assert from 'node:assert/strict';
import { test } from 'node:test';

import { acceptSemanticHit, cosineFromRedis, hasNegation, keyToUuid, semanticLookup, type SemanticDeps } from '../src/service/answer_cache.js';

const payload = (over: Record<string, unknown> = {}) => ({ answer: 'a', citations: [], ...over });
const deps = (over: Partial<SemanticDeps> = {}): SemanticDeps => ({
  embed: async () => [1], search: async () => [{ score: 0.95, payload: payload() }], ...over,
});

test('hasNegation', () => {
  for (const q of ['not a symptom', 'Diabetes without insulin', "don't eat", 'drugs other than aspirin', 'rather than X', 'non-smoker', 'none', 'neither', 'No fever', 'avoid salt', 'except kids', 'excluding x', 'nor y', 'never']) assert.ok(hasNegation(q), q);
  for (const q of ['nonprofit clinic', 'know your risk', 'notice a rash', 'symptoms of flu', 'nothing', 'another', 'nose bleed']) assert.ok(!hasNegation(q), q);
});

test('negated query bypasses semantic tier', async () => {
  let called = false;
  const d = deps({ embed: async () => { called = true; return [1]; } });
  assert.equal(await semanticLookup('not symptoms of flu', 3, d), null);
  assert.equal(called, false);
});

test('hit and threshold boundary', async () => {
  assert.deepEqual(await semanticLookup('flu symptoms', 3, deps()), { answer: 'a', citations: [] });
  const at = (score: number) => acceptSemanticHit({ score, payload: payload() }, 0.92);
  assert.ok(at(0.92));
  assert.equal(at(0.919), null);
});

test('malformed or missing payload -> miss', () => {
  assert.equal(acceptSemanticHit({ score: 1, payload: { citations: [] } }, 0.92), null);
  assert.equal(acceptSemanticHit(undefined, 0.92), null);
});

test('expired nearest entry is skipped for the next valid one', async () => {
  const d = deps({ search: async () => [{ score: 0.5, payload: payload() }, { score: 0.95, payload: payload({ answer: 'b' }) }] });
  assert.equal((await semanticLookup('flu', 3, d))?.answer, 'b');
});

test('embed or search failure -> null; empty query -> null', async () => {
  assert.equal(await semanticLookup('flu', 3, deps({ embed: async () => { throw new Error('down'); } })), null);
  assert.equal(await semanticLookup('flu', 3, deps({ search: async () => { throw new Error('down'); } })), null);
  assert.equal(await semanticLookup('   ', 3, deps()), null);
});

test('redis score -> cosine, and uuid', () => {
  assert.equal(cosineFromRedis(1), 1);
  assert.equal(cosineFromRedis(0.5), 0);
  assert.match(keyToUuid('a'.repeat(64)), /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
});
