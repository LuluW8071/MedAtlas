import { Router } from 'express';
import { ingestRoute, ingestStatusRoute } from '../service/ingest.js';

const router = Router();

router.post('/pinecone/ingest', ingestRoute);
router.get('/pinecone/ingest/:jobId', ingestStatusRoute);

export default router;
