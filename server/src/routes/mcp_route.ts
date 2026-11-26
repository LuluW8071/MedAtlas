import { McpServer, WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server';
import { Router, type Request } from 'express';
import * as z from 'zod';

function createMcpServer() {
  const server = new McpServer({ name: 'medatlas-server', version: '1.0.0' });

  server.registerTool(
    'greet',
    {
      description: 'Greet someone by name',
      inputSchema: z.object({ name: z.string() }),
    },
    async ({ name }) => ({
      content: [{ type: 'text', text: `Hello, ${name}!` }],
    }),
  );

  return server;
}

function toWebRequest(request: Request) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  }

  const method = request.method.toUpperCase();
  return new Request(`${request.protocol}://${request.get('host')}${request.originalUrl}`, {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : JSON.stringify(request.body),
  });
}

const router = Router();

router.all('/', async (request, response, next) => {
  try {
    const server = createMcpServer();
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    await server.connect(transport);
    const mcpResponse = await transport.handleRequest(toWebRequest(request), {
      parsedBody: request.body,
    });

    response.status(mcpResponse.status);
    mcpResponse.headers.forEach((value, name) => response.setHeader(name, value));
    response.send(Buffer.from(await mcpResponse.arrayBuffer()));
  } catch (error) {
    next(error);
  }
});

export default router;
