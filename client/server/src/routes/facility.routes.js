import { Router } from 'express';
import {
  getFacilitiesOverview,
  getVenueFacilities,
  getVenueRateQuote,
  getAllFacilities,
  getFacilityById,
  createFacility,
  updateFacility,
  deleteFacility,
} from '../controllers/facility.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/role.middleware.js';
import { cacheResponse } from '../middleware/cache.middleware.js';

const router = Router();
const adminOnly = requireRole('Super Admin', 'Admin');

router.get('/overview', requireAuth, cacheResponse('facilities:overview'), getFacilitiesOverview);
router.get(
  '/venue-rate',
  requireAuth,
  cacheResponse((req) => `facilities:venue-rate:${req.originalUrl.split('?')[1] || ''}`),
  getVenueRateQuote
);
router.get('/list', requireAuth, cacheResponse('facilities:list'), getAllFacilities);
router.get('/', requireAuth, cacheResponse('facilities:venues'), getVenueFacilities);
router.post('/', requireAuth, adminOnly, createFacility);
router.get('/:id', requireAuth, cacheResponse((req) => `facilities:id:${req.params.id}`), getFacilityById);
router.patch('/:id', requireAuth, adminOnly, updateFacility);
router.delete('/:id', requireAuth, adminOnly, deleteFacility);

export default router;
