import { Router } from 'express';
import { getAllPayments, getPaymentById, createPayment, updatePayment, sendPaymentInvoice } from '../controllers/payment.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireRole, blockReadOnly } from '../middleware/role.middleware.js';

const router = Router();

router.get('/',      requireAuth, getAllPayments);
router.get('/:id',   requireAuth, getPaymentById);
router.post('/',     requireAuth, blockReadOnly, createPayment);
router.post('/:id/send-invoice', requireAuth, requireRole('Super Admin', 'Admin'), sendPaymentInvoice);
router.patch('/:id', requireAuth, requireRole('Super Admin', 'Admin'), updatePayment);

export default router;