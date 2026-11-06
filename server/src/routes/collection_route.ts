import { Router } from 'express';
import {
  deleteNamespaceRoute,
  listNamespacesRoute,
  pineconeHealthRoute,
} from '../service/collection.js';

const router = Router();

router.get('/pinecone/health', pineconeHealthRoute);
router.get('/pinecone/collections', listNamespacesRoute);
router.delete('/pinecone/collections/:namespace', deleteNamespaceRoute);

export default router;
