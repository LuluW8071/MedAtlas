import { Router } from 'express';
import { retrieveRoute } from '../service/retrieve.js';

const router = Router();

router.post('/pinecone/retrieve', retrieveRoute);

export default router;
