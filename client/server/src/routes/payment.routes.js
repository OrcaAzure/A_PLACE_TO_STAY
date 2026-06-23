import { Router } from 'express';
import { getAllPayments, getPaymentById, createPayment, updatePayment } from '../controllers/payment.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/role.middleware.js';

const router = Router();

router.get('/',      requireAuth, getAllPayments);
router.get('/:id',   requireAuth, getPaymentById);
router.post('/',     requireAuth, createPayment);
router.patch('/:id', requireAuth, requireRole('Super Admin', 'Admin'), updatePayment);

export default router;