import { Router } from 'express';

import { conversationsRoute } from '../service/conversations_route.js';

const router = Router();

router.get('/conversations', conversationsRoute);

export default router;
