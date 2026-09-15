import { Router } from 'express';
import { retrieveRoute } from '../service/retrieve.js';

const router = Router();

router.post('/retrieve', retrieveRoute);

export default router;
