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
  getAdminVenues,
  saveVenue,
  removeVenue,
  removeVenueFunction,
} from '../controllers/facility.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireAdmin } from '../middleware/role.middleware.js';
import { cacheResponse } from '../middleware/cache.middleware.js';

const router = Router();
const adminOnly = requireAdmin;

router.get('/overview', requireAuth, cacheResponse('facilities:overview'), getFacilitiesOverview);
router.get(
  '/venue-rate',
  requireAuth,
  cacheResponse((req) => `facilities:venue-rate:${req.originalUrl.split('?')[1] || ''}`),
  getVenueRateQuote
);
router.get('/list', requireAuth, cacheResponse('facilities:list'), getAllFacilities);

// Admin venue management (grouped venues with uses, capacity, hours, inclusions).
router.get('/admin/venues', requireAuth, adminOnly, getAdminVenues);
router.post('/admin/venues', requireAuth, adminOnly, saveVenue);
router.delete('/admin/venues', requireAuth, adminOnly, removeVenue);
router.delete('/admin/venues/functions/:id', requireAuth, adminOnly, removeVenueFunction);

router.get('/', requireAuth, cacheResponse('facilities:venues'), getVenueFacilities);
router.post('/', requireAuth, adminOnly, createFacility);
router.get('/:id', requireAuth, cacheResponse((req) => `facilities:id:${req.params.id}`), getFacilityById);
router.patch('/:id', requireAuth, adminOnly, updateFacility);
router.delete('/:id', requireAuth, adminOnly, deleteFacility);

export default router;
