import { Annotation, MessagesAnnotation } from '@langchain/langgraph';

export const AgentState = Annotation.Root({
  ...MessagesAnnotation.spec,
  retrievedContext: Annotation<string>({
    reducer: (_, update) => update,
    default: () => '',
  }),
  refinedContext: Annotation<string>({
    reducer: (_, update) => update,
    default: () => '',
  }),
  guardrailNotice: Annotation<string>({
    reducer: (_, update) => update,
    default: () => '',
  }),
});

export type AgentState = typeof AgentState.State;
