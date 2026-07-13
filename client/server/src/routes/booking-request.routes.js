import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { blockReadOnly } from '../middleware/role.middleware.js';
import { submitBookingRequest } from '../controllers/booking-request.controller.js';

const router = Router();

router.post('/submit', requireAuth, blockReadOnly, submitBookingRequest);

export default router;
