import { getDb } from './clients/mongo_client.js';

interface ConversationDoc {
  userId: string;
  threadId: string;
  title: string;
  updatedAt: number;
}

const conversations = () => getDb().collection<ConversationDoc>('conversations');

let indexReady: Promise<unknown> | undefined;

export async function rememberConversation(userId: string, threadId: string, title: string) {
  indexReady ??= conversations().createIndex({ userId: 1, updatedAt: -1 });
  await indexReady;
  await conversations().updateOne(
    { userId, threadId },
    { $set: { title, updatedAt: Date.now() } },
    { upsert: true },
  );
}

export async function listConversationIds(userId: string, limit = 20) {
  const docs = await conversations().find({ userId }).sort({ updatedAt: -1 }).limit(limit).toArray();
  return docs.map(({ threadId, title, updatedAt }) => ({ threadId, title, updatedAt }));
}
