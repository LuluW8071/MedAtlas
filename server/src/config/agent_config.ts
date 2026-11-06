/** Feature switches for the agent graph. Edit here and restart the server. */
export const agentConfig = {
  clarify: { enabled: true },
  followup: { enabled: true, count: 1 },
  /** false: skip the answer-writing LLM and return the top retrieved passages verbatim. */
  refiner: { enabled: true },
  /** Embedding-similarity answer cache (Redis vector sets); exact-match cache always stays on. */
  semanticCache: { enabled: true, threshold: 0.92 },
} as const;
