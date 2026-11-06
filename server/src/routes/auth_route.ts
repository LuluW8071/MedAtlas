import { Router } from 'express';

import { currentUserRoute, loginRoute, logoutRoute, requireAuth, signUpRoute } from '../service/auth.js';

const router = Router();

router.post('/auth/signup', signUpRoute);
router.post('/auth/login', loginRoute);
router.post('/auth/logout', logoutRoute);
router.get('/auth/me', requireAuth, currentUserRoute);

export default router;
