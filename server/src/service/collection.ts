import type { RequestHandler } from 'express';
import { logger } from '../config/logger.js';
import { namespaceParamsSchema } from '../schemas/api.js';
import { createPineconeClient, getIngestionConfig } from './clients/pinecone_client.js';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Pinecone request failed';
}

/** Check Pinecone availability. */
export async function checkPineconeHealth(): Promise<{ status: 'ok'; service: 'pinecone' }> {
  const pinecone = createPineconeClient();
  await pinecone.indexes.list();
  return { status: 'ok', service: 'pinecone' };
}

/** Return namespaces and vector counts from configured Pinecone index. */
export async function listPineconeNamespaces(): Promise<{
  namespaces: Array<{ name: string; recordCount: number }>;
}> {
  const pinecone = createPineconeClient();
  const { indexName } = getIngestionConfig();
  const stats = await pinecone.index(indexName).describeIndexStats();

  return {
    namespaces: Object.entries(stats.namespaces ?? {}).map(([name, details]) => ({
      name,
      recordCount: details.recordCount ?? 0,
    })),
  };
}

/** Delete one Pinecone namespace by removing its vectors. */
export async function deletePineconeNamespace(namespace: string | string[]): Promise<void> {
  const parsedParams = namespaceParamsSchema.safeParse({ namespace });

  if (!parsedParams.success) {
    throw new Error(parsedParams.error.issues[0]?.message ?? 'Invalid namespace');
  }

  const pinecone = createPineconeClient();
  const { indexName } = getIngestionConfig();
  await pinecone.index(indexName).namespace(parsedParams.data.namespace).deleteAll();
}

/** Handle Pinecone health requests. */
export const pineconeHealthRoute: RequestHandler = async (_request, response): Promise<void> => {
  try {
    response.json(await checkPineconeHealth());
  } catch (error) {
    logger.error({ err: error }, 'Pinecone health check failed');
    response.status(503).json({
      status: 'error',
      service: 'pinecone',
      error: errorMessage(error),
    });
  }
};

/** Handle namespace listing requests. */
export const listNamespacesRoute: RequestHandler = async (_request, response): Promise<void> => {
  try {
    response.json(await listPineconeNamespaces());
  } catch (error) {
    logger.error({ err: error }, 'Pinecone namespace listing failed');
    response.status(500).json({ error: errorMessage(error) });
  }
};

/** Handle namespace deletion requests. */
export const deleteNamespaceRoute: RequestHandler = async (request, response): Promise<void> => {
  try {
    await deletePineconeNamespace(request.params.namespace);
    response.status(204).send();
  } catch (error) {
    logger.error(
      { err: error, namespace: request.params.namespace },
      'Pinecone namespace deletion failed',
    );
    response.status(500).json({ error: errorMessage(error) });
  }
};
