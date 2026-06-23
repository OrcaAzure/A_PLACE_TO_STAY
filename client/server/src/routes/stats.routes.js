import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { getAdminSummary } from '../controllers/stats.controller.js';

const router = Router();

router.get('/summary', requireAuth, getAdminSummary);

export default router;
