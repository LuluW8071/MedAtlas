import assert from 'node:assert/strict';
import test from 'node:test';

import { parseFollowups } from '../src/agent/nodes/followup_node.js';
import { passthroughAnswer } from '../src/agent/nodes/refiner_node.js';

test('NONE and empty output give no followups', () => {
  assert.deepEqual(parseFollowups('NONE', 3), []);
  assert.deepEqual(parseFollowups(' none. \n\n', 3), []);
  assert.deepEqual(parseFollowups('', 3), []);
});

test('strips bullets, numbering and quotes; drops case-insensitive duplicates', () => {
  const text = '1. What causes anemia?\n- "what causes ANEMIA?"\n* How is it treated?\n(3) Is it curable?';
  assert.deepEqual(parseFollowups(text, 5), ['What causes anemia?', 'How is it treated?', 'Is it curable?']);
});

test('drops questions already asked in history', () => {
  assert.deepEqual(parseFollowups('What is gout?\nHow is gout treated?', 3, ['what is gout?']), ['How is gout treated?']);
});

test('caps at count', () => {
  assert.deepEqual(parseFollowups('a?\nb?\nc?\nd?', 2), ['a?', 'b?']);
});

test('passthroughAnswer formats top passages without scores or ids', () => {
  const chunk = (n: number) => ({ id: `id${n}`, score: 0.9, text: `text ${n}`, topic: `Topic ${n}`, subheadings: [], parts: 1 });
  const msg = passthroughAnswer([1, 2, 3, 4].map(chunk));
  const text = msg.content as string;
  assert.match(text, /### Topic 1\n\ntext 1/);
  assert.doesNotMatch(text, /Topic 4|id1|0\.9/);
});
