import { Router } from 'express';
import {
  getAllPayments,
  getPaymentById,
  createPayment,
  updatePayment,
  sendPaymentInvoice,
  getPaymentTransactions,
  createPaymentTransaction,
  clearPaidPayments,
  deletePaidPayment,
  convertPaymentReservation,
} from '../controllers/payment.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/role.middleware.js';

const router = Router();

router.get('/',      requireAuth, getAllPayments);
router.get('/:id',   requireAuth, getPaymentById);
router.get('/:id/transactions', requireAuth, getPaymentTransactions);
router.post('/', requireAuth, requireRole('Super Admin', 'Admin'), createPayment);
router.post('/:id/send-invoice', requireAuth, requireRole('Super Admin', 'Admin'), sendPaymentInvoice);
router.post('/:id/convert-reservation', requireAuth, requireRole('Super Admin', 'Admin'), convertPaymentReservation);
router.post('/:id/transactions', requireAuth, requireRole('Super Admin', 'Admin'), createPaymentTransaction);
router.delete('/closed', requireAuth, requireRole('Super Admin', 'Admin'), clearPaidPayments);
router.delete('/:id', requireAuth, requireRole('Super Admin', 'Admin'), deletePaidPayment);
router.patch('/:id', requireAuth, requireRole('Super Admin', 'Admin'), updatePayment);

export default router;