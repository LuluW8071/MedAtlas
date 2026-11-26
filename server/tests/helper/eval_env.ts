/** Import first: isolates a retrieval-eval run in its own Qdrant collection and Mongo database. */
process.env.QDRANT_COLLECTION = `eval_${process.argv[2] ?? 'default'}`;
process.env.MONGODB_DB_NAME = 'medatlas_eval';
