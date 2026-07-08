import { pool } from '../config/db.js';
import {
  sendHousingInvoiceEmail,
  sendVenueInvoiceEmail,
  sendPaymentReceiptEmail,
  getLastEmailError,
  isVenuePayment,
} from './email.service.js';
import {
  getBookingMeals,
  getBookingFees,
} from './booking.service.js';
import { validateReservationDates } from './fiscalYear.service.js';
import {
  resolveFacilityIdentity,
  resolveVenueFacilityRowByFacilityId,
  computeVenueTotal,
  validateVenueDuration,
  validateVenueCapacity,
  findVenueBookingOverlap,
  normalizeFacilityBookingSeason,
  normalizeTimeValue,
} from './facility.service.js';

export const paymentRoomDetailSelect = `
  SELECT p.id, p.bookings_room_id AS booking_id, p.bookings_facility_id AS facility_booking_id,
         'room' AS invoice_kind,
         p.subtotal, p.discount_amount, p.discount_note,
         p.amount, p.method, p.status, p.paid_at, p.invoice_sent_at, p.billing_invoice_sent_at, p.created_at, p.updated_at,
         b.user_id, b.check_in, b.check_out, b.status AS booking_status, b.guest_count,
         b.total_amount AS booking_total, b.group_id, b.season, b.occupancy_item,
         b.notes, b.contact_phone, b.meal_allergen_notes, b.pricing_category,
         u.full_name AS guest_name, u.email AS guest_email,
         r.id AS room_id, r.room_number, r.room_type, r.status AS room_status,
         bl.name AS building_name,
         rg.group_name,
         NULL AS event_date, NULL AS start_time, NULL AS end_time,
         NULL AS facility_id,
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
         fb.facility_id,
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

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

export function isVenueBillingOvernight(notes) {
  return /\[Converted to overnight stay\]/i.test(String(notes || ''));
}

export function parseVenueStayBillingMeta(notes) {
  const text = String(notes || '');
  const checkIn = text.match(/\[Stay check-in:\s*([^\]]+)\]/i)?.[1]?.trim().slice(0, 10) || null;
  const checkOut = text.match(/\[Stay check-out:\s*([^\]]+)\]/i)?.[1]?.trim().slice(0, 10) || null;
  const venueCode = text.match(/\[Venue stay:\s*([^\]]+)\]/i)?.[1]?.trim() || null;
  return {
    converted: isVenueBillingOvernight(text),
    check_in: checkIn,
    check_out: checkOut,
    venue_code: venueCode,
  };
}

function stripVenueStayBillingTags(notes) {
  return String(notes || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^\[(Modified by admin|Converted to overnight stay|Venue stay:|Stay check-in:|Stay check-out:)/i.test(line))
    .join('\n')
    .trim();
}

function replaceVenueStayBillingTags(existingNotes, {
  guestNotes, venueLabel, check_in, check_out, modificationMessage, isFirstConversion,
}) {
  const base = guestNotes != null
    ? String(guestNotes).trim()
    : stripVenueStayBillingTags(existingNotes);
  const lines = [];
  if (base) lines.push(base);

  if (isFirstConversion) {
    const modLine = modificationMessage?.trim()
      ? `[Modified by admin] ${modificationMessage.trim()}`
      : '[Modified by admin] Converted to overnight stay in billing';
    lines.push(modLine, '[Converted to overnight stay]');
  } else if (modificationMessage?.trim()) {
    lines.push(`[Modified by admin] ${modificationMessage.trim()}`);
  }

  lines.push(
    `[Venue stay: ${venueLabel}]`,
    `[Stay check-in: ${check_in}]`,
    `[Stay check-out: ${check_out}]`,
  );
  return lines.join('\n');
}

function notesAfterOvernightRevert(existingNotes, { guestNotes, modificationMessage }) {
  const base = guestNotes != null
    ? String(guestNotes).trim()
    : stripVenueStayBillingTags(existingNotes);
  const lines = [];
  if (base) lines.push(base);
  const modLine = modificationMessage?.trim()
    ? `[Modified by admin] ${modificationMessage.trim()}`
    : '[Modified by admin] Reverted overnight billing back to venue event booking';
  lines.push(modLine);
  return lines.join('\n');
}

function isLegacyVenueStayPayment(payment) {
  if (!payment || isVenuePayment(payment)) return false;
  return Boolean(payment.booking_id)
    && (payment.room_number === 'VENUE-STAY' || /\[Venue stay:/i.test(String(payment.notes || '')));
}

async function resolveFacilityIdByRoomCode(roomCode) {
  const code = String(roomCode || '').trim();
  if (!code) return null;
  const [rows] = await pool.query(
    'SELECT id FROM facilities WHERE room_code = ? LIMIT 1',
    [code],
  );
  return rows[0]?.id ?? null;
}

/**
 * Undo venue → overnight billing: restore event schedule and venue totals on the same invoice.
 */
export async function revertVenueOvernightBilling(paymentId, payload = {}) {
  const payment = await loadPaymentDetail(paymentId);
  if (!payment) throw new Error('Invoice not found');
  if (payment.status === 'Paid') {
    throw new Error('Cannot revert reservation on a paid invoice');
  }

  const billingOvernight = isVenuePayment(payment) && isVenueBillingOvernight(payment.notes);
  const legacyOvernight = isLegacyVenueStayPayment(payment);
  if (!billingOvernight && !legacyOvernight) {
    throw new Error('This invoice is not an overnight billing conversion.');
  }

  const {
    event_date, start_time, end_time, guest_count, notes, modification_message,
    event_total, venue_total,
  } = payload;

  const stayMeta = parseVenueStayBillingMeta(payment.notes);
  const nextDate = event_date || stayMeta.check_in || payment.event_date || payment.check_in;
  const nextStart = normalizeTimeValue(start_time ?? payment.start_time ?? '09:00');
  const nextEnd = normalizeTimeValue(end_time ?? payment.end_time ?? '17:00');
  const nextGuests = guest_count != null ? Math.max(1, Number(guest_count)) : (payment.guest_count || 1);

  if (!nextDate) {
    throw new Error('event_date is required to revert to a venue booking');
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    if (billingOvernight) {
      const facilityId = payment.facility_id;
      if (!facilityId) throw new Error('Venue booking reference is missing on this invoice');

      const rateRow = await resolveVenueFacilityRowByFacilityId(facilityId, nextDate);
      if (!rateRow) throw new Error('Venue space not found');

      const durationError = validateVenueDuration(rateRow, nextStart, nextEnd);
      if (durationError) throw new Error(durationError);

      const capacityError = validateVenueCapacity(rateRow, nextGuests);
      if (capacityError) throw new Error(capacityError);

      const overlap = await findVenueBookingOverlap({
        facility_id: facilityId,
        eventDate: nextDate,
        startTime: nextStart,
        endTime: nextEnd,
        excludeBookingId: payment.facility_booking_id,
      });
      if (overlap) throw new Error('This venue is already booked for the selected time slot.');

      const manualTotal = event_total != null || venue_total != null
        ? roundMoney(event_total ?? venue_total)
        : null;
      const totalAmount = manualTotal != null && Number.isFinite(manualTotal) && manualTotal > 0
        ? manualTotal
        : computeVenueTotal(rateRow, nextStart, nextEnd);

      const combinedNotes = notesAfterOvernightRevert(payment.notes, {
        guestNotes: notes,
        modificationMessage: modification_message,
      });

      await conn.query(
        `UPDATE bookings_facilities
         SET event_date = ?, start_time = ?, end_time = ?, guest_count = ?, total_amount = ?, notes = ?
         WHERE id = ?`,
        [nextDate, nextStart, nextEnd, nextGuests, totalAmount, combinedNotes, payment.facility_booking_id],
      );
      await conn.query(
        `UPDATE payments SET subtotal = ?, amount = ? WHERE id = ?`,
        [totalAmount, computeDueAmount(totalAmount, payment.discount_amount), paymentId],
      );
    } else {
      const venueCode = stayMeta.venue_code
        || String(payment.notes || '').match(/\[Venue stay:\s*([^\]]+)\]/i)?.[1]?.trim()
        || null;
      const facilityId = payload.facility_id ?? payment.facility_id ?? await resolveFacilityIdByRoomCode(venueCode);
      if (!facilityId) {
        throw new Error('Could not resolve the venue space for this revert. Select the venue and try again.');
      }

      const rateRow = await resolveVenueFacilityRowByFacilityId(facilityId, nextDate);
      if (!rateRow) throw new Error('Venue space not found');

      const durationError = validateVenueDuration(rateRow, nextStart, nextEnd);
      if (durationError) throw new Error(durationError);

      const capacityError = validateVenueCapacity(rateRow, nextGuests);
      if (capacityError) throw new Error(capacityError);

      const overlap = await findVenueBookingOverlap({
        facility_id: facilityId,
        eventDate: nextDate,
        startTime: nextStart,
        endTime: nextEnd,
      });
      if (overlap) throw new Error('This venue is already booked for the selected time slot.');

      const manualTotal = event_total != null || venue_total != null
        ? roundMoney(event_total ?? venue_total)
        : null;
      const totalAmount = manualTotal != null && Number.isFinite(manualTotal) && manualTotal > 0
        ? manualTotal
        : computeVenueTotal(rateRow, nextStart, nextEnd);

      const combinedNotes = notesAfterOvernightRevert(payment.notes, {
        guestNotes: notes,
        modificationMessage: modification_message,
      });
      const season = normalizeFacilityBookingSeason(rateRow.season);

      let facilityBookingId = payment.facility_booking_id;
      if (facilityBookingId) {
        await conn.query(
          `UPDATE bookings_facilities
           SET facility_id = ?, event_date = ?, start_time = ?, end_time = ?, guest_count = ?,
               season = ?, total_amount = ?, status = 'Approved', notes = ?
           WHERE id = ?`,
          [facilityId, nextDate, nextStart, nextEnd, nextGuests, season, totalAmount, combinedNotes, facilityBookingId],
        );
      } else {
        const [insertResult] = await conn.query(
          `INSERT INTO bookings_facilities
             (user_id, facility_id, event_date, start_time, end_time, guest_count, season, total_amount, status, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Approved', ?)`,
          [payment.user_id, facilityId, nextDate, nextStart, nextEnd, nextGuests, season, totalAmount, combinedNotes],
        );
        facilityBookingId = insertResult.insertId;
      }

      await conn.query(
        'UPDATE bookings_rooms SET status = ? WHERE id = ?',
        ['Cancelled', payment.booking_id],
      );
      await conn.query(
        `UPDATE payments
         SET bookings_room_id = NULL, bookings_facility_id = ?, subtotal = ?, amount = ?
         WHERE id = ?`,
        [facilityBookingId, totalAmount, computeDueAmount(totalAmount, payment.discount_amount), paymentId],
      );
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  await syncPaymentStatus(paymentId);
  return loadPaymentDetail(paymentId);
}

export async function enrichPaymentRow(row) {
  if (!row) return null;
  if (isVenuePayment(row)) {
    const stayMeta = parseVenueStayBillingMeta(row.notes);
    const checkIn = stayMeta.check_in || null;
    const checkOut = stayMeta.check_out || null;
    return {
      ...row,
      meals: [],
      fees: [],
      nights: checkIn && checkOut ? calcNights(checkIn, checkOut) : null,
      check_in: checkIn,
      check_out: checkOut,
      billing_overnight_converted: stayMeta.converted,
    };
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
      void tryAutoSendInvoiceEmail(existing.id);
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
    void tryAutoSendInvoiceEmail(paymentId);
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
      void tryAutoSendInvoiceEmail(existing.id);
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
    void tryAutoSendInvoiceEmail(paymentId);
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

  if (!row) {
    throw new Error('Invoice booking record is missing or incomplete');
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

export async function updateInvoiceBilling(paymentId, { discount_amount, discount_note, subtotal: nextSubtotal } = {}) {
  const payment = await loadPaymentDetail(paymentId);
  if (!payment) throw new Error('Invoice not found');
  if (payment.status === 'Paid') throw new Error('Cannot change billing on a paid invoice');

  let subtotal = nextSubtotal != null
    ? Math.round(Number(nextSubtotal) * 100) / 100
    : Number(payment.subtotal ?? payment.booking_total ?? payment.amount);
  if (!Number.isFinite(subtotal) || subtotal <= 0) {
    throw new Error('Invoice subtotal must be greater than zero');
  }

  const discount = Math.max(0, Number(discount_amount ?? payment.discount_amount ?? 0));
  if (discount > subtotal) throw new Error('Discount cannot be greater than the subtotal');

  const amount = computeDueAmount(subtotal, discount);
  const note = discount_note !== undefined ? (discount_note || null) : payment.discount_note;

  await pool.query(
    `UPDATE payments SET subtotal = ?, discount_amount = ?, discount_note = ?, amount = ? WHERE id = ?`,
    [subtotal, discount, note, amount, paymentId]
  );

  if (payment.booking_id) {
    await pool.query(
      'UPDATE bookings_rooms SET total_amount = ? WHERE id = ?',
      [subtotal, payment.booking_id]
    );
  } else if (payment.facility_booking_id) {
    await pool.query(
      'UPDATE bookings_facilities SET total_amount = ? WHERE id = ?',
      [subtotal, payment.facility_booking_id]
    );
  }

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

function appendAdminModificationNote(existingNotes, modificationMessage, fallback) {
  const modLine = modificationMessage?.trim()
    ? `[Modified by admin] ${modificationMessage.trim()}`
    : fallback;
  if (!modLine) return existingNotes || null;
  return [existingNotes, modLine].filter((n) => n != null && String(n).trim()).join('\n') || null;
}

/**
 * Admin flow: convert a venue/event invoice into overnight billing on the same facility booking.
 * Room stays cannot be converted to venues — use additional fees for mattress/extras.
 */
export async function convertPaymentReservationKind(paymentId, payload = {}) {
  const payment = await loadPaymentDetail(paymentId);
  if (!payment) throw new Error('Invoice not found');
  if (payment.status === 'Paid') {
    throw new Error('Cannot convert reservation on a paid invoice');
  }

  const targetKind = payload.invoice_kind === 'venue' ? 'venue' : 'room';
  const currentKind = isVenuePayment(payment) ? 'venue' : 'room';
  const alreadyOvernight = currentKind === 'venue' && isVenueBillingOvernight(payment.notes);

  if (targetKind === currentKind && !alreadyOvernight) {
    throw new Error('Booking type is unchanged');
  }
  if (currentKind === 'room' && targetKind === 'venue') {
    throw new Error('Room stays cannot be converted to venue bookings. Only venue bookings can convert to overnight stays.');
  }
  if (targetKind === 'room' && currentKind === 'venue') {
    if (!alreadyOvernight) {
      if (payment.facility_category === 'Recreation') {
        throw new Error('Recreation venues cannot convert to overnight stays.');
      }
      if (!payment.facility_room_code) {
        throw new Error('Only coded venue rooms (conference/classroom spaces) can convert to overnight stays.');
      }
    }
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    if (targetKind === 'room' && currentKind === 'venue') {
      const {
        check_in, check_out, guest_count, notes, modification_message, stay_total, room_total,
      } = payload;
      if (!check_in || !check_out) {
        throw new Error('check_in and check_out are required for an overnight stay');
      }

      await validateReservationDates(check_in, check_out, { bypassAdvanceLimit: true });

      const manualStayTotal = roundMoney(stay_total ?? room_total);
      if (!Number.isFinite(manualStayTotal) || manualStayTotal <= 0) {
        throw new Error('Enter a stay total for the overnight conversion.');
      }

      const venueLabel = payment.facility_room_code || payment.facility_name || 'venue space';
      const combinedNotes = replaceVenueStayBillingTags(payment.notes, {
        guestNotes: notes,
        venueLabel,
        check_in,
        check_out,
        modificationMessage: modification_message,
        isFirstConversion: !alreadyOvernight,
      });

      await conn.query(
        `UPDATE bookings_facilities
         SET total_amount = ?, guest_count = ?, notes = ?
         WHERE id = ?`,
        [
          manualStayTotal,
          guest_count || payment.guest_count || 1,
          combinedNotes,
          payment.facility_booking_id,
        ]
      );
      await conn.query(
        `UPDATE payments SET subtotal = ?, amount = ? WHERE id = ?`,
        [manualStayTotal, computeDueAmount(manualStayTotal, payment.discount_amount), paymentId]
      );
    } else if (targetKind === 'venue' && currentKind === 'room') {
      const {
        facility_id, event_date, start_time, end_time, guest_count, notes, modification_message,
      } = payload;
      if (!facility_id || !event_date || !start_time || !end_time) {
        throw new Error('facility_id, event_date, start_time, and end_time are required for a venue booking');
      }

      const startTime = normalizeTimeValue(start_time);
      const endTime = normalizeTimeValue(end_time);
      const identity = await resolveFacilityIdentity({ facility_id, event_date });
      if (!identity) throw new Error('Venue space not found');

      const { row: rateRow } = identity;
      const durationError = validateVenueDuration(rateRow, startTime, endTime);
      if (durationError) throw new Error(durationError);

      const capacityError = validateVenueCapacity(rateRow, guest_count || payment.guest_count || 1);
      if (capacityError) throw new Error(capacityError);

      const overlap = await findVenueBookingOverlap({
        facility_id,
        eventDate: event_date,
        startTime,
        endTime,
      });
      if (overlap) throw new Error('This venue is already booked for the selected time slot.');

      const season = normalizeFacilityBookingSeason(rateRow.season);
      const totalAmount = computeVenueTotal(rateRow, startTime, endTime);
      const combinedNotes = appendAdminModificationNote(
        notes != null ? notes : payment.notes,
        modification_message,
        '[Modified by admin] Converted from room stay to venue booking in billing'
      );

      const [insertResult] = await conn.query(
        `INSERT INTO bookings_facilities
           (user_id, facility_id, event_date, start_time, end_time, guest_count, season, total_amount, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Approved', ?)`,
        [
          payment.user_id,
          facility_id,
          event_date,
          startTime,
          endTime,
          guest_count || payment.guest_count || 1,
          season,
          totalAmount,
          combinedNotes,
        ]
      );

      const newFacilityBookingId = insertResult.insertId;
      await conn.query(
        'UPDATE bookings_rooms SET status = ? WHERE id = ?',
        ['Cancelled', payment.booking_id]
      );
      await conn.query(
        `UPDATE payments
         SET bookings_room_id = NULL, bookings_facility_id = ?, subtotal = ?, amount = ?
         WHERE id = ?`,
        [newFacilityBookingId, totalAmount, computeDueAmount(totalAmount, payment.discount_amount), paymentId]
      );
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  await syncPaymentStatus(paymentId);
  return loadPaymentDetail(paymentId);
}
