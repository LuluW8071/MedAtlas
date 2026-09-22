import { Router } from 'express';

import { agentRoute } from '../service/agent.js';

const router = Router();

router.post('/agent/invoke', agentRoute);

export default router;
