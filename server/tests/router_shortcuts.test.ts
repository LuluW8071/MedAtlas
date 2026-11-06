import assert from 'node:assert/strict';
import test from 'node:test';

import { AIMessage, HumanMessage } from '@langchain/core/messages';

import { hasPendingClarification, isObviousChitchat, routerShortcut } from '../src/agent/nodes/router_shortcuts.js';
import { routeAfterProbe } from '../src/agent/nodes/truncate_history_node.js';
import { newUserTurnsSince } from '../src/agent/nodes/summarize_history.js';
import type { AgentState } from '../src/agent/state.js';

const state = (messages: AgentState['messages'], followups: string[] = []) => ({ messages, followups }) as AgentState;

test('whole-message greetings, thanks and acknowledgements are chitchat', () => {
  for (const text of ['hi', 'Hello!', 'hey hello', 'thank you', 'Thanks.', 'good morning', 'ok', 'no', 'who are you?']) {
    assert.equal(isObviousChitchat(text), true, text);
  }
});

test('a greeting followed by a real question is not chitchat', () => {
  for (const text of ['hello, what causes anemia', 'ok what about the treatment', 'thanks but is it serious', '', '   ']) {
    assert.equal(isObviousChitchat(text), false, text);
  }
});

test('an exact follow-up click skips the router LLM and goes to retrieval', () => {
  const followup = 'What causes strep throat?';
  const shortcut = routerShortcut(state([new HumanMessage('hi'), new AIMessage('Hello'), new HumanMessage(followup)], [followup]));
  assert.deepEqual(shortcut, { route: 'knowledge_base', query: followup });
});

test('an edited follow-up still goes to the router LLM', () => {
  assert.equal(routerShortcut(state([new HumanMessage('What causes strep throat in kids?')], ['What causes strep throat?'])), null);
});

test('a reply to a clarifying question defers to the router even when it looks like small talk', () => {
  const messages = [new HumanMessage('is it serious?'), new AIMessage({ content: 'About what?', additional_kwargs: { clarification: true } }), new HumanMessage('no')];
  assert.equal(hasPendingClarification(messages), true);
  assert.equal(routerShortcut(state(messages)), null);
  assert.equal(routerShortcut(state([new HumanMessage('no')]))?.route, 'chitchat');
});

test('only an over-budget transcript passes through truncate_history', () => {
  const small = { route: '', messages: [new HumanMessage('hi')] } as unknown as AgentState;
  const huge = { route: '', messages: [new HumanMessage('x'.repeat(40_000))] } as unknown as AgentState;
  assert.equal(routeAfterProbe(small), 'router');
  assert.equal(routeAfterProbe(huge), 'truncate_history');
  assert.equal(routeAfterProbe({ route: 'cache_hit', messages: [] } as unknown as AgentState), 'hit');
});

test('summary folds only user turns after the watermark', () => {
  const messages = ['q1', 'q2', 'q3'].flatMap((text, i) => [
    Object.assign(new HumanMessage(text), { id: `h${i}` }),
    Object.assign(new AIMessage(`a${i}`), { id: `a${i}` }),
  ]);
  assert.deepEqual(newUserTurnsSince(messages, '').map(t => t.text), ['q1', 'q2', 'q3']);
  assert.deepEqual(newUserTurnsSince(messages, 'h1').map(t => t.text), ['q3']);
});
