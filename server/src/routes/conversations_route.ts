import { Router } from 'express';

import { conversationsRoute } from '../service/conversations_route.js';
import { requireAuth } from '../service/auth.js';

const router = Router();

router.get('/conversations', requireAuth, conversationsRoute);

export default router;
