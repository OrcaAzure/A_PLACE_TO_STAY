import { pool } from '../config/db.js';

async function softDeleteRow(table, id, actorUserId = null) {
  const [result] = await pool.query(
    `UPDATE \`${table}\`
     SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ?
     WHERE id = ? AND deleted_at IS NULL`,
    [actorUserId, id]
  );
  return result.affectedRows > 0;
}

async function restoreRow(table, id) {
  const [result] = await pool.query(
    `UPDATE \`${table}\`
     SET deleted_at = NULL, deleted_by = NULL
     WHERE id = ? AND deleted_at IS NOT NULL`,
    [id]
  );
  return result.affectedRows > 0;
}

export async function listRecycleInvoices() {
  const [rows] = await pool.query(
    `SELECT p.id, p.amount, p.status, p.paid_at, p.deleted_at, p.deleted_by,
            p.bookings_room_id, p.bookings_facility_id,
            COALESCE(ur.full_name, uf.full_name) AS guest_name,
            COALESCE(ur.email, uf.email) AS guest_email,
            CASE
              WHEN p.bookings_facility_id IS NOT NULL THEN 'venue'
              ELSE 'room'
            END AS invoice_kind
     FROM payments p
     LEFT JOIN bookings_rooms br ON p.bookings_room_id = br.id
     LEFT JOIN users ur ON br.user_id = ur.id
     LEFT JOIN bookings_facilities bf ON p.bookings_facility_id = bf.id
     LEFT JOIN users uf ON bf.user_id = uf.id
     WHERE p.deleted_at IS NOT NULL
     ORDER BY p.deleted_at DESC`
  );
  return rows;
}

export async function listRecycleReservations() {
  const [rooms] = await pool.query(
    `SELECT br.id, 'room' AS kind, br.status, br.check_in, br.check_out, br.deleted_at,
            br.booking_ref, u.full_name AS guest_name, u.email AS guest_email,
            r.room_number, b.name AS building_name, br.group_id
     FROM bookings_rooms br
     JOIN users u ON br.user_id = u.id
     LEFT JOIN rooms r ON br.room_id = r.id
     LEFT JOIN buildings b ON r.building_id = b.id
     WHERE br.deleted_at IS NOT NULL
     ORDER BY br.deleted_at DESC`
  );

  const [venues] = await pool.query(
    `SELECT bf.id, 'venue' AS kind, bf.status, bf.event_date AS check_in, NULL AS check_out,
            bf.deleted_at, bf.booking_ref, u.full_name AS guest_name, u.email AS guest_email,
            f.name AS facility_name, f.room_code AS facility_room_code, NULL AS group_id
     FROM bookings_facilities bf
     JOIN users u ON bf.user_id = u.id
     JOIN facilities f ON bf.facility_id = f.id
     WHERE bf.deleted_at IS NOT NULL
     ORDER BY bf.deleted_at DESC`
  );

  const [groups] = await pool.query(
    `SELECT rg.id, 'group' AS kind, rg.status, rg.check_in, rg.check_out, rg.deleted_at,
            rg.booking_ref, rg.group_name, rg.contact_name AS guest_name, rg.contact_email AS guest_email,
            NULL AS room_number, NULL AS building_name, rg.id AS group_id
     FROM reservation_groups rg
     WHERE rg.deleted_at IS NOT NULL
     ORDER BY rg.deleted_at DESC`
  );

  return [...rooms, ...venues, ...groups].sort(
    (a, b) => new Date(b.deleted_at) - new Date(a.deleted_at)
  );
}

export async function softDeletePaidInvoice(paymentId, actorUserId = null) {
  const [rows] = await pool.query(
    `SELECT id, status FROM payments WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [paymentId]
  );
  if (!rows.length) throw new Error('Invoice not found');
  if (rows[0].status !== 'Paid') {
    throw new Error('Only fully paid invoices can be deleted. Open or partial invoices cannot be deleted.');
  }
  const ok = await softDeleteRow('payments', paymentId, actorUserId);
  if (!ok) throw new Error('Invoice could not be deleted');
  return { id: Number(paymentId) };
}

export async function softDeleteAllPaidInvoices(actorUserId = null) {
  const [rows] = await pool.query(
    `SELECT id FROM payments WHERE status = 'Paid' AND deleted_at IS NULL`
  );
  if (!rows.length) return { deleted: 0 };
  const ids = rows.map((r) => r.id);
  const [result] = await pool.query(
    `UPDATE payments
     SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ?
     WHERE status = 'Paid' AND deleted_at IS NULL`,
    [actorUserId]
  );
  return { deleted: result.affectedRows, payment_ids: ids };
}

export async function restoreInvoice(paymentId) {
  const ok = await restoreRow('payments', paymentId);
  if (!ok) throw new Error('Invoice not found in recycle bin');
  return { id: Number(paymentId) };
}

export async function purgeInvoice(paymentId) {
  const [rows] = await pool.query(
    `SELECT id FROM payments WHERE id = ? AND deleted_at IS NOT NULL LIMIT 1`,
    [paymentId]
  );
  if (!rows.length) throw new Error('Invoice not found in recycle bin');
  await pool.query('DELETE FROM payment_transactions WHERE payment_id = ?', [paymentId]);
  await pool.query('DELETE FROM payments WHERE id = ?', [paymentId]);
  return { id: Number(paymentId) };
}

async function assertNoActivePaidInvoiceForRoom(bookingId) {
  const [rows] = await pool.query(
    `SELECT id FROM payments
     WHERE bookings_room_id = ? AND status = 'Paid' AND deleted_at IS NULL
     LIMIT 1`,
    [bookingId]
  );
  if (rows.length) {
    throw new Error('This reservation has a paid invoice. Delete the paid billing record first (it moves to the recycle bin).');
  }
}

async function assertNoActivePaidInvoiceForVenue(facilityBookingId) {
  const [rows] = await pool.query(
    `SELECT id FROM payments
     WHERE bookings_facility_id = ? AND status = 'Paid' AND deleted_at IS NULL
     LIMIT 1`,
    [facilityBookingId]
  );
  if (rows.length) {
    throw new Error('This reservation has a paid invoice. Delete the paid billing record first (it moves to the recycle bin).');
  }
}

export async function softDeleteRoomBooking(bookingId, actorUserId = null) {
  const [rows] = await pool.query(
    `SELECT id, group_id FROM bookings_rooms WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [bookingId]
  );
  if (!rows.length) throw new Error('Booking not found');
  await assertNoActivePaidInvoiceForRoom(bookingId);
  // Soft-delete any open (non-paid) invoices with the booking
  await pool.query(
    `UPDATE payments SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ?
     WHERE bookings_room_id = ? AND deleted_at IS NULL AND status <> 'Paid'`,
    [actorUserId, bookingId]
  );
  const ok = await softDeleteRow('bookings_rooms', bookingId, actorUserId);
  if (!ok) throw new Error('Booking could not be deleted');
  return { id: Number(bookingId), kind: 'room' };
}

export async function softDeleteFacilityBooking(facilityBookingId, actorUserId = null) {
  const [rows] = await pool.query(
    `SELECT id FROM bookings_facilities WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [facilityBookingId]
  );
  if (!rows.length) throw new Error('Venue booking not found');
  await assertNoActivePaidInvoiceForVenue(facilityBookingId);
  await pool.query(
    `UPDATE payments SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ?
     WHERE bookings_facility_id = ? AND deleted_at IS NULL AND status <> 'Paid'`,
    [actorUserId, facilityBookingId]
  );
  const ok = await softDeleteRow('bookings_facilities', facilityBookingId, actorUserId);
  if (!ok) throw new Error('Venue booking could not be deleted');
  return { id: Number(facilityBookingId), kind: 'venue' };
}

export async function softDeleteGroup(groupId, actorUserId = null) {
  const [rows] = await pool.query(
    `SELECT id FROM reservation_groups WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [groupId]
  );
  if (!rows.length) throw new Error('Group reservation not found');

  const [roomRows] = await pool.query(
    `SELECT id FROM bookings_rooms WHERE group_id = ? AND deleted_at IS NULL`,
    [groupId]
  );
  for (const room of roomRows) {
    await assertNoActivePaidInvoiceForRoom(room.id);
  }

  await pool.query(
    `UPDATE payments p
     JOIN bookings_rooms br ON p.bookings_room_id = br.id
     SET p.deleted_at = CURRENT_TIMESTAMP, p.deleted_by = ?
     WHERE br.group_id = ? AND p.deleted_at IS NULL AND p.status <> 'Paid'`,
    [actorUserId, groupId]
  );
  await pool.query(
    `UPDATE bookings_rooms
     SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ?
     WHERE group_id = ? AND deleted_at IS NULL`,
    [actorUserId, groupId]
  );
  const ok = await softDeleteRow('reservation_groups', groupId, actorUserId);
  if (!ok) throw new Error('Group reservation could not be deleted');
  return { id: Number(groupId), kind: 'group' };
}

export async function restoreReservation({ kind, id }) {
  if (kind === 'room') {
    const ok = await restoreRow('bookings_rooms', id);
    if (!ok) throw new Error('Room reservation not found in recycle bin');
    await pool.query(
      `UPDATE payments SET deleted_at = NULL, deleted_by = NULL
       WHERE bookings_room_id = ? AND deleted_at IS NOT NULL`,
      [id]
    );
    return { id: Number(id), kind };
  }
  if (kind === 'venue') {
    const ok = await restoreRow('bookings_facilities', id);
    if (!ok) throw new Error('Venue reservation not found in recycle bin');
    await pool.query(
      `UPDATE payments SET deleted_at = NULL, deleted_by = NULL
       WHERE bookings_facility_id = ? AND deleted_at IS NOT NULL`,
      [id]
    );
    return { id: Number(id), kind };
  }
  if (kind === 'group') {
    const ok = await restoreRow('reservation_groups', id);
    if (!ok) throw new Error('Group reservation not found in recycle bin');
    await pool.query(
      `UPDATE bookings_rooms SET deleted_at = NULL, deleted_by = NULL
       WHERE group_id = ? AND deleted_at IS NOT NULL`,
      [id]
    );
    await pool.query(
      `UPDATE payments p
       JOIN bookings_rooms br ON p.bookings_room_id = br.id
       SET p.deleted_at = NULL, p.deleted_by = NULL
       WHERE br.group_id = ? AND p.deleted_at IS NOT NULL`,
      [id]
    );
    return { id: Number(id), kind };
  }
  throw new Error('Unknown reservation kind');
}

export async function purgeReservation({ kind, id }) {
  if (kind === 'room') {
    const [rows] = await pool.query(
      `SELECT id FROM bookings_rooms WHERE id = ? AND deleted_at IS NOT NULL LIMIT 1`,
      [id]
    );
    if (!rows.length) throw new Error('Room reservation not found in recycle bin');
    const [payIds] = await pool.query('SELECT id FROM payments WHERE bookings_room_id = ?', [id]);
    if (payIds.length) {
      const ids = payIds.map((p) => p.id);
      await pool.query('DELETE FROM payment_transactions WHERE payment_id IN (?)', [ids]);
      await pool.query('DELETE FROM payments WHERE bookings_room_id = ?', [id]);
    }
    await pool.query('DELETE FROM bookings_meals WHERE bookings_room_id = ?', [id]);
    await pool.query('DELETE FROM bookings_extra_services WHERE bookings_room_id = ?', [id]);
    await pool.query('DELETE FROM bookings_rooms WHERE id = ?', [id]);
    return { id: Number(id), kind };
  }
  if (kind === 'venue') {
    const [rows] = await pool.query(
      `SELECT id FROM bookings_facilities WHERE id = ? AND deleted_at IS NOT NULL LIMIT 1`,
      [id]
    );
    if (!rows.length) throw new Error('Venue reservation not found in recycle bin');
    const [payIds] = await pool.query('SELECT id FROM payments WHERE bookings_facility_id = ?', [id]);
    if (payIds.length) {
      const ids = payIds.map((p) => p.id);
      await pool.query('DELETE FROM payment_transactions WHERE payment_id IN (?)', [ids]);
      await pool.query('DELETE FROM payments WHERE bookings_facility_id = ?', [id]);
    }
    await pool.query('DELETE FROM bookings_facilities WHERE id = ?', [id]);
    return { id: Number(id), kind };
  }
  if (kind === 'group') {
    const [rows] = await pool.query(
      `SELECT id FROM reservation_groups WHERE id = ? AND deleted_at IS NOT NULL LIMIT 1`,
      [id]
    );
    if (!rows.length) throw new Error('Group reservation not found in recycle bin');
    const [roomRows] = await pool.query('SELECT id FROM bookings_rooms WHERE group_id = ?', [id]);
    for (const room of roomRows) {
      await purgeReservation({ kind: 'room', id: room.id });
    }
    await pool.query('DELETE FROM reservation_groups WHERE id = ?', [id]);
    return { id: Number(id), kind };
  }
  throw new Error('Unknown reservation kind');
}
