import { pool } from '../config/db.js';
import Booking from '../models/Booking.js';
import { isEmpty } from '../utils/helpers.js';
import {
  prepareBookingInsert,
  validateBookingUpdate,
  getMealRates,
  saveBookingMeals,
  saveBookingFees,
  computeGrandTotal,
  computeUpdatedBookingGrandTotal,
  getAvailableRooms,
  getBookingMeals,
  getBookingFees,
  resolveGuestUser,
  notifyBookingCreated,
  notifyBookingUpdated,
  notifyBookingCancelled,
  notifyGuestRoomSelfModified,
  getRoomById,
  resolveSeason,
} from '../services/booking.service.js';
import { canGuestAccessBuilding, filterRoomsForGuestUser } from '../utils/guestAccess.js';
import { assertCanCancelRoomBooking, assertCanModifyRoomBooking, getGuestCancellationCutoffHours } from '../services/reservationLifecycle.service.js';
import { fetchExtraServiceRows, sanitizeGuestSubmittedFees } from '../services/ancillary.service.js';
import { getInvoiceSnapshot, ensureInvoiceForBooking, deletePaymentsForRoomBooking } from '../services/payment.service.js';

import { isAdminRole, isAdminPortalRole } from '../utils/constants.js';

const bookingSelect = `
  SELECT bk.*,
         u.full_name AS guest_name,
         u.email AS guest_email,
         u.role AS guest_role,
         r.room_number,
         r.room_type,
         b.name AS building_name
  FROM bookings_rooms bk
  JOIN users u ON bk.user_id = u.id
  LEFT JOIN rooms r ON bk.room_id = r.id
  LEFT JOIN buildings b ON r.building_id = b.id
`;

async function enrichBooking(row) {
  const booking = new Booking(row);
  booking.meals = await getBookingMeals(booking.id);
  booking.fees = await getBookingFees(booking.id);
  booking.invoice = await getInvoiceSnapshot(booking.id);
  return booking;
}

export const getAllBookings = async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    let rows;
    if (isAdminPortalRole(role)) {
      [rows] = await pool.query(`${bookingSelect} ORDER BY bk.check_in ASC`);
    } else {
      [rows] = await pool.query(
        `${bookingSelect} WHERE bk.user_id = ? ORDER BY bk.check_in ASC`,
        [userId]
      );
    }
    const bookings = await Promise.all(rows.map((r) => enrichBooking(r)));
    res.status(200).json({ bookings });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getBookingById = async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    const [rows] = await pool.query(`${bookingSelect} WHERE bk.id = ? LIMIT 1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Booking not found' });
    if (!isAdminPortalRole(role) && rows[0].user_id !== userId) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    res.status(200).json({ booking: await enrichBooking(rows[0]) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getRoomAvailability = async (req, res) => {
  try {
    const { check_in, check_out, guest_count, exclude_booking_id, exclude_group_id, group_picker } = req.query;
    if (isEmpty(check_in) || isEmpty(check_out)) {
      return res.status(400).json({ message: 'check_in and check_out are required' });
    }
    const isAdmin = isAdminRole(req.user.role);
    let rooms = await getAvailableRooms({
      checkIn: check_in,
      checkOut: check_out,
      guestCount: guest_count || 1,
      excludeBookingId: exclude_booking_id || null,
      excludeGroupId: exclude_group_id || null,
      groupPicker: group_picker === '1' || group_picker === 'true',
      bypassAdvanceLimit: isAdmin,
    });
    if (!isAdmin) {
      rooms = filterRoomsForGuestUser(rooms, req.user.email);
    }
    const availableCount = rooms.filter((r) => r.availability_status === 'available').length;
    const resolved_season = await resolveSeason(check_in);
    res.status(200).json({
      rooms,
      available_count: availableCount,
      active_season: resolved_season,
      resolved_season,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const getMealRateList = async (req, res) => {
  try {
    res.status(200).json({ rates: await getMealRates() });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createBooking = async (req, res) => {
  try {
    const { role, id: requesterId } = req.user;
    const {
      user_id, room_id, check_in, check_out, guest_count,
      season, occupancy_item, notes, contact_phone, status, meals, fees,
      guest_name, email, meal_allergen_notes,
    } = req.body;

    const effectiveUserId = isAdminRole(role)
      ? await resolveGuestUser({ userId: user_id, guestName: guest_name, email })
      : requesterId;
    if (isEmpty(room_id) || isEmpty(check_in) || isEmpty(check_out)) {
      return res.status(400).json({ message: 'room_id, check_in, and check_out are required' });
    }

    const isAdmin = isAdminRole(role);
    if (!isAdmin) {
      const room = await getRoomById(room_id);
      if (!room || !canGuestAccessBuilding(req.user.email, room.building_name)) {
        return res.status(403).json({ message: 'You do not have access to book this room.' });
      }
    }

    const prepared = await prepareBookingInsert({
      roomId: room_id,
      checkIn: check_in,
      checkOut: check_out,
      guestCount: guest_count || 1,
      season,
      occupancyItem: occupancy_item,
      bypassAdvanceLimit: isAdmin,
    });

    const mealRates = await getMealRates();
    let feesToSave = fees;
    if (!isAdmin && fees != null && fees.length) {
      const catalogRows = await fetchExtraServiceRows();
      feesToSave = sanitizeGuestSubmittedFees(fees, catalogRows, []);
    }
    const grandTotal = await computeGrandTotal({
      roomTotal: prepared.total_amount,
      meals,
      fees: feesToSave,
      mealRates,
    });

    const bookingStatus = isAdminRole(role) ? (status || 'Approved') : 'Pending';

    const [result] = await pool.query(
      `INSERT INTO bookings_rooms (user_id, room_id, group_id, check_in, check_out, guest_count, season, occupancy_item, total_amount, status, notes, contact_phone, meal_allergen_notes, pricing_category)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        effectiveUserId, room_id, req.body.group_id || null, check_in, check_out, guest_count || 1,
        prepared.season, prepared.occupancy_item, grandTotal, bookingStatus,
        notes || null, contact_phone || null, meal_allergen_notes || null, 'Guest',
      ]
    );

    await saveBookingMeals(result.insertId, meals, mealRates);
    await saveBookingFees(result.insertId, feesToSave);

    const [rows] = await pool.query(`${bookingSelect} WHERE bk.id = ?`, [result.insertId]);
    const booking = await enrichBooking(rows[0]);
    if (bookingStatus === 'Approved') {
      await ensureInvoiceForBooking(result.insertId);
      booking.invoice = await getInvoiceSnapshot(result.insertId);
    }
    notifyBookingCreated(rows[0]);
    res.status(201).json({ message: 'Booking created', booking });
  } catch (error) {
    const status = error.message.includes('already reserved') || error.message.includes('Maximum') || error.message.includes('Minimum') || error.message.includes('maintenance') || error.message.includes('advance') || error.message.includes('past')
      ? 409 : 400;
    res.status(status).json({ message: error.message });
  }
};

export const updateBooking = async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    const isAdmin = isAdminRole(role);

    const [existingRows] = await pool.query('SELECT * FROM bookings_rooms WHERE id = ?', [req.params.id]);
    if (!existingRows.length) return res.status(404).json({ message: 'Booking not found' });
    const existing = existingRows[0];

    if (!isAdmin && existing.user_id !== userId) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    if (!isAdmin) {
      const cutoffHours = await getGuestCancellationCutoffHours();

      if (req.body.status === 'Cancelled') {
        const cancelError = assertCanCancelRoomBooking({
          status: existing.status,
          check_in: existing.check_in,
          check_out: existing.check_out,
          isAdmin: false,
          cutoffHours,
        });
        if (cancelError) return res.status(400).json({ message: cancelError });
        await pool.query('UPDATE bookings_rooms SET status = ? WHERE id = ?', ['Cancelled', req.params.id]);
        const [rows] = await pool.query(`${bookingSelect} WHERE bk.id = ?`, [req.params.id]);
        const booking = await enrichBooking(rows[0]);
        notifyBookingCancelled(rows[0], { cancelledByGuest: true });
        return res.status(200).json({ message: 'Booking cancelled', booking });
      }

      const modifyError = assertCanModifyRoomBooking({
        status: existing.status,
        check_in: existing.check_in,
        check_out: existing.check_out,
        isAdmin: false,
        cutoffHours,
      });
      if (modifyError) return res.status(400).json({ message: modifyError });

      const wasApproved = existing.status === 'Approved';
      const { modification_message } = req.body;
      if (wasApproved && !String(modification_message || '').trim()) {
        return res.status(400).json({ message: 'Please explain what you want changed.' });
      }

      const validated = await validateBookingUpdate(existing, req.body, false);
      const { check_in, check_out, guest_count, notes, contact_phone, room_id, meals, fees, meal_allergen_notes } = req.body;
      const mealRates = await getMealRates('Guest');
      let feesToSave = fees;
      if (fees != null) {
        const catalogRows = await fetchExtraServiceRows();
        const existingFees = await getBookingFees(req.params.id);
        feesToSave = sanitizeGuestSubmittedFees(fees, catalogRows, existingFees);
      }
      const grandTotal = await computeUpdatedBookingGrandTotal(existing, validated, {
        meals: meals != null ? meals : null,
        fees: feesToSave != null ? feesToSave : null,
        mealRates,
      });

      const nextStatus = wasApproved ? 'Pending' : 'Pending';
      const modNote = wasApproved
        ? `[Modification requested] ${String(modification_message).trim()}`
        : (modification_message?.trim() ? `[Updated by guest] ${modification_message.trim()}` : '');
      const clientNotes = notes != null ? notes : existing.notes;
      const combinedNotes = modNote
        ? [clientNotes, modNote].filter((n) => n != null && String(n).trim()).join('\n')
        : clientNotes;

      await pool.query(
        `UPDATE bookings_rooms SET
          room_id = COALESCE(?, room_id),
          check_in = COALESCE(?, check_in),
          check_out = COALESCE(?, check_out),
          guest_count = COALESCE(?, guest_count),
          status = ?,
          season = ?, occupancy_item = ?,
          notes = ?,
          contact_phone = COALESCE(?, contact_phone),
          meal_allergen_notes = COALESCE(?, meal_allergen_notes),
          total_amount = ?
        WHERE id = ?`,
        [
          room_id ?? validated.roomId,
          check_in, check_out, guest_count, nextStatus,
          validated.season, validated.occupancyItem,
          combinedNotes, contact_phone, meal_allergen_notes, grandTotal,
          req.params.id,
        ]
      );

      if (meals != null) {
        await saveBookingMeals(req.params.id, meals, mealRates, { preserveExisting: true });
      }
      if (feesToSave != null) await saveBookingFees(req.params.id, feesToSave);

      const [rows] = await pool.query(`${bookingSelect} WHERE bk.id = ?`, [req.params.id]);
      const booking = await enrichBooking(rows[0]);
      void notifyGuestRoomSelfModified({
        previous: existing,
        current: rows[0],
        wasApproved,
        message: modification_message,
      });
      return res.status(200).json({
        message: wasApproved ? 'Modification request submitted' : 'Booking updated',
        booking,
      });
    }

    if (req.body.status === 'Cancelled') {
      const cancelError = assertCanCancelRoomBooking({
        status: existing.status,
        check_in: existing.check_in,
        check_out: existing.check_out,
        isAdmin: true,
      });
      if (cancelError) return res.status(400).json({ message: cancelError });
    }

    const validated = await validateBookingUpdate(existing, req.body, true);
    const { check_in, check_out, guest_count, status, notes, contact_phone, room_id, meals, fees, guest_name, email,
      notify_guest, notify_modification, modification_message, meal_allergen_notes } = req.body;
    const mealRates = await getMealRates();
    const grandTotal = await computeUpdatedBookingGrandTotal(existing, validated, {
      meals: meals != null ? meals : null,
      fees: fees != null ? fees : null,
      mealRates,
    });

    let resolvedUserId = req.body.user_id;
    if (guest_name || email || req.body.user_id) {
      resolvedUserId = await resolveGuestUser({
        userId: req.body.user_id || existing.user_id,
        guestName: guest_name,
        email,
      });
    }

    await pool.query(
      `UPDATE bookings_rooms SET
        user_id = COALESCE(?, user_id),
        room_id = COALESCE(?, room_id),
        check_in = COALESCE(?, check_in),
        check_out = COALESCE(?, check_out),
        guest_count = COALESCE(?, guest_count),
        status = COALESCE(?, status),
        season = ?, occupancy_item = ?,
        notes = COALESCE(?, notes),
        contact_phone = COALESCE(?, contact_phone),
        meal_allergen_notes = COALESCE(?, meal_allergen_notes),
        pricing_category = ?,
        total_amount = ?
      WHERE id = ?`,
      [
        resolvedUserId,
        room_id ?? validated.roomId,
        check_in, check_out, guest_count, status,
        validated.season, validated.occupancyItem,
        notes, contact_phone, meal_allergen_notes, 'Guest', grandTotal,
        req.params.id,
      ]
    );

    if (meals != null) {
      await saveBookingMeals(req.params.id, meals, mealRates, { preserveExisting: true });
    }
    if (fees != null) await saveBookingFees(req.params.id, fees);

    const [rows] = await pool.query(`${bookingSelect} WHERE bk.id = ?`, [req.params.id]);
    const booking = await enrichBooking(rows[0]);

    const becameApproved = status === 'Approved' && existing.status !== 'Approved';
    if (becameApproved || (status === 'Approved' && !booking.invoice)) {
      await ensureInvoiceForBooking(req.params.id);
      booking.invoice = await getInvoiceSnapshot(req.params.id);
    } else if (status === 'Approved' && grandTotal !== Number(existing.total_amount)) {
      await ensureInvoiceForBooking(req.params.id);
      booking.invoice = await getInvoiceSnapshot(req.params.id);
    }

    if (notify_guest && isAdmin) {
      await notifyBookingUpdated({
        previous: existing,
        current: rows[0],
        modificationMessage: modification_message,
        notifyModification: Boolean(notify_modification),
      });
    } else if (status === 'Cancelled') {
      notifyBookingCancelled(rows[0], { cancelledByGuest: false });
    }

    res.status(200).json({ message: 'Booking updated', booking });
  } catch (error) {
    const status = error.message.includes('already reserved') || error.message.includes('Maximum') || error.message.includes('Minimum') || error.message.includes('advance') || error.message.includes('past')
      ? 409 : 400;
    res.status(status).json({ message: error.message });
  }
};

export const deleteBooking = async (req, res) => {
  try {
    const [existing] = await pool.query('SELECT id FROM bookings_rooms WHERE id = ?', [req.params.id]);
    if (!existing.length) return res.status(404).json({ message: 'Booking not found' });
    await deletePaymentsForRoomBooking(req.params.id);
    await pool.query('DELETE FROM bookings_rooms WHERE id = ?', [req.params.id]);
    res.status(200).json({ message: 'Booking deleted' });
  } catch (error) {
    const status = error.message.includes('paid invoice') ? 409 : 500;
    res.status(status).json({ message: error.message });
  }
};
