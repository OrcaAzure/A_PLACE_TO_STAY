import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireAdmin } from '../middleware/role.middleware.js';
import { isAdminRole } from '../utils/constants.js';
import { getFiscalYear, updateFiscalYear, previewSeasonCalendar } from '../controllers/settings.controller.js';
import { cacheResponse } from '../middleware/cache.middleware.js';

const router = Router();

router.get(
  '/fiscal-year',
  requireAuth,
  cacheResponse((req) => `settings:fiscal-year:admin=${isAdminRole(req.user?.role)}`),
  getFiscalYear
);
router.patch('/fiscal-year', requireAuth, requireAdmin, updateFiscalYear);
router.post('/season-preview', requireAuth, requireAdmin, previewSeasonCalendar);

export default router;
