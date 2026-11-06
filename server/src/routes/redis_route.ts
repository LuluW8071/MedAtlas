import { Router } from 'express';
import { clearRedisRoute, listRedisRoute } from '../service/redis.js';

const router = Router();

router.get('/redis', listRedisRoute);
router.delete('/redis', clearRedisRoute);

export default router;
