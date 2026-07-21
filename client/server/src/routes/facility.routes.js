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
  uploadFacilityImagesHandler,
  replaceFacilityImageHandler,
  deleteFacilityImageHandler,
} from '../controllers/facility.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireAdmin, requireAdminPortal } from '../middleware/role.middleware.js';
import { cacheResponse } from '../middleware/cache.middleware.js';
import { isAdminPortalRole } from '../utils/constants.js';
import {
  uploadFacilityImages,
  uploadFacilityImageReplace,
  handleFacilityImageUploadError,
} from '../middleware/facilityImageUpload.middleware.js';

const router = Router();
const adminWrite = requireAdmin;

router.get(
  '/overview',
  requireAuth,
  cacheResponse((req) => `facilities:overview:${isAdminPortalRole(req.user?.role) ? 'admin' : 'guest'}`),
  getFacilitiesOverview
);
router.get(
  '/venue-rate',
  requireAuth,
  cacheResponse((req) => `facilities:venue-rate:${req.originalUrl.split('?')[1] || ''}`),
  getVenueRateQuote
);
router.get('/list', requireAuth, cacheResponse('facilities:list'), getAllFacilities);

// Admin venue management (grouped venues with uses, capacity, hours, inclusions).
router.get('/admin/venues', requireAuth, requireAdminPortal, getAdminVenues);
router.post('/admin/venues', requireAuth, adminWrite, saveVenue);
router.delete('/admin/venues', requireAuth, adminWrite, removeVenue);
router.delete('/admin/venues/functions/:id', requireAuth, adminWrite, removeVenueFunction);

router.get('/', requireAuth, cacheResponse('facilities:venues'), getVenueFacilities);

// Venue photo CRUD (must be registered before generic /:id handlers).
router.post(
  '/:id/images',
  requireAuth,
  adminWrite,
  (req, res, next) => {
    uploadFacilityImages(req, res, (err) => {
      if (err) return handleFacilityImageUploadError(err, req, res, next);
      next();
    });
  },
  uploadFacilityImagesHandler,
);
router.put(
  '/:id/images/:filename',
  requireAuth,
  adminWrite,
  (req, res, next) => {
    uploadFacilityImageReplace(req, res, (err) => {
      if (err) return handleFacilityImageUploadError(err, req, res, next);
      next();
    });
  },
  replaceFacilityImageHandler,
);
router.delete('/:id/images/:filename', requireAuth, adminWrite, deleteFacilityImageHandler);

router.post('/', requireAuth, adminWrite, createFacility);
router.get('/:id', requireAuth, cacheResponse((req) => `facilities:id:${req.params.id}`), getFacilityById);
router.patch('/:id', requireAuth, adminWrite, updateFacility);
router.delete('/:id', requireAuth, adminWrite, deleteFacility);

export default router;
