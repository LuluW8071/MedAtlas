import assert from 'node:assert/strict';
import test from 'node:test';

import { AIMessage, ToolMessage } from '@langchain/core/messages';
import { END } from '@langchain/langgraph';

import { routeAfterAgent } from '../src/agent/nodes/route_after_agent.js';

test('routes agent tool calls to shared tools node', () => {
  const state = { messages: [new AIMessage({ content: '', tool_calls: [{ name: 'book_appointment', args: {}, id: '1', type: 'tool_call' }] })] } as never;
  assert.equal(routeAfterAgent(state), 'invoke_tools');
});

test('routes agent after tool cycle to shared refiner', () => {
  const state = {
    messages: [new ToolMessage({ content: '{}', tool_call_id: '1', name: 'book_appointment' })],
  } as never;
  assert.equal(routeAfterAgent(state), 'refine_response');
});

test('ends without tool call or tool result', () => {
  const state = { messages: [new AIMessage('hello')] } as never;
  assert.equal(routeAfterAgent(state), END);
});

test('does not refine stale tool results on later turns', () => {
  const state = {
    messages: [
      new ToolMessage({ content: '{}', tool_call_id: '1', name: 'book_appointment' }),
      new AIMessage('Please provide the missing appointment time.'),
    ],
  } as never;
  assert.equal(routeAfterAgent(state), END);
});
