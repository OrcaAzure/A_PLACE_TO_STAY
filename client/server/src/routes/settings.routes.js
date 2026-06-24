import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { getFiscalYear, updateFiscalYear } from '../controllers/settings.controller.js';

const router = Router();

router.get('/fiscal-year', requireAuth, getFiscalYear);
router.patch('/fiscal-year', requireAuth, updateFiscalYear);

export default router;
