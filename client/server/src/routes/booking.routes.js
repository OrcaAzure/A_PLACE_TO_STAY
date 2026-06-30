import { Router } from 'express';
import {
  getAllBookings,
  getBookingById,
  createBooking,
  updateBooking,
  deleteBooking,
  getRoomAvailability,
  getMealRateList,
} from '../controllers/booking.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireRole, blockReadOnly } from '../middleware/role.middleware.js';
import { cacheResponse } from '../middleware/cache.middleware.js';

const router = Router();

router.get('/', requireAuth, getAllBookings);
router.get('/availability', requireAuth, getRoomAvailability);
router.get('/meal-rates', requireAuth, cacheResponse('booking:meal-rates'), getMealRateList);
router.get('/:id', requireAuth, getBookingById);
router.post('/', requireAuth, blockReadOnly, createBooking);
router.patch('/:id', requireAuth, blockReadOnly, updateBooking);
router.delete('/:id', requireAuth, requireRole('Super Admin', 'Admin'), deleteBooking);

export default router;
