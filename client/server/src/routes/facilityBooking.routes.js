import { Router } from 'express';
import {
  getAllFacilityBookings,
  getFacilityBookingById,
  createFacilityBooking,
  updateFacilityBooking,
  deleteFacilityBooking,
  getVenueScheduleOverview,
  checkVenueSlotAvailability,
} from '../controllers/facilityBooking.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { blockReadOnly, requireAdmin, requireAdminPortal } from '../middleware/role.middleware.js';

const router = Router();

router.get('/overview', requireAuth, requireAdminPortal, getVenueScheduleOverview);
router.get('/check-slot', requireAuth, checkVenueSlotAvailability);
router.get('/',      requireAuth,                                       getAllFacilityBookings);
router.get('/:id',   requireAuth,                                       getFacilityBookingById);
router.post('/',     requireAuth, blockReadOnly,                        createFacilityBooking);
router.patch('/:id', requireAuth, blockReadOnly,                        updateFacilityBooking);
router.delete('/:id',requireAuth, requireAdmin,  deleteFacilityBooking);

export default router;
