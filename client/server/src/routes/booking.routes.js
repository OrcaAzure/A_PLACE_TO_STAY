import { Router } from 'express';
import {
  getAllBookings,
  getBookingById,
  createBooking,
  updateBooking,
  deleteBooking,
} from '../controllers/booking.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/role.middleware.js';

const router = Router();

router.get('/', requireAuth, getAllBookings);
router.get('/:id', requireAuth, getBookingById);
router.post('/', requireAuth, createBooking);
router.patch('/:id', requireAuth, updateBooking);
router.delete('/:id', requireAuth, requireRole('Super Admin', 'Admin'), deleteBooking);

export default router;
