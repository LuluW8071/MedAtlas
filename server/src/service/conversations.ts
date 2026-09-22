import Redis from 'ioredis';

import { env } from '../config/env.js';

const redis = new Redis(env.redisUrl);

function threadsKey(userId: string) {
  return `medatlas:user:${userId}:threads`;
}

function titleKey(userId: string, threadId: string) {
  return `medatlas:user:${userId}:thread:${threadId}`;
}

export async function rememberConversation(userId: string, threadId: string, title: string) {
  const updatedAt = Date.now();
  await redis
    .multi()
    .zadd(threadsKey(userId), updatedAt, threadId)
    .hset(titleKey(userId, threadId), 'title', title, 'updatedAt', updatedAt)
    .exec();
}

export async function listConversationIds(userId: string, limit = 20) {
  const threadIds = await redis.zrevrange(threadsKey(userId), 0, limit - 1);
  const metadata = await Promise.all(threadIds.map(async (threadId) => {
    const values = await redis.hgetall(titleKey(userId, threadId));
    return {
      threadId,
      title: values.title ?? 'New conversation',
      updatedAt: Number(values.updatedAt ?? 0),
    };
  }));
  return metadata;
}
