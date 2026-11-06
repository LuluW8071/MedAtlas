import { Annotation, MessagesAnnotation } from '@langchain/langgraph';
import type { RetrievedChunk } from '../service/retrieve.js';

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
  citations: Annotation<RetrievedChunk[]>({
    reducer: (_, update) => update,
    default: () => [],
  }),
  route: Annotation<'' | 'cache_hit' | 'chitchat' | 'knowledge_base' | 'appointment' | 'clarify'>({
    reducer: (_, update) => update,
    default: () => '',
  }),
  /** Standalone query rewritten by the router; keys cache and retrieval. */
  query: Annotation<string>({
    reducer: (_, update) => update,
    default: () => '',
  }),
  /** Disease or treatment the user named directly (router); scopes retrieval by fuzzy title match. */
  topicName: Annotation<string>({
    reducer: (_, update) => update,
    default: () => '',
  }),
  /** Suggested follow-up questions for the last answer (RAG path only). */
  followups: Annotation<string[]>({
    reducer: (_, update) => update,
    default: () => [],
  }),
  firstTurn: Annotation<boolean>({
    reducer: (_, update) => update,
    default: () => false,
  }),
  /** Set by truncate_history: model calls then see only the verbatim tail (see contextMessages). */
  truncated: Annotation<boolean>({
    reducer: (_, update) => update,
    default: () => false,
  }),
  /** Running summary of older user turns, written off the critical path by the API layer. */
  historySummary: Annotation<string>({
    reducer: (_, update) => update,
    default: () => '',
  }),
  /** Id of the last user message folded into historySummary. */
  summaryThroughId: Annotation<string>({
    reducer: (_, update) => update,
    default: () => '',
  }),
  guardrailNotice: Annotation<string>({
    reducer: (_, update) => update,
    default: () => '',
  }),
});

export type AgentState = typeof AgentState.State;
