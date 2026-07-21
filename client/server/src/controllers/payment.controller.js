/**
 * REST handlers for payments and invoices (/api/payments).
 * Thin HTTP layer over payment.service.js: list/detail, billing updates,
 * invoice emails, and marking invoices paid.
 */
import { pool } from '../config/db.js';
import { isEmpty } from '../utils/helpers.js';
import {
  ensureInvoiceForBooking,
  ensureInvoiceForFacilityBooking,
  loadPaymentDetail,
  enrichPaymentRows,
  listAllPaymentRows,
  sendInvoiceEmail,
  updateInvoiceBilling,
  markInvoicePaid,
  recordPaymentTransaction,
  deletePaidInvoice,
  clearAllPaidInvoices,
  convertPaymentReservationKind,
  revertVenueOvernightBilling,
} from '../services/payment.service.js';
import { isEmailDevMode } from '../services/email.service.js';

import { isAdminRole, isAdminPortalRole } from '../utils/constants.js';

function parsePaymentId(raw) {
  const id = Number.parseInt(String(raw), 10);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

function paymentErrorStatus(error) {
  const msg = String(error?.message || '').toLowerCase();
  if (msg.includes('not found')) return 404;
  if (msg.includes('forbidden')) return 403;
  return 400;
}

function paymentErrorMessage(error) {
  if (!error) return 'Something went wrong. Please try again.';
  return error.message || 'Something went wrong. Please try again.';
}

export const getAllPayments = async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    const rows = await listAllPaymentRows(
      isAdminPortalRole(role) ? {} : { userId }
    );
    const payments = await enrichPaymentRows(rows);
    res.status(200).json({ payments });
  } catch (error) {
    res.status(500).json({ message: paymentErrorMessage(error) });
  }
};

export const getPaymentById = async (req, res) => {
  try {
    const paymentId = parsePaymentId(req.params.id);
    if (!paymentId) return res.status(400).json({ message: 'Invalid invoice id' });

    const payment = await loadPaymentDetail(paymentId);
    if (!payment) return res.status(404).json({ message: 'Invoice not found' });
    if (!isAdminPortalRole(req.user.role) && payment.user_id !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    res.status(200).json({ payment });
  } catch (error) {
    res.status(500).json({ message: paymentErrorMessage(error) });
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
      await pool.query(
        'UPDATE payments SET amount = ? WHERE id = ? AND status IN (?, ?)',
        [amount, invoiceId, 'Pending', 'Partially Paid']
      );
    }
    if (method) {
      await pool.query('UPDATE payments SET method = ? WHERE id = ?', [method, invoiceId]);
    }

    const payment = await loadPaymentDetail(invoiceId);
    res.status(201).json({ message: 'Invoice ready', payment });
  } catch (error) {
    res.status(paymentErrorStatus(error)).json({ message: paymentErrorMessage(error) });
  }
};

export const sendPaymentInvoice = async (req, res) => {
  try {
    const paymentId = parsePaymentId(req.params.id);
    if (!paymentId) return res.status(400).json({ message: 'Invalid invoice id' });

    const payment = await loadPaymentDetail(paymentId);
    if (!payment) return res.status(404).json({ message: 'Invoice not found' });

    const updated = await sendInvoiceEmail(paymentId);
    const message = isEmailDevMode()
      ? `Invoice preview generated for ${updated.guest_email} (development mode — no email was delivered and sent status was not changed)`
      : `Invoice emailed to ${updated.guest_email}`;
    res.status(200).json({ message, payment: updated, emailDevMode: isEmailDevMode() });
  } catch (error) {
    res.status(paymentErrorStatus(error)).json({ message: paymentErrorMessage(error) });
  }
};

export const updatePayment = async (req, res) => {
  try {
    const paymentId = parsePaymentId(req.params.id);
    if (!paymentId) return res.status(400).json({ message: 'Invalid invoice id' });

    const { status, method, discount_amount, discount_note, discount_mode, subtotal } = req.body;
    const existing = await loadPaymentDetail(paymentId);
    if (!existing) return res.status(404).json({ message: 'Invoice not found' });

    let payment = existing;

    if (discount_amount != null || discount_note !== undefined || discount_mode != null || subtotal != null) {
      payment = await updateInvoiceBilling(paymentId, {
        discount_amount,
        discount_note,
        discount_mode,
        subtotal,
      });
    }

    if (status === 'Paid') {
      payment = await markInvoicePaid(paymentId, { method }, req.user.id);
      return res.status(200).json({
        message: 'Payment recorded. Reservation stays active — room availability is based on stay dates, not payment.',
        payment,
      });
    }

    if (status) {
      await pool.query('UPDATE payments SET status = ? WHERE id = ?', [status, paymentId]);
      payment = await loadPaymentDetail(paymentId);
    }

    res.status(200).json({ message: 'Invoice updated', payment });
  } catch (error) {
    res.status(paymentErrorStatus(error)).json({ message: paymentErrorMessage(error) });
  }
};

export const getPaymentTransactions = async (req, res) => {
  try {
    const paymentId = parsePaymentId(req.params.id);
    if (!paymentId) return res.status(400).json({ message: 'Invalid invoice id' });

    const payment = await loadPaymentDetail(paymentId);
    if (!payment) return res.status(404).json({ message: 'Invoice not found' });
    if (!isAdminPortalRole(req.user.role) && payment.user_id !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    res.status(200).json({
      transactions: payment.transactions || [],
      summary: payment.summary || null,
    });
  } catch (error) {
    res.status(500).json({ message: paymentErrorMessage(error) });
  }
};

export const createPaymentTransaction = async (req, res) => {
  try {
    const paymentId = parsePaymentId(req.params.id);
    if (!paymentId) return res.status(400).json({ message: 'Invalid invoice id' });

    const { type, amount, method, notes } = req.body;
    if (!type) return res.status(400).json({ message: 'type is required' });
    if (amount == null) return res.status(400).json({ message: 'amount is required' });

    const payment = await recordPaymentTransaction(
      paymentId,
      { type, amount, method, notes },
      req.user.id,
      { skipReceipt: false }
    );
    if (!payment) {
      return res.status(500).json({ message: 'Payment was recorded but the invoice could not be reloaded.' });
    }

    const typeLabel = type.charAt(0) + type.slice(1).toLowerCase();
    res.status(201).json({
      message: `${typeLabel} recorded for ${payment.guest_name}.`,
      payment,
    });
  } catch (error) {
    res.status(paymentErrorStatus(error)).json({ message: paymentErrorMessage(error) });
  }
};

export const clearPaidPayments = async (req, res) => {
  try {
    const { deleted } = await clearAllPaidInvoices(req.user.id);
    res.status(200).json({
      message: deleted
        ? `Cleared ${deleted} paid invoice${deleted === 1 ? '' : 's'} from billing records.`
        : 'No paid invoices to clear.',
      deleted,
    });
  } catch (error) {
    res.status(paymentErrorStatus(error)).json({ message: paymentErrorMessage(error) });
  }
};

export const deletePaidPayment = async (req, res) => {
  try {
    const paymentId = parsePaymentId(req.params.id);
    if (!paymentId) return res.status(400).json({ message: 'Invalid invoice id' });

    const cleared = await deletePaidInvoice(paymentId, req.user.id);
    res.status(200).json({
      message: `Invoice #${cleared.id} for ${cleared.guest_name} cleared from billing records.`,
      cleared,
    });
  } catch (error) {
    res.status(paymentErrorStatus(error)).json({ message: paymentErrorMessage(error) });
  }
};

export const convertPaymentReservation = async (req, res) => {
  try {
    const paymentId = parsePaymentId(req.params.id);
    if (!paymentId) return res.status(400).json({ message: 'Invalid invoice id' });

    const existing = await loadPaymentDetail(paymentId);
    if (!existing) return res.status(404).json({ message: 'Invoice not found' });

    const payment = await convertPaymentReservationKind(paymentId, req.body);
    res.status(200).json({
      message: 'Overnight billing updated for this venue reservation.',
      payment,
    });
  } catch (error) {
    res.status(paymentErrorStatus(error)).json({ message: paymentErrorMessage(error) });
  }
};

export const revertPaymentOvernight = async (req, res) => {
  try {
    const paymentId = parsePaymentId(req.params.id);
    if (!paymentId) return res.status(400).json({ message: 'Invalid invoice id' });

    const existing = await loadPaymentDetail(paymentId);
    if (!existing) return res.status(404).json({ message: 'Invoice not found' });

    const payment = await revertVenueOvernightBilling(paymentId, req.body);
    res.status(200).json({
      message: 'Reverted to venue event booking. Invoice totals updated.',
      payment,
    });
  } catch (error) {
    res.status(paymentErrorStatus(error)).json({ message: paymentErrorMessage(error) });
  }
};
