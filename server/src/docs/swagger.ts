import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import {
  apiHealthSchema,
  errorSchema,
  ingestResponseSchema,
  namespaceListSchema,
  namespaceParamsSchema,
  namespaceSchema,
  pineconeHealthSchema,
  retrieveRequestSchema,
  retrieveResponseSchema,
} from '../schemas/api.js';

const registry = new OpenAPIRegistry();

const ingestRequestSchema = z.object({
  file: z.string().openapi({ format: 'binary' }),
});

registry.register('Error', errorSchema);
registry.register('ApiHealth', apiHealthSchema);
registry.register('PineconeHealth', pineconeHealthSchema);
registry.register('Namespace', namespaceSchema);
registry.register('NamespaceList', namespaceListSchema);
registry.register('RetrieveRequest', retrieveRequestSchema);
registry.register('RetrieveResponse', retrieveResponseSchema);
registry.register('IngestResponse', ingestResponseSchema);

registry.registerPath({
  method: 'get',
  path: '/health',
  tags: ['Health'],
  summary: 'Get API health',
  responses: {
    200: {
      description: 'API is healthy',
      content: { 'application/json': { schema: apiHealthSchema } },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/pinecone/health',
  tags: ['Health'],
  summary: 'Check Pinecone health',
  responses: {
    200: {
      description: 'Pinecone is available',
      content: { 'application/json': { schema: pineconeHealthSchema } },
    },
    503: { description: 'Pinecone unavailable' },
  },
});

registry.registerPath({
  method: 'get',
  path: '/pinecone/collections',
  tags: ['Pinecone'],
  summary: 'List Pinecone namespaces',
  responses: {
    200: {
      description: 'Pinecone namespaces',
      content: { 'application/json': { schema: namespaceListSchema } },
    },
    500: { description: 'Namespace listing failed' },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/pinecone/collections/{namespace}',
  tags: ['Pinecone'],
  summary: 'Delete Pinecone namespace vectors',
  request: {
    params: namespaceParamsSchema,
  },
  responses: {
    204: { description: 'Namespace vectors deleted' },
    500: { description: 'Namespace deletion failed' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/pinecone/ingest',
  tags: ['Pinecone'],
  summary: 'Ingest a Markdown or text document',
  request: {
    body: {
      content: {
        'multipart/form-data': { schema: ingestRequestSchema },
      },
      required: true,
    },
  },
  responses: {
    201: {
      description: 'Document ingested successfully',
      content: { 'application/json': { schema: ingestResponseSchema } },
    },
    400: { description: 'Missing, unsupported, or invalid document' },
    500: { description: 'Ingestion failed' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/pinecone/retrieve',
  tags: ['Pinecone'],
  summary: 'Retrieve knowledge-base chunks',
  request: {
    body: {
      content: { 'application/json': { schema: retrieveRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'Matching knowledge-base chunks',
      content: { 'application/json': { schema: retrieveResponseSchema } },
    },
    400: {
      description: 'Invalid retrieval request',
      content: { 'application/json': { schema: errorSchema } },
    },
    500: {
      description: 'Retrieval failed',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/docs',
  tags: ['Documentation'],
  summary: 'Open Swagger UI',
  responses: { 200: { description: 'Swagger UI' } },
});

registry.registerPath({
  method: 'get',
  path: '/docs.json',
  tags: ['Documentation'],
  summary: 'Get OpenAPI document',
  responses: { 200: { description: 'OpenAPI document' } },
});

/** Build OpenAPI document using active HTTP port. */
export function createOpenApiDocument(port: number) {
  return new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'MedAtlas API',
      version: '0.1.0',
      description: 'MedAtlas backend API',
    },
    servers: [{ url: `http://localhost:${port}` }],
    tags: [
      { name: 'Health', description: 'Service health endpoints' },
      { name: 'Pinecone', description: 'Pinecone knowledge-base endpoints' },
      { name: 'Documentation', description: 'API documentation endpoints' },
    ],
  });
}
