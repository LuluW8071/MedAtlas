import type { RequestHandler } from 'express';
import { logger } from '../config/logger.js';
import { namespaceParamsSchema } from '../schemas/api.js';
import { bumpCorpusGeneration } from './answer_cache.js';
import { qdrant } from './clients/qdrant_client.js';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Qdrant request failed';
}

/** Check Qdrant availability. */
export async function checkPineconeHealth(): Promise<{ status: 'ok'; service: 'pinecone' }> {
  await qdrant.getCollections();
  // Service literal stays 'pinecone' to keep the public /pinecone/* contract stable.
  return { status: 'ok', service: 'pinecone' };
}

/** Return Qdrant collections (exposed as namespaces) and point counts. */
export async function listPineconeNamespaces(): Promise<{
  namespaces: Array<{ name: string; recordCount: number }>;
}> {
  const { collections } = await qdrant.getCollections();

  return {
    namespaces: await Promise.all(collections.map(async ({ name }) => ({
      name,
      recordCount: (await qdrant.count(name, { exact: true })).count,
    }))),
  };
}

/** Delete one Qdrant collection; the next ingest recreates it. */
export async function deletePineconeNamespace(namespace: string | string[]): Promise<void> {
  const parsedParams = namespaceParamsSchema.safeParse({ namespace });

  if (!parsedParams.success) {
    throw new Error(parsedParams.error.issues[0]?.message ?? 'Invalid namespace');
  }

  await qdrant.deleteCollection(parsedParams.data.namespace);
  await bumpCorpusGeneration();
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
