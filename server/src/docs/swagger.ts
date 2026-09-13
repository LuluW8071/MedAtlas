/** Define the OpenAPI document exposed by the HTTP server. */

/** Build OpenAPI document using active HTTP port. */
export function createOpenApiDocument(port: number) {
  return {
    openapi: '3.0.3',
    info: {
      title: 'MedAtlas API',
      version: '0.1.0',
      description: 'MedAtlas backend API',
    },
    servers: [{ url: `http://localhost:${port}` }],
    tags: [
      { name: 'Health', description: 'Service health endpoints' },
      { name: 'Ingestion', description: 'Knowledge-base ingestion endpoints' },
      { name: 'Documentation', description: 'API documentation endpoints' },
    ],
    paths: {
      '/health': {
        get: {
          tags: ['Health'],
          summary: 'Get API health',
          responses: {
            '200': {
              description: 'API is healthy',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['status', 'service'],
                    properties: {
                      status: { type: 'string', example: 'ok' },
                      service: { type: 'string', example: 'api' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/ingest': {
        post: {
          tags: ['Ingestion'],
          summary: 'Ingest a Markdown or text document',
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  required: ['file'],
                  properties: {
                    file: { type: 'string', format: 'binary' },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Document ingested successfully' },
            '400': { description: 'Missing, unsupported, or invalid document' },
            '500': { description: 'Ingestion failed' },
          },
        },
      },
      '/docs': {
        get: {
          tags: ['Documentation'],
          summary: 'Open Swagger UI',
          responses: { '200': { description: 'Swagger UI' } },
        },
      },
      '/docs.json': {
        get: {
          tags: ['Documentation'],
          summary: 'Get OpenAPI document',
          responses: {
            '200': {
              description: 'OpenAPI document',
              content: {
                'application/json': { schema: { type: 'object' } },
              },
            },
          },
        },
      },
    },
  };
}
