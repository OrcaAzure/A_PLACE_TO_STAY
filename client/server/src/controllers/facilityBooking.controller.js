import { pool } from '../config/db.js';
import { isEmpty } from '../utils/helpers.js';
import { resolveGuestUser } from '../services/booking.service.js';
import {
  assertCanCancelVenueBooking,
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
import { fetchFacilitiesWithRates, FACILITY_GROUP_ICONS } from '../services/facilityCatalog.service.js';

const ADMIN_ROLES = ['Super Admin', 'Admin'];

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
    if (ADMIN_ROLES.includes(role)) {
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
    if (!ADMIN_ROLES.includes(role) && rows[0].user_id !== userId) {
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
      user_id, guest_name, email, status,
    } = req.body;

    if (isEmpty(event_date) || isEmpty(start_time) || isEmpty(end_time)) {
      return res.status(400).json({ message: 'event_date, start_time, and end_time are required' });
    }
    if (isEmpty(facility_id) && isEmpty(event_venue_id) && isEmpty(room_code) && (isEmpty(category) || isEmpty(item))) {
      return res.status(400).json({ message: 'Provide facility_id, event_venue_id, room_code, or category and item' });
    }

    const isAdmin = ADMIN_ROLES.includes(role);
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

    const packageLabel = rateRow?.package_name || identity.item;
    const durationError = validateVenueDuration(startTime, endTime, packageLabel);
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
    const total_amount = computeVenueTotal(
      rateRow.rate,
      startTime,
      endTime,
      rateRow?.package_name || identity.item
    );

    const bookingStatus = isAdmin ? (status || 'Approved') : 'Pending';

    const [result] = await pool.query(
      `INSERT INTO bookings_facilities
         (user_id, facility_id, event_date, start_time, end_time, guest_count, season, total_amount, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [effectiveUserId, catalogFacilityId, event_date, startTime, endTime, guest_count || 1,
       season, total_amount, bookingStatus, notes || null]
    );

    const [rows] = await pool.query(`${bookingSelect} WHERE fb.id = ?`, [result.insertId]);
    res.status(201).json({ message: 'Venue booking created', booking: rows[0] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const updateFacilityBooking = async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    const [existing] = await pool.query('SELECT * FROM bookings_facilities WHERE id = ? LIMIT 1', [req.params.id]);
    if (!existing.length) return res.status(404).json({ message: 'Booking not found' });

    if (!ADMIN_ROLES.includes(role)) {
      if (existing[0].user_id !== userId) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      const { status } = req.body;
      if (status !== 'Cancelled') {
        return res.status(403).json({ message: 'You can only cancel your own pending bookings' });
      }
      const cancelError = assertCanCancelVenueBooking({
        status: existing[0].status,
        event_date: existing[0].event_date,
        start_time: existing[0].start_time,
        end_time: existing[0].end_time,
        isAdmin: false,
        cutoffHours: await getGuestCancellationCutoffHours(),
      });
      if (cancelError) return res.status(400).json({ message: cancelError });
      await pool.query('UPDATE bookings_facilities SET status = ? WHERE id = ?', ['Cancelled', req.params.id]);
      const [guestRows] = await pool.query(`${bookingSelect} WHERE fb.id = ?`, [req.params.id]);
      return res.status(200).json({ message: 'Booking cancelled', booking: guestRows[0] });
    } else {
      const { status, notes } = req.body;
      if (status === 'Cancelled') {
        const cancelError = assertCanCancelVenueBooking({
          status: existing[0].status,
          event_date: existing[0].event_date,
          start_time: existing[0].start_time,
          end_time: existing[0].end_time,
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
    }

    const [rows] = await pool.query(`${bookingSelect} WHERE fb.id = ?`, [req.params.id]);
    res.status(200).json({ message: 'Booking updated', booking: rows[0] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const deleteFacilityBooking = async (req, res) => {
  try {
    const [existing] = await pool.query('SELECT id FROM bookings_facilities WHERE id = ? LIMIT 1', [req.params.id]);
    if (!existing.length) return res.status(404).json({ message: 'Venue booking not found' });
    await pool.query('DELETE FROM bookings_facilities WHERE id = ?', [req.params.id]);
    res.status(200).json({ message: 'Venue booking deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
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
    const { facility_id, event_venue_id, room_code, category, item, event_date, start_time, end_time } = req.query;
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
    });

    const { row: rateRow } = identity;
    const packageLabel = rateRow?.package_name || identity.item;
    const durationError = validateVenueDuration(startTime, endTime, packageLabel);
    const estimatedTotal = computeVenueTotal(rateRow.rate, startTime, endTime, packageLabel);
    const rateMeta = venueRateMeta(packageLabel, rateRow.rate);
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

    for (const space of venueCatalog) {
      const resolved = await resolveVenueFacilityRowByFacilityId(space.id, date);
      if (!resolved) continue;

      const bookings = bookingsByFacility.get(space.id) || [];
      bookings.sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));

      const is_free = bookings.length === 0;
      if (is_free) noBookingsCount += 1;

      let is_free_for_slot = null;
      if (slotValid) {
        is_free_for_slot = !bookings.some((b) => bookingOverlapsSlot(b, checkStart, checkEnd));
        if (is_free_for_slot) freeForSlotCount += 1;
      }

      const groupKey = space.facility_group || 'Facilities';
      if (!byCategory.has(groupKey)) {
        byCategory.set(groupKey, {
          category: groupKey,
          icon: VENUE_CATEGORY_ICONS[groupKey] || space.icon || 'place',
          facilities: [],
        });
      }

      byCategory.get(groupKey).facilities.push({
        id: resolved.rate_id,
        facility_id: space.id,
        category: groupKey,
        item: space.room_code || space.name,
        label: space.label,
        name: space.name,
        room_code: space.room_code,
        description: space.description,
        season: resolved.season,
        calendar_season: resolved.calendar_season,
        rate: resolved.rate,
        bookings: bookings.map((b) => ({
          ...b,
          conflicts_slot: slotValid ? bookingOverlapsSlot(b, checkStart, checkEnd) : false,
        })),
        is_free,
        is_free_for_slot,
        has_pending: bookings.some((b) => b.status === 'Pending'),
      });
    }

    const venues = [...byCategory.values()];
    const pendingCount = bookingRows.filter((b) => b.status === 'Pending').length;
    const bookedCount = bookingRows.filter((b) => b.status === 'Approved').length;

    res.status(200).json({
      date,
      check_start: slotValid ? checkStart.slice(0, 5) : null,
      check_end: slotValid ? checkEnd.slice(0, 5) : null,
      summary: {
        totalSpaces: venueCatalog.length,
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
