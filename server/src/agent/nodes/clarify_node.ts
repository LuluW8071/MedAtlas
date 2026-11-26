import { contextMessages } from '../context.js';
import { chatModel } from '../model.js';
import { loadPrompt } from '../prompt/prompt_loader.js';
import type { AgentState } from '../state.js';

/** Ask one short clarifying question; streams as a normal AI message and is never cached. */
export async function clarifyNode(state: AgentState) {
  const response = await chatModel.invoke([
    { role: 'system', content: await loadPrompt('clarify_node.md') },
    ...contextMessages(state),
  ]);
  // Marker read by the router shortcuts: a short reply to this question is an answer, not small talk.
  response.additional_kwargs = { ...response.additional_kwargs, clarification: true };
  return { messages: [response], citations: [] };
}
