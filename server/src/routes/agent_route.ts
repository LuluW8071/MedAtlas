import { Router } from 'express';

import { agentRoute } from '../service/agent.js';
import { requireAuth } from '../service/auth.js';

const router = Router();

router.post('/agent/invoke', requireAuth, agentRoute);

export default router;
