import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireAdminPortal } from '../middleware/role.middleware.js';
import { getAdminSummary } from '../controllers/stats.controller.js';

const router = Router();

router.get('/summary', requireAuth, requireAdminPortal, getAdminSummary);

export default router;
