import { Router } from 'express';
import { getFacilitiesOverview, getVenueFacilities } from '../controllers/facility.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/overview', requireAuth, getFacilitiesOverview);
router.get('/', requireAuth, getVenueFacilities);

export default router;
