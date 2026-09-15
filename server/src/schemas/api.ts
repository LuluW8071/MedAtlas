import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

export const errorSchema = z.object({
  error: z.string(),
});

export const apiHealthSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('api'),
});

export const pineconeHealthSchema = z.object({
  status: z.string(),
  service: z.literal('pinecone'),
  error: z.string().optional(),
});

export const namespaceSchema = z.object({
  name: z.string(),
  recordCount: z.number().int().nonnegative(),
});

export const namespaceListSchema = z.object({
  namespaces: z.array(namespaceSchema),
});

export const namespaceParamsSchema = z.object({
  namespace: z.string().min(1),
});

export const retrieveRequestSchema = z.object({
  query: z.string().refine(value => value.trim().length > 0, 'must be a non-empty string'),
  subheadings: z.array(z.string()).optional(),
  topic: z.string().optional(),
  topK: z.number().int().min(1).max(20).optional(),
});

export const retrievedChunkSchema = z.object({
  id: z.string(),
  score: z.number(),
  text: z.string(),
  topic: z.string(),
  subheadings: z.array(z.string()),
  parts: z.number(),
});

export const retrieveResponseSchema = z.object({
  query: z.string(),
  results: z.array(retrievedChunkSchema),
});

export const ingestResponseSchema = z.object({
  message: z.string(),
  chunks: z.number().int().nonnegative(),
});

export type RetrieveRequest = z.infer<typeof retrieveRequestSchema>;
