import { Router } from 'express';
import {
  getAllFacilityBookings,
  getFacilityBookingById,
  createFacilityBooking,
  updateFacilityBooking,
  deleteFacilityBooking,
} from '../controllers/facilityBooking.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireRole, blockReadOnly } from '../middleware/role.middleware.js';

const router = Router();

router.get('/',      requireAuth,                                       getAllFacilityBookings);
router.get('/:id',   requireAuth,                                       getFacilityBookingById);
router.post('/',     requireAuth, blockReadOnly,                        createFacilityBooking);
router.patch('/:id', requireAuth, blockReadOnly,                        updateFacilityBooking);
router.delete('/:id',requireAuth, requireRole('Super Admin', 'Admin'),  deleteFacilityBooking);

export default router;
