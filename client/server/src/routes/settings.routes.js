import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/role.middleware.js';
import { getFiscalYear, updateFiscalYear } from '../controllers/settings.controller.js';
import { cacheResponse } from '../middleware/cache.middleware.js';

const router = Router();

const ADMIN_ROLES = ['Super Admin', 'Admin'];

router.get(
  '/fiscal-year',
  requireAuth,
  cacheResponse((req) => `settings:fiscal-year:admin=${ADMIN_ROLES.includes(req.user?.role)}`),
  getFiscalYear
);
router.patch('/fiscal-year', requireAuth, requireRole('Super Admin', 'Admin'), updateFiscalYear);

export default router;
