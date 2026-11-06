import assert from 'node:assert/strict';
import test from 'node:test';

import { routeAfterRouter } from '../src/agent/nodes/router_node.js';

test('sends each router decision to its node', () => {
  assert.equal(routeAfterRouter({ route: 'knowledge_base' } as never), 'cache_lookup');
  assert.equal(routeAfterRouter({ route: 'appointment' } as never), 'booking');
  assert.equal(routeAfterRouter({ route: 'chitchat' } as never), 'chitchat');
  assert.equal(routeAfterRouter({ route: 'clarify' } as never), 'clarify');
});

test('clarify falls back to retrieval when disabled', () => {
  assert.equal(routeAfterRouter({ route: 'clarify' } as never, false), 'cache_lookup');
  assert.equal(routeAfterRouter({ route: 'chitchat' } as never, false), 'chitchat');
});
