import assert from 'node:assert/strict';
import test from 'node:test';
import { matchTopicTitles } from '../src/service/topic_match.js';

const titles = ['Cancer', 'Breast cancer', 'Heart failure', 'Anemia, Aplastic', 'Gallstones', 'Treatment'];

test('matches titles named in the query, longest title first', () => {
  assert.deepEqual(matchTopicTitles('breast cancer treatment options', titles), ['Breast cancer', 'Cancer', 'Treatment']);
});

test('ignores word order and punctuation', () => {
  assert.deepEqual(matchTopicTitles('what is aplastic anemia?', titles), ['Anemia, Aplastic']);
});

test('tolerates one typo in long words only', () => {
  assert.deepEqual(matchTopicTitles('gallstone pain', titles), ['Gallstones']);
  assert.deepEqual(matchTopicTitles('cancr', titles), []);
});

test('requires every title word and caps at three', () => {
  assert.deepEqual(matchTopicTitles('heart attack', titles), []);
  assert.equal(matchTopicTitles('cancer breast heart failure gallstones treatment', titles).length, 3);
});
