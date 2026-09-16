import Redis from 'ioredis';
import { env } from '../../config/env.js';

const redis = new Redis(env.redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
});

/** Return shared Redis client after establishing connection when needed. */
export async function getRedisClient(): Promise<Redis> {
  if (redis.status !== 'ready') {
    await redis.connect();
  }

  return redis;
}
