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
  getRoomRatesCatalog,
  saveRoomRates,
} from '../controllers/ancillary.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireAdmin, requireAdminPortal } from '../middleware/role.middleware.js';
import { cacheResponse } from '../middleware/cache.middleware.js';

const router = Router();
const adminRead = [requireAuth, requireAdminPortal];
const adminWrite = [requireAuth, requireAdmin];

router.get('/meal-rates', ...adminRead, cacheResponse('catalog:meal-rates'), getMealRatesCatalog);
router.post('/meal-rates', ...adminWrite, createMealRate);
router.patch('/meal-rates/:id', ...adminWrite, updateMealRate);
router.delete('/meal-rates/:id', ...adminWrite, deleteMealRate);

router.get('/extra-services', ...adminRead, cacheResponse('catalog:extra-services'), getExtraServicesCatalog);
router.post('/extra-services', ...adminWrite, createExtraService);
router.patch('/extra-services/:id', ...adminWrite, updateExtraService);
router.delete('/extra-services/:id', ...adminWrite, deleteExtraService);

router.get('/room-rates', ...adminRead, cacheResponse('catalog:room-rates'), getRoomRatesCatalog);
router.put('/room-rates', ...adminWrite, saveRoomRates);

export default router;
