/** Create and start the MedAtlas Express HTTP server. */
import cors from 'cors';
import express from 'express';
// import Redis from 'ioredis';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { createOpenApiDocument } from './docs/swagger.js';
import healthRoutes from './routes/health.js';
import ingestRoutes from './routes/ingest.js';

const port = env.port;
const clientUrl = env.clientUrl;
// const redis = new Redis(env.redisUrl, {
//   lazyConnect: true,
//   maxRetriesPerRequest: 1
// });

const app = express();
app.use(cors({ origin: clientUrl }));
app.use(express.json());
app.use((request, response, next) => {
  const startedAt = Date.now();

  response.on('finish', () => {
    logger.info({
      method: request.method,
      path: request.originalUrl,
      status: response.statusCode,
      durationMs: Date.now() - startedAt,
    }, 'request completed');
  });

  next();
});

const openApiDocument = createOpenApiDocument(port);

app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));
app.get('/docs.json', (_request, response) => response.json(openApiDocument));

app.use(healthRoutes);
app.use(ingestRoutes);

// app.get('/redis/health', async (_request, response) => {
//   let redisStatus = 'disconnected';
//   try {
//     if (redis.status !== 'ready') await redis.connect();
//     await redis.ping();
//     redisStatus = 'connected';
//   } catch {
//     redisStatus = 'unavailable';
//   }

//   response.json({ status: 'ok', service: 'api', redis: redisStatus });
// });

app.use((_request, response) => {
  response.status(404).json({ error: 'Not found' });
});

app.listen(port, () => {
  logger.info({ port }, 'API listening');
});
