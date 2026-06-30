import { pool } from '../config/db.js';
import { isEmpty } from '../utils/helpers.js';
import {
  prepareBookingInsert,
  getAvailableRooms,
  getMealRates,
  saveBookingMeals,
  saveBookingFees,
  computeGrandTotal,
  getBookingMeals,
  getBookingFees,
  resolveGuestUser,
  hasOverlappingBooking,
  validateGuestCapacity,
  getRoomById,
} from './booking.service.js';
import { validateReservationDates } from './fiscalYear.service.js';
import { assertCanCancelRoomBooking, getGuestCancellationCutoffHours } from './reservationLifecycle.service.js';
import { sendGroupModifiedEmail, sendGroupConfirmationEmail } from './email.service.js';

const bookingSelect = `
  SELECT bk.*,
         r.room_number, r.room_type, r.capacity_min, r.capacity_max,
         b.name AS building_name
  FROM bookings_rooms bk
  JOIN rooms r ON bk.room_id = r.id
  JOIN buildings b ON r.building_id = b.id
`;

const groupSelect = `
  SELECT rg.*,
         u.full_name AS requester_name,
         u.email AS requester_email
  FROM reservation_groups rg
  JOIN users u ON rg.user_id = u.id
`;

export function suggestRoomAssignment(availableRooms, totalGuests) {
  const rooms = availableRooms
    .filter((r) => r.availability_status === 'available')
    .sort((a, b) => b.capacity_max - a.capacity_max);

  const assignments = [];
  let remaining = Number(totalGuests) || 0;
  if (remaining <= 0) return [];

  for (const room of rooms) {
    if (remaining <= 0) break;
    const guests = Math.min(remaining, room.capacity_max);
    if (guests < room.capacity_min) continue;
    assignments.push({
      room_id: room.id,
      guest_count: guests,
      room_number: room.room_number,
      building_name: room.building_name,
      capacity_min: room.capacity_min,
      capacity_max: room.capacity_max,
      estimated_total: room.estimated_total,
    });
    remaining -= guests;
  }

  if (remaining > 0) return null;
  return assignments;
}

async function enrichGroupBookings(groupId) {
  const [rows] = await pool.query(`${bookingSelect} WHERE bk.group_id = ? ORDER BY bk.id`, [groupId]);
  const bookings = await Promise.all(rows.map(async (row) => ({
    ...row,
    meals: await getBookingMeals(row.id),
    fees: await getBookingFees(row.id),
  })));
  return bookings;
}

export async function getGroupById(groupId) {
  const [rows] = await pool.query(`${groupSelect} WHERE rg.id = ? LIMIT 1`, [groupId]);
  if (!rows.length) return null;
  const group = rows[0];
  group.bookings = await enrichGroupBookings(groupId);
  group.room_count = group.bookings.length;
  group.assigned_guests = group.bookings.reduce((s, b) => s + (b.guest_count || 0), 0);
  group.grand_total = group.bookings.reduce((s, b) => s + Number(b.total_amount || 0), 0);
  if (group.bookings[0]) {
    group.meals = group.bookings[0].meals || [];
    group.fees = group.bookings[0].fees || [];
    group.meal_allergen_notes = group.bookings[0].meal_allergen_notes || null;
  } else {
    group.meals = [];
    group.fees = [];
    group.meal_allergen_notes = null;
  }
  return group;
}

export async function listGroups({ userId = null, admin = false } = {}) {
  let sql = `${groupSelect}`;
  const params = [];
  if (!admin && userId) {
    sql += ' WHERE rg.user_id = ?';
    params.push(userId);
  }
  sql += ' ORDER BY rg.check_in ASC';
  const [rows] = await pool.query(sql, params);
  return Promise.all(rows.map(async (g) => getGroupById(g.id)));
}

export async function suggestRoomsForGroup({ checkIn, checkOut, totalGuests, excludeGroupId = null, bypassAdvanceLimit = false }) {
  const rooms = await getAvailableRooms({
    checkIn,
    checkOut,
    guestCount: 1,
    excludeGroupId,
    groupPicker: true,
    bypassAdvanceLimit,
  });
  const suggestion = suggestRoomAssignment(rooms, totalGuests);
  const availableCount = rooms.filter((r) => r.availability_status === 'available').length;
  return { rooms, suggestion, available_count: availableCount };
}

async function validateRoomAssignments({ checkIn, checkOut, rooms, excludeGroupId = null }) {
  if (!rooms?.length) throw new Error('At least one room is required.');
  const seen = new Set();
  for (const item of rooms) {
    const roomId = Number(item.room_id);
    const guestCount = Number(item.guest_count) || 1;
    if (seen.has(roomId)) throw new Error('Each room can only be selected once.');
    seen.add(roomId);

    const room = await getRoomById(roomId);
    if (!room) throw new Error(`Room #${roomId} not found.`);
    const capErr = validateGuestCapacity(room, guestCount);
    if (capErr) throw new Error(`Room ${room.room_number}: ${capErr}`);
    if (room.status === 'Maintenance') throw new Error(`Room ${room.room_number} is out of order.`);
    if (room.status === 'Dirty') throw new Error(`Room ${room.room_number} is check-out / dirty and not ready yet.`);
    if (room.status === 'Occupied') throw new Error(`Room ${room.room_number} is currently occupied.`);

    const overlap = await hasOverlappingBooking(roomId, checkIn, checkOut, null, excludeGroupId);
    if (overlap) throw new Error(`Room ${room.room_number} is already booked on these dates.`);
  }
}

export async function saveGroupBookings({
  groupId,
  userId,
  checkIn,
  checkOut,
  rooms,
  status,
  notes,
  contactPhone,
  meals,
  fees,
  meal_allergen_notes,
  bypassAdvanceLimit = false,
}) {
  await validateRoomAssignments({ checkIn, checkOut, rooms, excludeGroupId: groupId });

  const mealRates = await getMealRates();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM bookings_rooms WHERE group_id = ?', [groupId]);

    let firstBookingId = null;
    let groupGrandTotal = 0;

    for (let i = 0; i < rooms.length; i++) {
      const { room_id, guest_count } = rooms[i];
      const prepared = await prepareBookingInsert({
        roomId: room_id,
        checkIn,
        checkOut,
        guestCount: guest_count,
        bypassAdvanceLimit,
      });

      let lineTotal = prepared.total_amount;
      if (i === 0 && (meals || fees)) {
        lineTotal = await computeGrandTotal({
          roomTotal: prepared.total_amount,
          meals,
          fees,
          mealRates,
        });
      }

      groupGrandTotal += lineTotal;

      const [result] = await conn.query(
        `INSERT INTO bookings_rooms (user_id, room_id, group_id, check_in, check_out, guest_count, season, occupancy_item, total_amount, status, notes, contact_phone, meal_allergen_notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId, room_id, groupId, checkIn, checkOut, guest_count,
          prepared.season, prepared.occupancy_item, lineTotal, status,
          notes || null, contactPhone || null, i === 0 ? (meal_allergen_notes || null) : null,
        ]
      );

      if (i === 0) {
        firstBookingId = result.insertId;
        await saveBookingMeals(firstBookingId, meals, mealRates);
        await saveBookingFees(firstBookingId, fees);
      }
    }

    await conn.query(
      'UPDATE reservation_groups SET status = ?, notes = COALESCE(?, notes), contact_phone = COALESCE(?, contact_phone) WHERE id = ?',
      [status, notes, contactPhone, groupId]
    );

    await conn.commit();
    return getGroupById(groupId);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function createReservationGroup(raw = {}) {
  const requesterId = raw.requesterId;
  const isAdmin = raw.isAdmin;
  const groupName = raw.groupName || raw.group_name;
  const contactName = raw.contactName || raw.contact_name;
  const contactPhone = raw.contactPhone || raw.contact_phone;
  const contactEmail = raw.contactEmail || raw.contact_email;
  const checkIn = raw.checkIn || raw.check_in;
  const checkOut = raw.checkOut || raw.check_out;
  const totalGuests = raw.totalGuests ?? raw.total_guests;
  const roomsRequested = raw.roomsRequested ?? raw.rooms_requested;
  const notes = raw.notes;
  const status = raw.status;
  const rooms = raw.rooms;
  const meals = raw.meals;
  const fees = raw.fees;
  const meal_allergen_notes = raw.meal_allergen_notes || raw.mealAllergenNotes;
  const userId = raw.userId ?? raw.user_id;
  const guestName = raw.guestName || raw.guest_name;
  const email = raw.email || raw.contact_email;

  if (isEmpty(groupName) || isEmpty(contactName) || isEmpty(checkIn) || isEmpty(checkOut)) {
    throw new Error('group_name, contact_name, check_in, and check_out are required');
  }
  await validateReservationDates(checkIn, checkOut, { bypassAdvanceLimit: isAdmin });

  const effectiveUserId = isAdmin
    ? await resolveGuestUser({ userId, guestName: contactName || guestName, email: contactEmail || email })
    : requesterId;

  const groupStatus = isAdmin ? (status || 'Approved') : 'Pending';
  const guests = Math.max(1, Number(totalGuests) || 1);

  const [result] = await pool.query(
    `INSERT INTO reservation_groups
      (user_id, group_name, contact_name, contact_phone, contact_email, check_in, check_out, total_guests, rooms_requested, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      effectiveUserId,
      groupName.trim(),
      contactName.trim(),
      contactPhone || null,
      contactEmail || email || null,
      checkIn,
      checkOut,
      guests,
      roomsRequested || null,
      groupStatus,
      notes || null,
    ]
  );

  const groupId = result.insertId;

  if (rooms?.length && (isAdmin || groupStatus === 'Approved')) {
    const assignedGuests = rooms.reduce((s, r) => s + Number(r.guest_count || 0), 0);
    if (assignedGuests !== guests) {
      throw new Error(`Guest count per room must add up to ${guests} (currently ${assignedGuests}).`);
    }
    return saveGroupBookings({
      groupId,
      userId: effectiveUserId,
      checkIn,
      checkOut,
      rooms,
      status: groupStatus,
      notes,
      contactPhone,
      meals,
      fees,
      meal_allergen_notes,
      bypassAdvanceLimit: isAdmin,
    });
  }

  return getGroupById(groupId);
}

export async function updateReservationGroup(groupId, body, { isAdmin, userId }) {
  const group = await getGroupById(groupId);
  if (!group) throw new Error('Group reservation not found');
  if (!isAdmin && group.user_id !== userId) throw new Error('Forbidden');

  if (!isAdmin) {
    if (body.status !== 'Cancelled') {
      throw new Error('You can only cancel your own pending group requests');
    }
    const cancelError = assertCanCancelRoomBooking({
      status: group.status,
      check_in: group.check_in,
      check_out: group.check_out,
      isAdmin: false,
      cutoffHours: await getGuestCancellationCutoffHours(),
    });
    if (cancelError) throw new Error(cancelError);
    await pool.query('UPDATE reservation_groups SET status = ? WHERE id = ?', ['Cancelled', groupId]);
    return getGroupById(groupId);
  }

  const {
    group_name, contact_name, contact_phone, contact_email,
    check_in, check_out, total_guests, rooms_requested, notes, status,
    rooms, meals, fees, user_id, guest_name, email, meal_allergen_notes,
  } = body;

  const nextCheckIn = check_in || group.check_in;
  const nextCheckOut = check_out || group.check_out;
  const nextGuests = total_guests != null ? Math.max(1, Number(total_guests)) : group.total_guests;
  const nextStatus = status || group.status;

  if (nextStatus === 'Cancelled') {
    const cancelError = assertCanCancelRoomBooking({
      status: group.status,
      check_in: nextCheckIn,
      check_out: nextCheckOut,
      isAdmin: true,
    });
    if (cancelError) throw new Error(cancelError);
  }

  await validateReservationDates(nextCheckIn, nextCheckOut, { bypassAdvanceLimit: isAdmin });

  let resolvedUserId = group.user_id;
  if (user_id || guest_name || email || contact_name) {
    resolvedUserId = await resolveGuestUser({
      userId: user_id || group.user_id,
      guestName: contact_name || guest_name,
      email: contact_email || email,
    });
  }

  await pool.query(
    `UPDATE reservation_groups SET
      user_id = ?,
      group_name = COALESCE(?, group_name),
      contact_name = COALESCE(?, contact_name),
      contact_phone = COALESCE(?, contact_phone),
      contact_email = COALESCE(?, contact_email),
      check_in = ?,
      check_out = ?,
      total_guests = ?,
      rooms_requested = COALESCE(?, rooms_requested),
      status = ?,
      notes = COALESCE(?, notes)
     WHERE id = ?`,
    [
      resolvedUserId,
      group_name, contact_name, contact_phone, contact_email,
      nextCheckIn, nextCheckOut, nextGuests, rooms_requested,
      nextStatus, notes, groupId,
    ]
  );

  if (rooms?.length) {
    const assignedGuests = rooms.reduce((s, r) => s + Number(r.guest_count || 0), 0);
    if (assignedGuests !== nextGuests) {
      throw new Error(`Guest count per room must add up to ${nextGuests} (currently ${assignedGuests}).`);
    }
    const updated = await saveGroupBookings({
      groupId,
      userId: resolvedUserId,
      checkIn: nextCheckIn,
      checkOut: nextCheckOut,
      rooms,
      status: nextStatus,
      notes: notes ?? group.notes,
      contactPhone: contact_phone ?? group.contact_phone,
      meals,
      fees,
      meal_allergen_notes,
      bypassAdvanceLimit: isAdmin,
    });
    if (body.notify_guest && isAdmin) {
      const fresh = await getGroupById(groupId);
      if (body.notify_modification && body.modification_message) {
        await sendGroupModifiedEmail(
          { full_name: fresh.contact_name, email: fresh.contact_email },
          fresh,
          {
            message: body.modification_message,
            previousCheckIn: group.check_in,
            previousCheckOut: group.check_out,
            previousRoomsRequested: group.rooms_requested,
          }
        );
      } else if (nextStatus === 'Approved') {
        await sendGroupConfirmationEmail(
          { full_name: fresh.contact_name, email: fresh.contact_email },
          fresh
        );
      }
    }
    return updated;
  }

  if (nextStatus === 'Rejected' || nextStatus === 'Cancelled') {
    await pool.query('DELETE FROM bookings_rooms WHERE group_id = ?', [groupId]);
  }

  const result = await getGroupById(groupId);
  if (body.notify_guest && isAdmin && body.notify_modification && body.modification_message) {
    await sendGroupModifiedEmail(
      { full_name: result.contact_name, email: result.contact_email },
      result,
      {
        message: body.modification_message,
        previousCheckIn: group.check_in,
        previousCheckOut: group.check_out,
        previousRoomsRequested: group.rooms_requested,
      }
    );
  }
  return result;
}

export async function deleteReservationGroup(groupId) {
  await pool.query('DELETE FROM reservation_groups WHERE id = ?', [groupId]);
}
