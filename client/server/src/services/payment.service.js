import { pool } from '../config/db.js';
import {
  sendHousingInvoiceEmail,
  sendVenueInvoiceEmail,
  sendPaymentReceiptEmail,
  getLastEmailError,
  isVenuePayment,
} from './email.service.js';
import { getBookingMeals, getBookingFees } from './booking.service.js';

export const paymentRoomDetailSelect = `
  SELECT p.id, p.bookings_room_id AS booking_id, p.bookings_facility_id AS facility_booking_id,
         'room' AS invoice_kind,
         p.subtotal, p.discount_amount, p.discount_note,
         p.amount, p.method, p.status, p.paid_at, p.invoice_sent_at, p.billing_invoice_sent_at, p.created_at, p.updated_at,
         b.user_id, b.check_in, b.check_out, b.status AS booking_status, b.guest_count,
         b.total_amount AS booking_total, b.group_id, b.season, b.occupancy_item,
         b.notes, b.contact_phone, b.meal_allergen_notes,
         u.full_name AS guest_name, u.email AS guest_email,
         r.id AS room_id, r.room_number, r.room_type, r.status AS room_status,
         bl.name AS building_name,
         rg.group_name,
         NULL AS event_date, NULL AS start_time, NULL AS end_time,
         NULL AS facility_category, NULL AS facility_name,
         NULL AS facility_room_code, NULL AS facility_package
  FROM payments p
  JOIN bookings_rooms b ON p.bookings_room_id = b.id
  JOIN users u ON b.user_id = u.id
  JOIN rooms r ON b.room_id = r.id
  JOIN buildings bl ON r.building_id = bl.id
  LEFT JOIN reservation_groups rg ON b.group_id = rg.id
`;

export const paymentVenueDetailSelect = `
  SELECT p.id, NULL AS booking_id, p.bookings_facility_id AS facility_booking_id,
         'venue' AS invoice_kind,
         p.subtotal, p.discount_amount, p.discount_note,
         p.amount, p.method, p.status, p.paid_at, p.invoice_sent_at, p.billing_invoice_sent_at, p.created_at, p.updated_at,
         fb.user_id, NULL AS check_in, NULL AS check_out, fb.status AS booking_status, fb.guest_count,
         fb.total_amount AS booking_total, NULL AS group_id, fb.season, NULL AS occupancy_item,
         fb.notes, NULL AS contact_phone, NULL AS meal_allergen_notes,
         u.full_name AS guest_name, u.email AS guest_email,
         NULL AS room_id, NULL AS room_number, NULL AS room_type, NULL AS room_status, NULL AS building_name,
         NULL AS group_name,
         fb.event_date, fb.start_time, fb.end_time,
         f.facility_group AS facility_category, f.name AS facility_name,
         f.room_code AS facility_room_code, f.package_name AS facility_package,
         rf.rate AS facility_rate
  FROM payments p
  JOIN bookings_facilities fb ON p.bookings_facility_id = fb.id
  JOIN users u ON fb.user_id = u.id
  JOIN facilities f ON fb.facility_id = f.id
  LEFT JOIN rates_facilities rf ON rf.facility_id = f.id AND rf.season = fb.season
`;

/** @deprecated use paymentRoomDetailSelect */
export const paymentDetailSelect = paymentRoomDetailSelect;

function sortPaymentRows(rows) {
  return [...rows].sort((a, b) => {
    const openStatuses = ['Pending', 'Partially Paid'];
    const pendingA = openStatuses.includes(a.status) ? 0 : 1;
    const pendingB = openStatuses.includes(b.status) ? 0 : 1;
    if (pendingA !== pendingB) return pendingA - pendingB;
    return new Date(b.created_at) - new Date(a.created_at);
  });
}

export async function listAllPaymentRows({ userId } = {}) {
  const roomSql = userId
    ? `${paymentRoomDetailSelect} WHERE b.status = 'Approved' AND b.user_id = ?`
    : `${paymentRoomDetailSelect} WHERE b.status = 'Approved'`;
  const venueSql = userId
    ? `${paymentVenueDetailSelect} WHERE fb.status = 'Approved' AND fb.user_id = ?`
    : `${paymentVenueDetailSelect} WHERE fb.status = 'Approved'`;

  const [[roomRows], [venueRows]] = await Promise.all([
    pool.query(roomSql, userId ? [userId] : []),
    pool.query(venueSql, userId ? [userId] : []),
  ]);

  return sortPaymentRows([...roomRows, ...venueRows]);
}

function calcNights(checkIn, checkOut) {
  const start = new Date(`${checkIn}T12:00:00`);
  const end = new Date(`${checkOut}T12:00:00`);
  return Math.max(1, Math.round((end - start) / 86400000));
}

export async function enrichPaymentRow(row) {
  if (!row) return null;
  if (isVenuePayment(row)) {
    return { ...row, meals: [], fees: [], nights: null };
  }
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
  const enriched = await Promise.all(rows.map(enrichPaymentRow));
  return attachSummariesToPayments(enriched);
}

export function computeDueAmount(subtotal, discountAmount = 0) {
  const due = Number(subtotal) - Number(discountAmount || 0);
  return Math.max(0, Math.round(due * 100) / 100);
}

const PAYMENT_IN_TYPES = ['Deposit', 'Advance', 'Settlement'];
const PAYMENT_OUT_TYPES = ['Refund'];

function mapPaymentDbError(err) {
  if (!err) return new Error('Something went wrong. Please try again.');
  if (err.code === 'ER_NO_SUCH_TABLE') {
    return new Error('Billing tables are missing. Restart the server or run the payment ledger migration.');
  }
  if (err.code === 'ER_BAD_FIELD_ERROR') {
    return new Error('Billing schema is out of date. Restart the server to apply database updates.');
  }
  if (err.code === 'ECONNREFUSED' || err.code === 'PROTOCOL_CONNECTION_LOST') {
    return new Error('Database connection failed. Please try again shortly.');
  }
  return err;
}

async function runPaymentQuery(sql, params) {
  try {
    return await pool.query(sql, params);
  } catch (err) {
    throw mapPaymentDbError(err);
  }
}

export async function getPaymentLedger(paymentId) {
  const [rows] = await runPaymentQuery(
    `SELECT pt.*, u.full_name AS recorded_by_name
     FROM payment_transactions pt
     LEFT JOIN users u ON u.id = pt.recorded_by
     WHERE pt.payment_id = ?
     ORDER BY pt.recorded_at ASC, pt.id ASC`,
    [paymentId]
  );
  return rows;
}

export function computePaymentSummary(invoice, transactions = []) {
  const subtotal = Number(invoice.subtotal ?? invoice.booking_total ?? invoice.amount ?? 0);
  const totalDue = computeDueAmount(subtotal, invoice.discount_amount);

  if (!transactions.length && invoice.status === 'Paid') {
    return {
      total_due: totalDue,
      amount_paid: totalDue,
      balance_due: 0,
      credit_balance: 0,
    };
  }

  const paidIn = transactions
    .filter((t) => PAYMENT_IN_TYPES.includes(t.type))
    .reduce((s, t) => s + Number(t.amount), 0);
  const refunded = transactions
    .filter((t) => PAYMENT_OUT_TYPES.includes(t.type))
    .reduce((s, t) => s + Number(t.amount), 0);
  const amountPaid = Math.round((paidIn - refunded) * 100) / 100;
  const balanceDue = Math.max(0, Math.round((totalDue - amountPaid) * 100) / 100);
  const creditBalance = Math.max(0, Math.round((amountPaid - totalDue) * 100) / 100);

  return {
    total_due: totalDue,
    amount_paid: amountPaid,
    balance_due: balanceDue,
    credit_balance: creditBalance,
  };
}

export async function getDepositSettings() {
  const [rows] = await pool.query(
    `SELECT setting_key, setting_value FROM system_settings
     WHERE setting_key IN ('deposit_required', 'deposit_mode', 'deposit_value')`
  );
  const map = Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value]));
  return {
    deposit_required: map.deposit_required === '1',
    deposit_mode: map.deposit_mode === 'fixed' ? 'fixed' : 'percent',
    deposit_value: Number(map.deposit_value) || 50,
  };
}

export function computeSuggestedDeposit(totalDue, settings) {
  if (!settings?.deposit_required || totalDue <= 0) return 0;
  if (settings.deposit_mode === 'fixed') {
    return Math.min(totalDue, Math.round(Number(settings.deposit_value) * 100) / 100);
  }
  return Math.round(totalDue * (Number(settings.deposit_value) / 100) * 100) / 100;
}

export async function getSuggestedDeposit(totalDue) {
  const settings = await getDepositSettings();
  return computeSuggestedDeposit(totalDue, settings);
}

async function syncPaymentStatus(paymentId) {
  const [rows] = await pool.query('SELECT * FROM payments WHERE id = ? LIMIT 1', [paymentId]);
  if (!rows.length) return;
  const invoice = rows[0];
  const transactions = await getPaymentLedger(paymentId);
  const summary = computePaymentSummary(invoice, transactions);

  let status = 'Pending';
  if (summary.total_due <= 0 && summary.amount_paid <= 0) {
    status = invoice.status === 'Paid' ? 'Paid' : 'Pending';
  } else if (summary.balance_due <= 0 && summary.amount_paid > 0) {
    status = 'Paid';
  } else if (summary.amount_paid > 0) {
    status = 'Partially Paid';
  }

  const lastInTx = [...transactions].reverse().find((t) => PAYMENT_IN_TYPES.includes(t.type));
  const paidAt = status === 'Paid' ? (invoice.paid_at || new Date()) : null;
  const method = status === 'Paid' ? (lastInTx?.method || invoice.method) : invoice.method;

  await pool.query(
    `UPDATE payments
     SET status = ?, method = ?, paid_at = ?
     WHERE id = ?`,
    [status, method, paidAt, paymentId]
  );
}

export async function attachSummariesToPayments(rows) {
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.id);
  const settings = await getDepositSettings();
  const [txRows] = await pool.query(
    `SELECT * FROM payment_transactions WHERE payment_id IN (?) ORDER BY recorded_at ASC, id ASC`,
    [ids]
  );
  const byPayment = new Map();
  for (const tx of txRows) {
    if (!byPayment.has(tx.payment_id)) byPayment.set(tx.payment_id, []);
    byPayment.get(tx.payment_id).push(tx);
  }
  return rows.map((row) => {
    const transactions = byPayment.get(row.id) || [];
    const summary = computePaymentSummary(row, transactions);
    const suggested_deposit = computeSuggestedDeposit(summary.total_due, settings);
    const deposit_paid = transactions
      .filter((t) => t.type === 'Deposit')
      .reduce((s, t) => s + Number(t.amount), 0);
    return {
      ...row,
      summary,
      transaction_count: transactions.length,
      suggested_deposit,
      deposit_paid,
      deposit_outstanding: Math.max(0, Math.round((suggested_deposit - deposit_paid) * 100) / 100),
    };
  });
}

export async function getInvoiceByBookingId(bookingId) {
  const [rows] = await pool.query(
    'SELECT * FROM payments WHERE bookings_room_id = ? LIMIT 1',
    [bookingId]
  );
  return rows[0] || null;
}

export async function getInvoiceByFacilityBookingId(facilityBookingId) {
  const [rows] = await pool.query(
    'SELECT * FROM payments WHERE bookings_facility_id = ? LIMIT 1',
    [facilityBookingId]
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

async function dispatchInvoiceEmail(payment) {
  const user = { full_name: payment.guest_name, email: payment.guest_email };
  if (isVenuePayment(payment)) {
    return sendVenueInvoiceEmail(user, payment);
  }
  return sendHousingInvoiceEmail(user, payment);
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
    if (existing.status !== 'Paid') {
      const amount = computeDueAmount(subtotal, existing.discount_amount);
      await pool.query(
        'UPDATE payments SET subtotal = ?, amount = ? WHERE id = ? AND status != ?',
        [subtotal, amount, existing.id, 'Paid']
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

export async function ensureInvoiceForFacilityBooking(facilityBookingId, { autoEmail = false } = {}) {
  const [bookings] = await pool.query(
    'SELECT id, total_amount, status FROM bookings_facilities WHERE id = ?',
    [facilityBookingId]
  );
  if (!bookings.length || bookings[0].status !== 'Approved') return null;

  const subtotal = Number(bookings[0].total_amount || 0);
  if (subtotal <= 0) return null;

  const existing = await getInvoiceByFacilityBookingId(facilityBookingId);
  if (existing) {
    if (existing.status !== 'Paid') {
      const amount = computeDueAmount(subtotal, existing.discount_amount);
      await pool.query(
        'UPDATE payments SET subtotal = ?, amount = ? WHERE id = ? AND status != ?',
        [subtotal, amount, existing.id, 'Paid']
      );
    }
    if (autoEmail && existing.status === 'Pending' && !existing.invoice_sent_at) {
      await tryAutoSendInvoiceEmail(existing.id);
    }
    return existing.id;
  }

  const amount = computeDueAmount(subtotal, 0);
  const [result] = await pool.query(
    `INSERT INTO payments (bookings_facility_id, subtotal, discount_amount, discount_note, amount, status)
     VALUES (?, ?, 0, NULL, ?, 'Pending')`,
    [facilityBookingId, subtotal, amount]
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
  const [meta] = await pool.query(
    'SELECT bookings_room_id, bookings_facility_id FROM payments WHERE id = ? LIMIT 1',
    [paymentId]
  );
  if (!meta.length) return null;

  let row;
  if (meta[0].bookings_facility_id) {
    const [rows] = await pool.query(`${paymentVenueDetailSelect} WHERE p.id = ? LIMIT 1`, [paymentId]);
    row = rows[0];
  } else {
    const [rows] = await pool.query(`${paymentRoomDetailSelect} WHERE p.id = ? LIMIT 1`, [paymentId]);
    row = rows[0];
  }

  const payment = await enrichPaymentRow(row);
  if (!payment) return null;

  const transactions = await getPaymentLedger(paymentId);
  const summary = computePaymentSummary(payment, transactions);
  const suggested_deposit = await getSuggestedDeposit(summary.total_due);
  const deposit_paid = transactions
    .filter((t) => t.type === 'Deposit')
    .reduce((s, t) => s + Number(t.amount), 0);

  return {
    ...payment,
    transactions,
    summary,
    suggested_deposit,
    deposit_paid,
    deposit_outstanding: Math.max(0, Math.round((suggested_deposit - deposit_paid) * 100) / 100),
  };
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

  const sent = await dispatchInvoiceEmail(payment);
  if (!sent) {
    const detail = getLastEmailError();
    console.warn(`[invoice email] Auto-send failed for #${paymentId} → ${payment.guest_email}:`, detail);
    return { sent: false, error: detail || 'Email delivery failed' };
  }

  await pool.query('UPDATE payments SET invoice_sent_at = NOW() WHERE id = ?', [paymentId]);
  console.info(`[invoice email] Sent invoice #${paymentId} to ${payment.guest_email}`);
  return { sent: true, to: payment.guest_email };
}

export async function sendInvoiceEmail(paymentId) {
  const payment = await loadPaymentDetail(paymentId);
  if (!payment) throw new Error('Invoice not found');
  if (payment.status === 'Paid') throw new Error('This invoice is already paid');

  const sent = await dispatchInvoiceEmail(payment);
  if (!sent) {
    const detail = getLastEmailError();
    throw new Error(
      detail
        ? `Could not send email: ${detail}`
        : 'Could not send email. Check SMTP settings in client/server/.env.'
    );
  }

  await pool.query(
    'UPDATE payments SET invoice_sent_at = NOW(), billing_invoice_sent_at = NOW() WHERE id = ?',
    [paymentId]
  );
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

  await syncPaymentStatus(paymentId);
  return loadPaymentDetail(paymentId);
}

export async function markInvoicePaid(paymentId, { method } = {}, actorUserId = null) {
  const payment = await loadPaymentDetail(paymentId);
  if (!payment) throw new Error('Invoice not found');
  if (payment.status === 'Paid') throw new Error('Invoice is already marked as paid');

  const summary = payment.summary || computePaymentSummary(payment, payment.transactions || []);
  const payMethod = method || 'Waived';

  if (summary.total_due <= 0) {
    await pool.query(
      `UPDATE payments SET status = 'Paid', method = ?, paid_at = ? WHERE id = ?`,
      [payMethod, new Date(), paymentId]
    );
  } else if (summary.balance_due > 0) {
    if (!method) throw new Error('Payment method is required');
    await recordPaymentTransaction(
      paymentId,
      { type: 'Settlement', amount: summary.balance_due, method: payMethod },
      actorUserId,
      { skipReceipt: true, reload: false }
    );
  } else {
    await syncPaymentStatus(paymentId);
  }

  const updated = await loadPaymentDetail(paymentId);
  void sendPaymentReceiptEmail(
    { full_name: updated.guest_name, email: updated.guest_email },
    updated
  );
  return updated;
}

export async function recordPaymentTransaction(
  paymentId,
  { type, amount, method, notes },
  actorUserId = null,
  { skipReceipt = true, reload = true } = {}
) {
  const [invoiceRows] = await pool.query('SELECT * FROM payments WHERE id = ? LIMIT 1', [paymentId]);
  if (!invoiceRows.length) throw new Error('Invoice not found');
  const invoice = invoiceRows[0];

  if (invoice.status === 'Paid' && type !== 'Refund') {
    throw new Error('Invoice is already fully paid');
  }

  const validTypes = ['Deposit', 'Advance', 'Settlement', 'Refund', 'Adjustment'];
  if (!validTypes.includes(type)) throw new Error('Invalid transaction type');

  const txAmount = Number(amount);
  if (!Number.isFinite(txAmount) || txAmount <= 0) {
    throw new Error('Amount must be greater than zero');
  }
  if (!method) throw new Error('Payment method is required');

  const transactions = await getPaymentLedger(paymentId);
  const summary = computePaymentSummary(invoice, transactions);

  if (type === 'Refund') {
    if (summary.credit_balance <= 0) throw new Error('No credit available to refund');
    if (txAmount > summary.credit_balance) {
      throw new Error('Refund exceeds available credit');
    }
  } else if (type === 'Advance') {
    // Advance may exceed balance due (prepayment)
  } else if (txAmount > summary.balance_due) {
    throw new Error('Amount exceeds balance due. Use Advance for prepayment beyond the balance.');
  }

  try {
    await runPaymentQuery(
      `INSERT INTO payment_transactions (payment_id, type, amount, method, notes, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [paymentId, type, txAmount, method, notes || null, actorUserId]
    );
  } catch (err) {
    throw mapPaymentDbError(err);
  }

  await syncPaymentStatus(paymentId);

  if (!reload) return null;

  const updated = await loadPaymentDetail(paymentId);
  if (!skipReceipt && updated.status === 'Paid') {
    void sendPaymentReceiptEmail(
      { full_name: updated.guest_name, email: updated.guest_email },
      updated
    );
  }
  return updated;
}

export async function deletePaidInvoice(paymentId, actorUserId = null) {
  const payment = await loadPaymentDetail(paymentId);
  if (!payment) throw new Error('Invoice not found');
  if (payment.status !== 'Paid') {
    throw new Error('Only fully paid invoices can be cleared. Open or partial invoices cannot be deleted.');
  }

  try {
    await runPaymentQuery('DELETE FROM payment_transactions WHERE payment_id = ?', [paymentId]);
    const [result] = await runPaymentQuery(
      'DELETE FROM payments WHERE id = ? AND status = ?',
      [paymentId, 'Paid']
    );
    if (!result.affectedRows) throw new Error('Invoice could not be cleared');
  } catch (err) {
    throw mapPaymentDbError(err);
  }

  try {
    const { logAudit } = await import('./audit.service.js');
    await logAudit({
      actorUserId,
      action: 'payment_invoice_cleared',
      entityType: 'payment',
      entityId: Number(paymentId),
      details: {
        guest_name: payment.guest_name,
        amount: payment.summary?.amount_paid ?? payment.amount,
        booking_id: payment.booking_id,
        facility_booking_id: payment.facility_booking_id,
      },
    });
  } catch {
    /* audit is best-effort */
  }

  return {
    id: Number(paymentId),
    guest_name: payment.guest_name,
  };
}

export async function clearAllPaidInvoices(actorUserId = null) {
  const [rows] = await pool.query(
    `SELECT id FROM payments WHERE status = 'Paid'`
  );
  if (!rows.length) return { deleted: 0 };

  const ids = rows.map((r) => r.id);
  let deleted = 0;
  try {
    await runPaymentQuery('DELETE FROM payment_transactions WHERE payment_id IN (?)', [ids]);
    const [result] = await runPaymentQuery('DELETE FROM payments WHERE status = ?', ['Paid']);
    deleted = result.affectedRows;
  } catch (err) {
    throw mapPaymentDbError(err);
  }

  try {
    const { logAudit } = await import('./audit.service.js');
    await logAudit({
      actorUserId,
      action: 'payment_invoices_bulk_cleared',
      entityType: 'payment',
      entityId: null,
      details: { count: deleted, payment_ids: ids },
    });
  } catch {
    /* audit is best-effort */
  }

  return { deleted };
}
