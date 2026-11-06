import { ChatOpenAI } from '@langchain/openai';

type Effort = 'none' | 'low';

/** gpt-6-luna reasoning models reject `temperature`, so none is passed. */
function createModel(reasoningEffort: Effort) {
  return new ChatOpenAI({
    model: process.env.OPENAI_MODEL ?? 'gpt-6-luna',
    // Raw kwargs: the typed `reasoning` option is dropped for chat completions, and tools need an explicit 'none'.
    modelKwargs: { reasoning_effort: reasoningEffort, max_completion_tokens: 1024 },
    apiKey: process.env.OPENAI_API_KEY,
    configuration: process.env.OPENAI_BASE_URL
      ? { baseURL: process.env.OPENAI_BASE_URL }
      : undefined,
  });
}

/** Every node except the router: no reasoning. */
export const chatModel = createModel('none');

/** Router only: low reasoning for intent, clarify and negation-preserving rewrites. */
export const routerModel = createModel('low');
