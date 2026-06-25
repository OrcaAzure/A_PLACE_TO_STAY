import { Router } from 'express';
import {
  getFacilitiesOverview,
  getVenueFacilities,
  getAllFacilities,
  getFacilityById,
  createFacility,
  updateFacility,
  deleteFacility,
} from '../controllers/facility.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/role.middleware.js';

const router = Router();
const adminOnly = requireRole('Super Admin', 'Admin');

router.get('/overview', requireAuth, getFacilitiesOverview);
router.get('/list', requireAuth, getAllFacilities);
router.get('/', requireAuth, getVenueFacilities);
router.post('/', requireAuth, adminOnly, createFacility);
router.get('/:id', requireAuth, getFacilityById);
router.patch('/:id', requireAuth, adminOnly, updateFacility);
router.delete('/:id', requireAuth, adminOnly, deleteFacility);

export default router;
