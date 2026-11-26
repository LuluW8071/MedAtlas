import { contextMessages } from '../context.js';
import { chatModel } from '../model.js';
import { loadPrompt } from '../prompt/prompt_loader.js';
import type { AgentState } from '../state.js';

export async function chitchatNode(state: AgentState) {
  const response = await chatModel.invoke([
    { role: 'system', content: await loadPrompt('chitchat_node.md') },
    ...contextMessages(state),
  ]);
  return { messages: [response], citations: [] };
}
