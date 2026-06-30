import { Router } from 'express';
import {
  getMealRatesCatalog,
  getExtraServicesCatalog,
  createMealRate,
  updateMealRate,
  deleteMealRate,
  createExtraService,
  updateExtraService,
  deleteExtraService,
} from '../controllers/ancillary.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/role.middleware.js';
import { cacheResponse } from '../middleware/cache.middleware.js';

const router = Router();
const adminOnly = requireRole('Super Admin', 'Admin');

router.get('/meal-rates', requireAuth, cacheResponse('catalog:meal-rates'), getMealRatesCatalog);
router.post('/meal-rates', requireAuth, adminOnly, createMealRate);
router.patch('/meal-rates/:id', requireAuth, adminOnly, updateMealRate);
router.delete('/meal-rates/:id', requireAuth, adminOnly, deleteMealRate);

router.get('/extra-services', requireAuth, cacheResponse('catalog:extra-services'), getExtraServicesCatalog);
router.post('/extra-services', requireAuth, adminOnly, createExtraService);
router.patch('/extra-services/:id', requireAuth, adminOnly, updateExtraService);
router.delete('/extra-services/:id', requireAuth, adminOnly, deleteExtraService);

export default router;
