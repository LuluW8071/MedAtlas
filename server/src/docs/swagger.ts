import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import {
  apiHealthSchema,
  agentRequestSchema,
  agentResponseSchema,
  authCredentialsSchema,
  authResponseSchema,
  conversationsResponseSchema,
  errorSchema,
  ingestResponseSchema,
  ingestJobParamsSchema,
  ingestJobSchema,
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
  payload: z.enum(['true', 'false']).optional().openapi({
    description: 'Whether to embed and index chunks in Qdrant. Defaults to true.',
  }),
});

registry.register('Error', errorSchema);
registry.register('ApiHealth', apiHealthSchema);
registry.register('PineconeHealth', pineconeHealthSchema);
registry.register('Namespace', namespaceSchema);
registry.register('NamespaceList', namespaceListSchema);
registry.register('RetrieveRequest', retrieveRequestSchema);
registry.register('RetrieveResponse', retrieveResponseSchema);
registry.register('IngestResponse', ingestResponseSchema);
registry.register('IngestJob', ingestJobSchema);
registry.register('AgentRequest', agentRequestSchema);
registry.register('AgentResponse', agentResponseSchema);
registry.register('AuthCredentials', authCredentialsSchema);
registry.register('AuthResponse', authResponseSchema);
registry.register('ConversationsResponse', conversationsResponseSchema);
registry.registerComponent('securitySchemes', 'cookieAuth', {
  type: 'apiKey',
  in: 'cookie',
  name: 'medatlas_session',
});

for (const [path, summary, successStatus, failureStatus, failureMessage] of [
  ['/auth/signup', 'Create an account', 201, 409, 'Account already exists'],
  ['/auth/login', 'Log in', 200, 401, 'Invalid email or password'],
] as const) {
  registry.registerPath({
    method: 'post',
    path,
    tags: ['Authentication'],
    summary,
    request: {
      body: { content: { 'application/json': { schema: authCredentialsSchema } }, required: true },
    },
    responses: {
      [successStatus]: { description: 'Authenticated user', content: { 'application/json': { schema: authResponseSchema } } },
      400: { description: 'Invalid credentials', content: { 'application/json': { schema: errorSchema } } },
      [failureStatus]: { description: failureMessage, content: { 'application/json': { schema: errorSchema } } },
    },
  });
}

registry.registerPath({
  method: 'get',
  path: '/auth/me',
  tags: ['Authentication'],
  summary: 'Get current account',
  security: [{ cookieAuth: [] }],
  responses: {
    200: { description: 'Current account', content: { 'application/json': { schema: authResponseSchema } } },
    401: { description: 'Authentication required', content: { 'application/json': { schema: errorSchema } } },
  },
});

registry.registerPath({
  method: 'post',
  path: '/auth/logout',
  tags: ['Authentication'],
  summary: 'End current session',
  responses: { 204: { description: 'Session ended' } },
});

const redisListResponseSchema = z.record(z.string(), z.unknown());

registry.registerPath({
  method: 'post',
  path: '/agent/invoke',
  tags: ['Agent'],
  summary: 'Invoke MedAtlas agent with Redis-backed conversation memory',
  security: [{ cookieAuth: [] }],
  request: {
    body: {
      content: { 'application/json': { schema: agentRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'Server-sent event stream containing agent tokens and retrieved source chunks',
      content: {
        'text/event-stream': {
          schema: z.string().openapi({
            description: 'SSE events: start, token, sources, suggestions, done, or error. sources and done include retrieved citation chunks. suggestions ({ suggestions: string[] }) carries up to 3 follow-up questions; done also includes suggestions.',
          }),
        },
      },
    },
    400: {
      description: 'Invalid agent request',
      content: { 'application/json': { schema: errorSchema } },
    },
    500: {
      description: 'Agent invocation failed',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/conversations',
  tags: ['Agent'],
  summary: 'List current account conversation history',
  security: [{ cookieAuth: [] }],
  responses: {
    200: { description: 'Account conversations', content: { 'application/json': { schema: conversationsResponseSchema } } },
    401: { description: 'Authentication required', content: { 'application/json': { schema: errorSchema } } },
  },
});

registry.registerPath({
  method: 'get',
  path: '/redis',
  tags: ['Redis'],
  summary: 'List Redis contents',
  request: {
    query: z.object({
      key: z.string().min(1).optional().openapi({
        description: 'Exact Redis key to return',
      }),
    }),
  },
  responses: {
    200: {
      description: 'Redis key-value contents',
      content: { 'application/json': { schema: redisListResponseSchema } },
    },
    500: { description: 'Redis listing failed' },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/redis',
  tags: ['Redis'],
  summary: 'Clear Redis contents',
  request: {
    query: z.object({
      key: z.string().min(1).optional().openapi({
        description: 'Delete only this Redis key; omit to clear the database',
      }),
    }),
  },
  responses: {
    200: {
      description: 'Redis contents cleared',
      content: {
        'application/json': {
          schema: z.union([
            z.object({ message: z.string() }),
            z.object({ key: z.string(), deleted: z.number().int().nonnegative() }),
          ]),
        },
      },
    },
    500: { description: 'Redis clear failed' },
  },
});

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
      description: 'Topics stored (payload=false)',
      content: { 'application/json': { schema: ingestResponseSchema } },
    },
    202: {
      description: 'Ingestion started; poll the job for progress',
      content: { 'application/json': { schema: ingestResponseSchema } },
    },
    400: { description: 'Missing, unsupported, or invalid document' },
    500: { description: 'Ingestion failed' },
  },
});

registry.registerPath({
  method: 'get',
  path: '/pinecone/ingest/{jobId}',
  tags: ['Pinecone'],
  summary: 'Get ingestion job progress',
  request: { params: ingestJobParamsSchema },
  responses: {
    200: {
      description: 'Ingestion job state',
      content: { 'application/json': { schema: ingestJobSchema } },
    },
    404: { description: 'Ingest job not found' },
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
      { name: 'Authentication', description: 'Account signup, login, and sessions' },
      { name: 'Health', description: 'Service health endpoints' },
      { name: 'Pinecone', description: 'Pinecone knowledge-base endpoints' },
      { name: 'Redis', description: 'Redis key-value endpoints' },
      { name: 'Agent', description: 'LangGraph agent endpoints' },
      { name: 'Documentation', description: 'API documentation endpoints' },
    ],
  });
}
