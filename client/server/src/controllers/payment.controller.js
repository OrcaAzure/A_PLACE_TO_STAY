import { pool } from '../config/db.js';
import { isEmpty } from '../utils/helpers.js';
import {
  paymentDetailSelect,
  ensureInvoiceForBooking,
  loadPaymentDetail,
  enrichPaymentRows,
  sendInvoiceEmail,
  updateInvoiceBilling,
  markInvoicePaid,
} from '../services/payment.service.js';
import { isEmailDevMode } from '../services/email.service.js';

const ADMIN_ROLES = ['Super Admin', 'Admin'];

export const getAllPayments = async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    let rows;
    if (ADMIN_ROLES.includes(role)) {
      [rows] = await pool.query(
        `${paymentDetailSelect}
         WHERE b.status = 'Approved'
         ORDER BY
           CASE WHEN p.status = 'Pending' THEN 0 ELSE 1 END,
           p.created_at DESC`
      );
    } else {
      [rows] = await pool.query(
        `${paymentDetailSelect} WHERE b.user_id = ? AND b.status = 'Approved' ORDER BY p.created_at DESC`,
        [userId]
      );
    }
    const payments = await enrichPaymentRows(rows);
    res.status(200).json({ payments });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getPaymentById = async (req, res) => {
  try {
    const payment = await loadPaymentDetail(req.params.id);
    if (!payment) return res.status(404).json({ message: 'Invoice not found' });
    if (!ADMIN_ROLES.includes(req.user.role) && payment.user_id !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    res.status(200).json({ payment });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createPayment = async (req, res) => {
  try {
    const { booking_id, amount, method, discount_amount, discount_note } = req.body;
    if (isEmpty(booking_id)) {
      return res.status(400).json({ message: 'booking_id is required' });
    }

    const invoiceId = await ensureInvoiceForBooking(booking_id);
    if (!invoiceId) {
      return res.status(400).json({ message: 'Invoice can only be created for approved bookings with a total amount' });
    }

    if (discount_amount != null || discount_note != null) {
      await updateInvoiceBilling(invoiceId, { discount_amount, discount_note });
    }

    if (amount != null) {
      await pool.query('UPDATE payments SET amount = ? WHERE id = ? AND status = ?', [amount, invoiceId, 'Pending']);
    }
    if (method) {
      await pool.query('UPDATE payments SET method = ? WHERE id = ?', [method, invoiceId]);
    }

    const payment = await loadPaymentDetail(invoiceId);
    res.status(201).json({ message: 'Invoice ready', payment });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const sendPaymentInvoice = async (req, res) => {
  try {
    const payment = await loadPaymentDetail(req.params.id);
    if (!payment) return res.status(404).json({ message: 'Invoice not found' });

    const updated = await sendInvoiceEmail(req.params.id);
    const message = isEmailDevMode()
      ? `Invoice marked as sent (dev mode — logged to server console, not emailed to ${updated.guest_email})`
      : `Invoice emailed to ${updated.guest_email}`;
    res.status(200).json({ message, payment: updated, emailDevMode: isEmailDevMode() });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const updatePayment = async (req, res) => {
  try {
    const { status, method, discount_amount, discount_note } = req.body;
    const existing = await loadPaymentDetail(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Invoice not found' });

    let payment = existing;

    if (discount_amount != null || discount_note != undefined) {
      payment = await updateInvoiceBilling(req.params.id, { discount_amount, discount_note });
    }

    if (status === 'Paid') {
      payment = await markInvoicePaid(req.params.id, { method });
      return res.status(200).json({
        message: 'Payment recorded. Reservation stays active — room availability is based on stay dates, not payment.',
        payment,
      });
    }

    if (status) {
      await pool.query('UPDATE payments SET status = ? WHERE id = ?', [status, req.params.id]);
      payment = await loadPaymentDetail(req.params.id);
    }

    res.status(200).json({ message: 'Invoice updated', payment });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
