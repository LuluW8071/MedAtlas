import { Router } from 'express';
import { ingestRoute } from '../service/ingest.js';

const router = Router();

router.post('/pinecone/ingest', ingestRoute);

export default router;
