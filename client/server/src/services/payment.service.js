import { pool } from '../config/db.js';
import { sendHousingInvoiceEmail, sendPaymentReceiptEmail, getLastEmailError } from './email.service.js';
import { getBookingMeals, getBookingFees } from './booking.service.js';

export const paymentDetailSelect = `
  SELECT p.id, p.bookings_room_id AS booking_id, p.subtotal, p.discount_amount, p.discount_note,
         p.amount, p.method, p.status, p.paid_at, p.invoice_sent_at, p.created_at, p.updated_at,
         b.user_id, b.check_in, b.check_out, b.status AS booking_status, b.guest_count,
         b.total_amount AS booking_total, b.group_id, b.season, b.occupancy_item,
         b.notes, b.contact_phone, b.meal_allergen_notes,
         u.full_name AS guest_name, u.email AS guest_email,
         r.id AS room_id, r.room_number, r.room_type, r.status AS room_status,
         bl.name AS building_name,
         rg.group_name
  FROM payments p
  JOIN bookings_rooms b ON p.bookings_room_id = b.id
  JOIN users u ON b.user_id = u.id
  JOIN rooms r ON b.room_id = r.id
  JOIN buildings bl ON r.building_id = bl.id
  LEFT JOIN reservation_groups rg ON b.group_id = rg.id
`;

function calcNights(checkIn, checkOut) {
  const start = new Date(`${checkIn}T12:00:00`);
  const end = new Date(`${checkOut}T12:00:00`);
  return Math.max(1, Math.round((end - start) / 86400000));
}

export async function enrichPaymentRow(row) {
  if (!row) return null;
  const [meals, fees] = await Promise.all([
    getBookingMeals(row.booking_id),
    getBookingFees(row.booking_id),
  ]);
  return {
    ...row,
    meals,
    fees,
    nights: calcNights(row.check_in, row.check_out),
  };
}

export async function enrichPaymentRows(rows) {
  return Promise.all(rows.map(enrichPaymentRow));
}

export function computeDueAmount(subtotal, discountAmount = 0) {
  const due = Number(subtotal) - Number(discountAmount || 0);
  return Math.max(0.01, Math.round(due * 100) / 100);
}

export async function getInvoiceByBookingId(bookingId) {
  const [rows] = await pool.query(
    'SELECT * FROM payments WHERE bookings_room_id = ? LIMIT 1',
    [bookingId]
  );
  return rows[0] || null;
}

export async function getInvoiceSnapshot(bookingId) {
  const invoice = await getInvoiceByBookingId(bookingId);
  if (!invoice) return null;
  return {
    id: invoice.id,
    status: invoice.status,
    amount: invoice.amount,
    subtotal: invoice.subtotal ?? invoice.amount,
    discount_amount: Number(invoice.discount_amount || 0),
    discount_note: invoice.discount_note,
    invoice_sent_at: invoice.invoice_sent_at,
    paid_at: invoice.paid_at,
    method: invoice.method,
  };
}

export async function ensureInvoiceForBooking(bookingId, { autoEmail = false } = {}) {
  const [bookings] = await pool.query(
    'SELECT id, total_amount, status FROM bookings_rooms WHERE id = ?',
    [bookingId]
  );
  if (!bookings.length || bookings[0].status !== 'Approved') return null;

  const subtotal = Number(bookings[0].total_amount || 0);
  if (subtotal <= 0) return null;

  const existing = await getInvoiceByBookingId(bookingId);
  if (existing) {
    if (existing.status === 'Pending') {
      const amount = computeDueAmount(subtotal, existing.discount_amount);
      await pool.query(
        'UPDATE payments SET subtotal = ?, amount = ? WHERE id = ? AND status = ?',
        [subtotal, amount, existing.id, 'Pending']
      );
    }
    if (autoEmail && existing.status === 'Pending' && !existing.invoice_sent_at) {
      await tryAutoSendInvoiceEmail(existing.id);
    }
    return existing.id;
  }

  const amount = computeDueAmount(subtotal, 0);
  const [result] = await pool.query(
    `INSERT INTO payments (bookings_room_id, subtotal, discount_amount, discount_note, amount, status)
     VALUES (?, ?, 0, NULL, ?, 'Pending')`,
    [bookingId, subtotal, amount]
  );
  const paymentId = result.insertId;
  if (autoEmail) {
    await tryAutoSendInvoiceEmail(paymentId);
  }
  return paymentId;
}

export async function ensureInvoicesForGroup(groupId, { autoEmail = false } = {}) {
  const [rows] = await pool.query(
    `SELECT id FROM bookings_rooms WHERE group_id = ? AND status = 'Approved'`,
    [groupId]
  );
  const ids = [];
  for (const row of rows) {
    const id = await ensureInvoiceForBooking(row.id, { autoEmail });
    if (id) ids.push(id);
  }
  return ids;
}

export async function loadPaymentDetail(paymentId) {
  const [rows] = await pool.query(`${paymentDetailSelect} WHERE p.id = ? LIMIT 1`, [paymentId]);
  return enrichPaymentRow(rows[0]);
}

export async function tryAutoSendInvoiceEmail(paymentId) {
  const payment = await loadPaymentDetail(paymentId);
  if (!payment || payment.status === 'Paid') {
    return { sent: false, skipped: true };
  }
  if (payment.invoice_sent_at) {
    return { sent: false, skipped: true, reason: 'already_sent' };
  }
  if (!payment.guest_email) {
    console.warn(`[invoice email] No guest email for payment #${paymentId}`);
    return { sent: false, error: 'Guest has no email address on file' };
  }

  const sent = await sendHousingInvoiceEmail(
    { full_name: payment.guest_name, email: payment.guest_email },
    payment
  );
  if (!sent) {
    const detail = getLastEmailError();
    console.warn(`[invoice email] Auto-send failed for #${paymentId} → ${payment.guest_email}:`, detail);
    return { sent: false, error: detail || 'Email delivery failed' };
  }

  await pool.query('UPDATE payments SET invoice_sent_at = NOW() WHERE id = ?', [paymentId]);
  console.info(`[invoice email] Sent housing invoice #${paymentId} to ${payment.guest_email}`);
  return { sent: true, to: payment.guest_email };
}

export async function sendInvoiceEmail(paymentId) {
  const payment = await loadPaymentDetail(paymentId);
  if (!payment) throw new Error('Invoice not found');
  if (payment.status === 'Paid') throw new Error('This invoice is already paid');

  const sent = await sendHousingInvoiceEmail(
    { full_name: payment.guest_name, email: payment.guest_email },
    payment
  );
  if (!sent) {
    const detail = getLastEmailError();
    throw new Error(
      detail
        ? `Could not send email: ${detail}`
        : 'Could not send email. Check SMTP settings in client/server/.env.'
    );
  }

  await pool.query('UPDATE payments SET invoice_sent_at = NOW() WHERE id = ?', [paymentId]);
  return loadPaymentDetail(paymentId);
}

export async function updateInvoiceBilling(paymentId, { discount_amount, discount_note } = {}) {
  const payment = await loadPaymentDetail(paymentId);
  if (!payment) throw new Error('Invoice not found');
  if (payment.status === 'Paid') throw new Error('Cannot change billing on a paid invoice');

  const subtotal = Number(payment.subtotal ?? payment.booking_total ?? payment.amount);
  const discount = Math.max(0, Number(discount_amount ?? payment.discount_amount ?? 0));
  if (discount > subtotal) throw new Error('Discount cannot be greater than the subtotal');

  const amount = computeDueAmount(subtotal, discount);
  const note = discount_note !== undefined ? (discount_note || null) : payment.discount_note;

  await pool.query(
    `UPDATE payments SET subtotal = ?, discount_amount = ?, discount_note = ?, amount = ? WHERE id = ?`,
    [subtotal, discount, note, amount, paymentId]
  );
  return loadPaymentDetail(paymentId);
}

export async function markInvoicePaid(paymentId, { method } = {}) {
  const payment = await loadPaymentDetail(paymentId);
  if (!payment) throw new Error('Invoice not found');
  if (payment.status === 'Paid') throw new Error('Invoice is already marked as paid');
  if (!method) throw new Error('Payment method is required');

  const paidAt = new Date();
  await pool.query(
    `UPDATE payments SET status = 'Paid', method = ?, paid_at = ? WHERE id = ?`,
    [method, paidAt, paymentId]
  );

  const updated = await loadPaymentDetail(paymentId);
  void sendPaymentReceiptEmail(
    { full_name: updated.guest_name, email: updated.guest_email },
    updated
  );
  return updated;
}
