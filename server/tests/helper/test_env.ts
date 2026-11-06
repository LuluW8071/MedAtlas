import { randomUUID } from 'node:crypto';

/** Import first: isolates Mongo-backed tests in a throwaway database. */
process.env.MONGODB_DB_NAME = `medatlas_test_${randomUUID().slice(0, 8)}`;
process.env.QDRANT_COLLECTION = `medatlas_test_${randomUUID().slice(0, 8)}`;
process.env.EMBEDDING_DIMENSIONS = '4';
