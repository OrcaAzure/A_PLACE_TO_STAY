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
  revertPaymentOvernight,
} from '../controllers/payment.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireAdmin } from '../middleware/role.middleware.js';

const router = Router();

router.get('/',      requireAuth, getAllPayments);
router.get('/:id',   requireAuth, getPaymentById);
router.get('/:id/transactions', requireAuth, getPaymentTransactions);
router.post('/', requireAuth, requireAdmin, createPayment);
router.post('/:id/send-invoice', requireAuth, requireAdmin, sendPaymentInvoice);
router.post('/:id/convert-reservation', requireAuth, requireAdmin, convertPaymentReservation);
router.post('/:id/revert-overnight', requireAuth, requireAdmin, revertPaymentOvernight);
router.post('/:id/transactions', requireAuth, requireAdmin, createPaymentTransaction);
router.delete('/closed', requireAuth, requireAdmin, clearPaidPayments);
router.delete('/:id', requireAuth, requireAdmin, deletePaidPayment);
router.patch('/:id', requireAuth, requireAdmin, updatePayment);

export default router;