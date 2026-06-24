import { Router } from 'express';
import { getVenueFacilities } from '../controllers/facility.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/', requireAuth, getVenueFacilities);

export default router;
