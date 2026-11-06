/** Shared local MongoDB connection for conversations, answer cache, and lexical search. */
import { MongoClient } from 'mongodb';

import { env } from '../../config/env.js';

export const mongoClient = new MongoClient(env.mongoUri);

/** Return the MedAtlas database; the driver connects lazily and pools connections. */
export function getDb() {
  return mongoClient.db(env.mongoDbName);
}
