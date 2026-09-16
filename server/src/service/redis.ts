import type { RequestHandler } from 'express';
import { getRedisClient } from './clients/redis_client.js';

/** Parse JSON values while preserving plain Redis strings. */
function parseRedisValue(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/** List Redis contents, optionally restricted to one exact key. */
export const listRedisRoute: RequestHandler = async (request, response) => {
  try {
    const redis = await getRedisClient();
    const requestedKey = typeof request.query.key === 'string'
      ? request.query.key
      : undefined;
    const keys = requestedKey ? [requestedKey] : await redis.keys('*');
    const entries = await Promise.all(
      keys.map(async key => [key, await redis.get(key)] as const),
    );

    response.json(Object.fromEntries(
      entries
        .filter(([, value]) => value !== null)
        .map(([key, value]) => [key, parseRedisValue(value!)]),
    ));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Redis listing failed';
    response.status(500).json({ error: message });
  }
};

/** Clear one Redis key or the current Redis database when no key is provided. */
export const clearRedisRoute: RequestHandler = async (request, response) => {
  try {
    const redis = await getRedisClient();
    const requestedKey = typeof request.query.key === 'string'
      ? request.query.key
      : undefined;

    if (requestedKey) {
      const deleted = await redis.del(requestedKey);
      response.json({ key: requestedKey, deleted });
      return;
    }

    await redis.flushdb();
    response.json({ message: 'Redis database cleared' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Redis clear failed';
    response.status(500).json({ error: message });
  }
};
