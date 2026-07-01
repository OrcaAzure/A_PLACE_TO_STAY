import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/role.middleware.js';
import { getAdminSummary } from '../controllers/stats.controller.js';

const router = Router();

router.get('/summary', requireAuth, requireRole('Super Admin', 'Admin'), getAdminSummary);

export default router;
