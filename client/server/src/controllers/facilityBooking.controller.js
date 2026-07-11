import { pool } from '../config/db.js';
import { isEmpty } from '../utils/helpers.js';
import { ensureInvoiceForFacilityBooking, deletePaymentsForFacilityBooking } from '../services/payment.service.js';
import { resolveGuestUser } from '../services/booking.service.js';
import {
  assertCanCancelVenueBooking,
  assertCanModifyVenueBooking,
  getGuestCancellationCutoffHours,
} from '../services/reservationLifecycle.service.js';
import {
  bookingOverlapsSlot,
  findVenueBookingOverlap,
  normalizeTimeValue,
  normalizeFacilityBookingSeason,
  resolveFacilityIdentity,
  resolveVenueFacilityRowByFacilityId,
  computeVenueTotal,
  validateVenueCapacity,
  validateVenueDuration,
  venueRateMeta,
  bookingDurationHours,
} from '../services/facility.service.js';
import { fetchFacilitiesWithRates, FACILITY_GROUP_ICONS, formatFacilityLabel } from '../services/facilityCatalog.service.js';
import { venueKey } from '../services/venueAdmin.service.js';
import { sendGuestVenueSelfModifyEmail, sendVenueModifiedEmail } from '../services/email.service.js';
import { notifyVenueBookingCancelled } from '../services/booking.service.js';

import { isAdminRole, isAdminPortalRole } from '../utils/constants.js';

/** Ensure TIME values work with MySQL (HH:MM or HH:MM:SS). */
function normalizeTime(value) {
  if (!value) return value;
  const raw = String(value).trim();
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(raw)) return raw;
  if (/^\d{1,2}:\d{2}$/.test(raw)) return `${raw}:00`;
  return raw;
}

const bookingSelect = `
  SELECT fb.*,
         u.full_name AS guest_name,
         u.email     AS guest_email,
         f.facility_group AS facility_category,
         f.name      AS facility_name,
         f.room_code AS facility_room_code,
         f.description AS facility_description,
         f.package_name AS facility_package
  FROM bookings_facilities fb
  JOIN users u ON fb.user_id = u.id
  JOIN facilities f ON fb.facility_id = f.id
`;

export const getAllFacilityBookings = async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    let rows;
    if (isAdminPortalRole(role)) {
      [rows] = await pool.query(`${bookingSelect} ORDER BY fb.event_date ASC`);
    } else {
      [rows] = await pool.query(
        `${bookingSelect} WHERE fb.user_id = ? ORDER BY fb.event_date ASC`,
        [userId]
      );
    }
    res.status(200).json({ bookings: rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getFacilityBookingById = async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    const [rows] = await pool.query(`${bookingSelect} WHERE fb.id = ? LIMIT 1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Booking not found' });
    if (!isAdminPortalRole(role) && rows[0].user_id !== userId) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    res.status(200).json({ booking: rows[0] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const createFacilityBooking = async (req, res) => {
  try {
    const { id: userId, role } = req.user;
    const {
      facility_id, event_venue_id, room_code, category, item, event_date, start_time, end_time, guest_count, notes,
      user_id, guest_name, email, contact_phone, status,
    } = req.body;

    if (isEmpty(event_date) || isEmpty(start_time) || isEmpty(end_time)) {
      return res.status(400).json({ message: 'event_date, start_time, and end_time are required' });
    }
    if (isEmpty(facility_id) && isEmpty(event_venue_id) && isEmpty(room_code) && (isEmpty(category) || isEmpty(item))) {
      return res.status(400).json({ message: 'Provide facility_id, event_venue_id, room_code, or category and item' });
    }

    const isAdmin = isAdminRole(role);
    const effectiveUserId = isAdmin
      ? await resolveGuestUser({ userId: user_id, guestName: guest_name, email })
      : userId;

    const startTime = normalizeTime(start_time);
    const endTime = normalizeTime(end_time);

    if (event_date < new Date().toISOString().slice(0, 10)) {
      return res.status(400).json({ message: 'Event date cannot be in the past.' });
    }

    const identity = await resolveFacilityIdentity({
      facility_id, event_venue_id, room_code, category, item, event_date,
    });
    if (!identity) {
      return res.status(404).json({ message: 'Venue space not found' });
    }

    const { row: rateRow } = identity;
    const catalogFacilityId = identity.facility_id;

    const durationError = validateVenueDuration(rateRow, startTime, endTime);
    if (durationError) {
      return res.status(400).json({ message: durationError });
    }

    const capacityError = validateVenueCapacity(rateRow, guest_count);
    if (capacityError) {
      return res.status(400).json({ message: capacityError });
    }

    const overlap = await findVenueBookingOverlap({
      facility_id: catalogFacilityId,
      category: identity.category,
      item: identity.item,
      eventDate: event_date,
      startTime,
      endTime,
    });
    if (overlap) {
      return res.status(409).json({ message: 'This venue is already booked for the selected time slot.' });
    }

    const season = normalizeFacilityBookingSeason(rateRow.season);
    const total_amount = computeVenueTotal(rateRow, startTime, endTime);

    const bookingStatus = isAdmin ? (status || 'Approved') : 'Pending';

    const [result] = await pool.query(
      `INSERT INTO bookings_facilities
         (user_id, facility_id, event_date, start_time, end_time, guest_count, season, total_amount, status, notes, contact_phone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [effectiveUserId, catalogFacilityId, event_date, startTime, endTime, guest_count || 1,
       season, total_amount, bookingStatus, notes || null, contact_phone || null]
    );

    const [rows] = await pool.query(`${bookingSelect} WHERE fb.id = ?`, [result.insertId]);
    if (bookingStatus === 'Approved') {
      await ensureInvoiceForFacilityBooking(result.insertId, { autoEmail: true });
    }
    res.status(201).json({ message: 'Venue booking created', booking: rows[0] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const updateFacilityBooking = async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    const [existing] = await pool.query(`${bookingSelect} WHERE fb.id = ? LIMIT 1`, [req.params.id]);
    if (!existing.length) return res.status(404).json({ message: 'Booking not found' });

    const prev = existing[0];
    const prevVenueLabel = [prev.facility_category, prev.facility_name || prev.facility_room_code]
      .filter(Boolean)
      .join(' — ');

    if (!isAdminRole(role)) {
      if (existing[0].user_id !== userId) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      const cutoffHours = await getGuestCancellationCutoffHours();

      if (req.body.status === 'Cancelled') {
        const cancelError = assertCanCancelVenueBooking({
          status: existing[0].status,
          event_date: existing[0].event_date,
          start_time: existing[0].start_time,
          end_time: existing[0].end_time,
          isAdmin: false,
          cutoffHours,
        });
        if (cancelError) return res.status(400).json({ message: cancelError });
        await pool.query('UPDATE bookings_facilities SET status = ? WHERE id = ?', ['Cancelled', req.params.id]);
        const [guestRows] = await pool.query(`${bookingSelect} WHERE fb.id = ?`, [req.params.id]);
        notifyVenueBookingCancelled(guestRows[0], { cancelledByGuest: true });
        return res.status(200).json({ message: 'Booking cancelled', booking: guestRows[0] });
      }

      const modifyError = assertCanModifyVenueBooking({
        status: prev.status,
        event_date: prev.event_date,
        start_time: prev.start_time,
        end_time: prev.end_time,
        isAdmin: false,
        cutoffHours,
      });
      if (modifyError) return res.status(400).json({ message: modifyError });

      const wasApproved = prev.status === 'Approved';
      const { modification_message, event_date, start_time, end_time, guest_count, notes } = req.body;
      if (wasApproved && !String(modification_message || '').trim()) {
        return res.status(400).json({ message: 'Please explain what you want changed.' });
      }

      const nextDate = event_date ?? prev.event_date;
      const nextStart = normalizeTime(start_time ?? prev.start_time);
      const nextEnd = normalizeTime(end_time ?? prev.end_time);
      const nextGuests = guest_count != null ? Math.max(1, Number(guest_count)) : prev.guest_count;

      if (nextDate < new Date().toISOString().slice(0, 10)) {
        return res.status(400).json({ message: 'Event date cannot be in the past.' });
      }

      const rateRow = await resolveVenueFacilityRowByFacilityId(prev.facility_id, nextDate);
      if (!rateRow) {
        return res.status(404).json({ message: 'Venue space not found' });
      }

      const durationError = validateVenueDuration(rateRow, nextStart, nextEnd);
      if (durationError) return res.status(400).json({ message: durationError });

      const capacityError = validateVenueCapacity(rateRow, nextGuests);
      if (capacityError) return res.status(400).json({ message: capacityError });

      const overlap = await findVenueBookingOverlap({
        facility_id: prev.facility_id,
        eventDate: nextDate,
        startTime: nextStart,
        endTime: nextEnd,
        excludeBookingId: req.params.id,
      });
      if (overlap) {
        return res.status(409).json({ message: 'This venue is already booked for the selected time slot.' });
      }

      const season = normalizeFacilityBookingSeason(rateRow.season);
      const total_amount = computeVenueTotal(rateRow, nextStart, nextEnd);
      const nextStatus = 'Pending';

      const modNote = wasApproved
        ? `[Modification requested] ${String(modification_message).trim()}`
        : (modification_message?.trim() ? `[Updated by guest] ${modification_message.trim()}` : '');
      const clientNotes = notes != null ? notes : prev.notes;
      const combinedNotes = modNote
        ? [clientNotes, modNote].filter((n) => n != null && String(n).trim()).join('\n')
        : clientNotes;

      await pool.query(
        `UPDATE bookings_facilities SET
           event_date = ?,
           start_time = ?,
           end_time = ?,
           guest_count = ?,
           season = ?,
           total_amount = ?,
           status = ?,
           notes = ?,
           contact_phone = COALESCE(?, contact_phone)
         WHERE id = ?`,
        [nextDate, nextStart, nextEnd, nextGuests, season, total_amount, nextStatus, combinedNotes,
          req.body.contact_phone, req.params.id]
      );

      const [guestRows] = await pool.query(`${bookingSelect} WHERE fb.id = ?`, [req.params.id]);
      void sendGuestVenueSelfModifyEmail(
        { full_name: guestRows[0].guest_name, email: guestRows[0].guest_email },
        guestRows[0],
        {
          wasApproved,
          message: modification_message,
          previousEventDate: prev.event_date,
          previousStartTime: prev.start_time,
          previousEndTime: prev.end_time,
          previousGuestCount: prev.guest_count,
        }
      );
      return res.status(200).json({
        message: wasApproved ? 'Modification request submitted' : 'Booking updated',
        booking: guestRows[0],
      });
    } else {
      const {
        status, notes, event_date, start_time, end_time, guest_count, facility_id,
        user_id, guest_name, email, contact_phone, notify_guest, notify_modification, modification_message,
      } = req.body;

      const hasScheduleChange = event_date != null || start_time != null || end_time != null
        || guest_count != null || facility_id != null;
      const hasGuestChange = user_id != null || guest_name != null || email != null || contact_phone != null;

      if (status === 'Cancelled' && !hasScheduleChange && !hasGuestChange) {
        const cancelError = assertCanCancelVenueBooking({
          status: prev.status,
          event_date: prev.event_date,
          start_time: prev.start_time,
          end_time: prev.end_time,
          isAdmin: true,
        });
        if (cancelError) return res.status(400).json({ message: cancelError });
        await pool.query('UPDATE bookings_facilities SET status = ? WHERE id = ?', ['Cancelled', req.params.id]);
        const [cancelRows] = await pool.query(`${bookingSelect} WHERE fb.id = ?`, [req.params.id]);
        notifyVenueBookingCancelled(cancelRows[0], { cancelledByGuest: false });
        return res.status(200).json({ message: 'Booking cancelled', booking: cancelRows[0] });
      }

      if (hasScheduleChange || hasGuestChange) {
        const modifyError = assertCanModifyVenueBooking({
          status: prev.status,
          event_date: prev.event_date,
          start_time: prev.start_time,
          end_time: prev.end_time,
          isAdmin: true,
        });
        if (modifyError) return res.status(400).json({ message: modifyError });

        const nextDate = event_date ?? prev.event_date;
        const nextStart = normalizeTime(start_time ?? prev.start_time);
        const nextEnd = normalizeTime(end_time ?? prev.end_time);
        const nextGuests = guest_count != null ? Math.max(1, Number(guest_count)) : prev.guest_count;
        const nextFacilityId = facility_id ?? prev.facility_id;

        if (nextDate < new Date().toISOString().slice(0, 10)) {
          return res.status(400).json({ message: 'Event date cannot be in the past.' });
        }

        const rateRow = await resolveVenueFacilityRowByFacilityId(nextFacilityId, nextDate);
        if (!rateRow) {
          return res.status(404).json({ message: 'Venue space not found' });
        }

        const durationError = validateVenueDuration(rateRow, nextStart, nextEnd);
        if (durationError) return res.status(400).json({ message: durationError });

        const capacityError = validateVenueCapacity(rateRow, nextGuests);
        if (capacityError) return res.status(400).json({ message: capacityError });

        const overlap = await findVenueBookingOverlap({
          facility_id: nextFacilityId,
          eventDate: nextDate,
          startTime: nextStart,
          endTime: nextEnd,
          excludeBookingId: req.params.id,
        });
        if (overlap) {
          return res.status(409).json({ message: 'This venue is already booked for the selected time slot.' });
        }

        const season = normalizeFacilityBookingSeason(rateRow.season);
        const total_amount = computeVenueTotal(rateRow, nextStart, nextEnd);
        const nextStatus = status ?? prev.status;

        let resolvedUserId = prev.user_id;
        if (hasGuestChange) {
          resolvedUserId = await resolveGuestUser({
            userId: user_id || prev.user_id,
            guestName: guest_name,
            email,
          });
        }

        const modNote = modification_message?.trim()
          ? `[Modified by admin] ${modification_message.trim()}`
          : '';
        const clientNotes = notes != null ? notes : prev.notes;
        const combinedNotes = modNote
          ? [clientNotes, modNote].filter((n) => n != null && String(n).trim()).join('\n')
          : clientNotes;

        await pool.query(
          `UPDATE bookings_facilities SET
             user_id = ?,
             facility_id = ?,
             event_date = ?,
             start_time = ?,
             end_time = ?,
             guest_count = ?,
             season = ?,
             total_amount = ?,
             status = ?,
             notes = ?,
             contact_phone = COALESCE(?, contact_phone)
           WHERE id = ?`,
          [resolvedUserId, nextFacilityId, nextDate, nextStart, nextEnd, nextGuests,
            season, total_amount, nextStatus, combinedNotes, contact_phone, req.params.id]
        );

        const [rows] = await pool.query(`${bookingSelect} WHERE fb.id = ?`, [req.params.id]);

        const becameApproved = nextStatus === 'Approved' && prev.status !== 'Approved';
        if (becameApproved) {
          await ensureInvoiceForFacilityBooking(req.params.id, { autoEmail: true });
        } else if (nextStatus === 'Approved' && total_amount !== Number(prev.total_amount)) {
          await ensureInvoiceForFacilityBooking(req.params.id);
        }

        if (notify_guest) {
          void sendVenueModifiedEmail(
            { full_name: rows[0].guest_name, email: rows[0].guest_email },
            rows[0],
            {
              message: modification_message,
              notifyModification: Boolean(notify_modification),
              previousEventDate: prev.event_date,
              previousStartTime: prev.start_time,
              previousEndTime: prev.end_time,
              previousGuestCount: prev.guest_count,
              previousVenue: prevVenueLabel,
            }
          );
        }

        return res.status(200).json({ message: 'Booking updated', booking: rows[0] });
      }

      if (status === 'Cancelled') {
        const cancelError = assertCanCancelVenueBooking({
          status: prev.status,
          event_date: prev.event_date,
          start_time: prev.start_time,
          end_time: prev.end_time,
          isAdmin: true,
        });
        if (cancelError) return res.status(400).json({ message: cancelError });
      }
      await pool.query(
        `UPDATE bookings_facilities SET
           status = COALESCE(?, status),
           notes  = COALESCE(?, notes)
         WHERE id = ?`,
        [status, notes, req.params.id]
      );
      if (status === 'Cancelled') {
        const [cancelRows] = await pool.query(`${bookingSelect} WHERE fb.id = ?`, [req.params.id]);
        notifyVenueBookingCancelled(cancelRows[0], { cancelledByGuest: false });
      }
    }

    const becameApproved = req.body.status === 'Approved' && prev.status !== 'Approved';
    const [rows] = await pool.query(`${bookingSelect} WHERE fb.id = ?`, [req.params.id]);
    if (becameApproved) {
      await ensureInvoiceForFacilityBooking(req.params.id, { autoEmail: true });
    }
    res.status(200).json({ message: 'Booking updated', booking: rows[0] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const deleteFacilityBooking = async (req, res) => {
  try {
    const [existing] = await pool.query('SELECT id FROM bookings_facilities WHERE id = ? LIMIT 1', [req.params.id]);
    if (!existing.length) return res.status(404).json({ message: 'Venue booking not found' });
    await deletePaymentsForFacilityBooking(req.params.id);
    await pool.query('DELETE FROM bookings_facilities WHERE id = ?', [req.params.id]);
    res.status(200).json({ message: 'Venue booking deleted' });
  } catch (error) {
    const status = error.message.includes('paid invoice') ? 409 : 500;
    res.status(status).json({ message: error.message });
  }
};

const VENUE_CATEGORY_ICONS = {
  ...FACILITY_GROUP_ICONS,
  'GMC Conference Rooms': 'school',
  Recreation: 'sports_basketball',
};

function formatTime(t) {
  if (!t) return '';
  const raw = String(t);
  const [h, m] = raw.slice(0, 5).split(':').map(Number);
  const d = new Date(2000, 0, 1, h, m);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export const checkVenueSlotAvailability = async (req, res) => {
  try {
    const { facility_id, event_venue_id, room_code, category, item, event_date, start_time, end_time,
      exclude_booking_id } = req.query;
    const catalogId = facility_id || event_venue_id;
    if (!event_date || !start_time || !end_time) {
      return res.status(400).json({ message: 'event_date, start_time, and end_time are required' });
    }
    if (!catalogId && !room_code && (!category || !item)) {
      return res.status(400).json({ message: 'facility_id, room_code, or category and item are required' });
    }

    const startTime = normalizeTime(start_time);
    const endTime = normalizeTime(end_time);
    if (endTime <= startTime) {
      return res.status(400).json({ message: 'End time must be after start time' });
    }

    const identity = await resolveFacilityIdentity({
      facility_id: catalogId, room_code, category, item, event_date,
    });
    if (!identity) {
      return res.status(404).json({ message: 'Venue space not found' });
    }

    const overlap = await findVenueBookingOverlap({
      facility_id: identity.facility_id,
      category: identity.category,
      item: identity.item,
      eventDate: event_date,
      startTime,
      endTime,
      excludeBookingId: exclude_booking_id || undefined,
    });

    const { row: rateRow } = identity;
    const durationError = validateVenueDuration(rateRow, startTime, endTime);
    const estimatedTotal = computeVenueTotal(rateRow, startTime, endTime);
    const rateMeta = venueRateMeta(rateRow);
    const hours = bookingDurationHours(startTime, endTime);

    res.status(200).json({
      available: !overlap && !durationError,
      estimated_total: estimatedTotal,
      rate: Number(rateRow.rate),
      season: rateRow.season,
      calendar_season: rateRow.calendar_season || rateRow.season,
      duration_hours: hours,
      capacity_min: rateRow.capacity_min,
      capacity_max: rateRow.capacity_max,
      inclusions: rateRow.inclusions,
      policies: rateRow.policies,
      label: rateRow.label,
      ...rateMeta,
      message: durationError
        || (overlap ? 'This time slot is already booked or pending approval.' : 'This time slot is available to request.'),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/** Admin venue schedule — grouped bookable spaces with bookings for one date (optional time slot). */
export const getVenueScheduleOverview = async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const rawStart = req.query.start_time;
    const rawEnd = req.query.end_time;
    const hasSlot = rawStart && rawEnd;
    const checkStart = hasSlot ? normalizeTimeValue(rawStart) : null;
    const checkEnd = hasSlot ? normalizeTimeValue(rawEnd) : null;
    const slotValid = hasSlot && checkStart && checkEnd && checkEnd > checkStart;

    const venueCatalog = await fetchFacilitiesWithRates();

    const [bookingRows] = await pool.query(
      `${bookingSelect}
       WHERE fb.event_date = ? AND fb.status IN ('Pending', 'Approved')
       ORDER BY fb.start_time ASC`,
      [date]
    );

    const bookingsByFacility = new Map();
    for (const row of bookingRows) {
      if (!bookingsByFacility.has(row.facility_id)) bookingsByFacility.set(row.facility_id, []);
      bookingsByFacility.get(row.facility_id).push({
        id: row.id,
        status: row.status,
        start_time: row.start_time,
        end_time: row.end_time,
        start_label: formatTime(row.start_time),
        end_label: formatTime(row.end_time),
        guest_name: row.guest_name,
        guest_count: row.guest_count,
        notes: row.notes,
      });
    }

    const byCategory = new Map();
    let noBookingsCount = 0;
    let freeForSlotCount = 0;
    let totalSpaces = 0;

    // Collapse package/use rows into one physical venue (group + name + room_code).
    const byVenue = new Map();
    for (const space of venueCatalog) {
      const key = venueKey(space);
      if (!byVenue.has(key)) {
        byVenue.set(key, {
          key,
          name: space.name,
          facility_group: space.facility_group,
          room_code: space.room_code,
          description: space.description,
          icon: space.icon,
          spaces: [],
        });
      }
      byVenue.get(key).spaces.push(space);
    }

    for (const venue of byVenue.values()) {
      const facilityIds = venue.spaces.map((s) => s.id);
      const resolvedRows = [];
      for (const space of venue.spaces) {
        const resolved = await resolveVenueFacilityRowByFacilityId(space.id, date);
        if (resolved) resolvedRows.push(resolved);
      }
      if (!resolvedRows.length) continue;

      const bookingMap = new Map();
      for (const facilityId of facilityIds) {
        for (const booking of bookingsByFacility.get(facilityId) || []) {
          bookingMap.set(booking.id, booking);
        }
      }
      const bookings = [...bookingMap.values()]
        .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));

      const rates = resolvedRows.map((r) => Number(r.rate)).filter((n) => Number.isFinite(n));
      const minRate = rates.length ? Math.min(...rates) : Number(resolvedRows[0].rate) || 0;
      const rateFrom = rates.some((r) => r !== minRate);
      const primary = resolvedRows[0];
      const displayLabel = formatFacilityLabel({
        room_code: venue.room_code,
        name: venue.name,
      });

      const is_free = bookings.length === 0;
      if (is_free) noBookingsCount += 1;

      let is_free_for_slot = null;
      if (slotValid) {
        is_free_for_slot = !bookings.some((b) => bookingOverlapsSlot(b, checkStart, checkEnd));
        if (is_free_for_slot) freeForSlotCount += 1;
      }

      const groupKey = venue.facility_group || 'Facilities';
      if (!byCategory.has(groupKey)) {
        byCategory.set(groupKey, {
          category: groupKey,
          icon: VENUE_CATEGORY_ICONS[groupKey] || venue.icon || 'place',
          facilities: [],
        });
      }

      byCategory.get(groupKey).facilities.push({
        id: primary.rate_id,
        facility_id: facilityIds[0],
        facility_ids: facilityIds,
        uses_count: venue.spaces.length,
        category: groupKey,
        item: venue.room_code || venue.name,
        label: displayLabel,
        name: venue.name,
        room_code: venue.room_code,
        description: venue.description,
        season: primary.season,
        calendar_season: primary.calendar_season,
        rate: minRate,
        rate_from: rateFrom,
        min_hours: primary.min_hours,
        bookings: bookings.map((b) => ({
          ...b,
          conflicts_slot: slotValid ? bookingOverlapsSlot(b, checkStart, checkEnd) : false,
        })),
        is_free,
        is_free_for_slot,
        has_pending: bookings.some((b) => b.status === 'Pending'),
      });
      totalSpaces += 1;
    }

    const venues = [...byCategory.values()];
    const pendingCount = bookingRows.filter((b) => b.status === 'Pending').length;
    const bookedCount = bookingRows.filter((b) => b.status === 'Approved').length;

    res.status(200).json({
      date,
      check_start: slotValid ? checkStart.slice(0, 5) : null,
      check_end: slotValid ? checkEnd.slice(0, 5) : null,
      summary: {
        totalSpaces,
        noBookingsToday: noBookingsCount,
        freeForSlot: slotValid ? freeForSlotCount : null,
        bookedToday: bookedCount,
        pendingRequests: pendingCount,
      },
      venues,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
