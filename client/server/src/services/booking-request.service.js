import { pool } from '../config/db.js';
import { isEmpty } from '../utils/helpers.js';
import { createReservationGroup, getGroupById, notifyGroupCreated } from './group.service.js';
import { validateReservationDates } from './fiscalYear.service.js';
import {
  resolveFacilityIdentity,
  findVenueBookingOverlap,
  normalizeFacilityBookingSeason,
  computeVenueTotal,
  validateVenueCapacity,
  validateVenueDuration,
} from './facility.service.js';

const facilityBookingSelect = `
  SELECT fb.*,
         u.full_name AS guest_name,
         u.email AS guest_email,
         f.facility_group AS facility_category,
         f.name AS facility_name,
         f.room_code AS facility_room_code
  FROM bookings_facilities fb
  JOIN users u ON fb.user_id = u.id
  JOIN facilities f ON fb.facility_id = f.id
`;

function normalizeTime(value) {
  if (!value) return value;
  const raw = String(value).trim();
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(raw)) return raw;
  if (/^\d{1,2}:\d{2}$/.test(raw)) return `${raw}:00`;
  return raw;
}

function makeBatchRef() {
  return `BR-${Date.now().toString(36).toUpperCase()}`;
}

async function createPendingFacilityBooking({
  userId,
  facility_id,
  event_date,
  start_time,
  end_time,
  guest_count,
  notes,
  contact_phone,
  batchRef,
}) {
  const startTime = normalizeTime(start_time);
  const endTime = normalizeTime(end_time);

  if (event_date < new Date().toISOString().slice(0, 10)) {
    throw new Error('Event date cannot be in the past.');
  }

  const identity = await resolveFacilityIdentity({ facility_id, event_date });
  if (!identity) throw new Error('Venue space not found');

  const { row: rateRow } = identity;
  const catalogFacilityId = identity.facility_id;

  const durationError = validateVenueDuration(rateRow, startTime, endTime);
  if (durationError) throw new Error(durationError);

  const capacityError = validateVenueCapacity(rateRow, guest_count);
  if (capacityError) throw new Error(capacityError);

  const overlap = await findVenueBookingOverlap({
    facility_id: catalogFacilityId,
    category: identity.category,
    item: identity.item,
    eventDate: event_date,
    startTime,
    endTime,
  });
  if (overlap) {
    throw new Error('A venue in your request is already booked for the selected time slot.');
  }

  const season = normalizeFacilityBookingSeason(rateRow.season);
  const total_amount = computeVenueTotal(rateRow, startTime, endTime);
  const mergedNotes = [notes, `Booking request ref: ${batchRef}`].filter(Boolean).join('\n\n');

  const [result] = await pool.query(
    `INSERT INTO bookings_facilities
       (user_id, facility_id, event_date, start_time, end_time, guest_count, season, total_amount, status, notes, contact_phone)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?)`,
    [
      userId,
      catalogFacilityId,
      event_date,
      startTime,
      endTime,
      guest_count || 1,
      season,
      total_amount,
      mergedNotes || null,
      contact_phone || null,
    ]
  );

  const [rows] = await pool.query(`${facilityBookingSelect} WHERE fb.id = ?`, [result.insertId]);
  return rows[0];
}

export async function submitGuestBookingRequest({
  userId,
  contactName,
  contactPhone,
  groupName,
  checkIn,
  checkOut,
  notes,
  rooms = [],
  venues = [],
  meals,
  fees,
  meal_allergen_notes,
}) {
  if (!rooms.length && !venues.length) {
    throw new Error('Add at least one room or venue to your booking request.');
  }
  if (isEmpty(contactName)) {
    throw new Error('Contact name is required.');
  }

  const batchRef = makeBatchRef();
  let group = null;

  if (rooms.length) {
    if (isEmpty(checkIn) || isEmpty(checkOut)) {
      throw new Error('Check-in and check-out are required for room bookings.');
    }
    await validateReservationDates(checkIn, checkOut, { bypassAdvanceLimit: false });

    const totalGuests = rooms.reduce((sum, row) => sum + Math.max(1, Number(row.guest_count) || 1), 0);
    const effectiveGroupName = (groupName || '').trim() || `Group stay — ${contactName.trim()}`;
    const mergedNotes = [notes, `Booking request ref: ${batchRef}`].filter(Boolean).join('\n\n');

    group = await createReservationGroup({
      requesterId: userId,
      isAdmin: false,
      group_name: effectiveGroupName,
      contact_name: contactName.trim(),
      contact_phone: contactPhone || null,
      check_in: checkIn,
      check_out: checkOut,
      total_guests: totalGuests,
      rooms_requested: rooms.length,
      notes: mergedNotes,
      rooms: rooms.map((row) => ({
        room_id: Number(row.room_id),
        guest_count: Math.max(1, Number(row.guest_count) || 1),
      })),
      meals,
      fees,
      meal_allergen_notes,
    });

    const [[user]] = await pool.query(
      'SELECT full_name, email FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    notifyGroupCreated(group, {
      user: { full_name: contactName || user?.full_name, email: user?.email },
      batchRef,
    });
  }

  const facilityBookings = [];
  for (const venue of venues) {
    const booking = await createPendingFacilityBooking({
      userId,
      facility_id: venue.facility_id,
      event_date: venue.event_date,
      start_time: venue.start_time,
      end_time: venue.end_time,
      guest_count: venue.guest_count,
      notes: venue.notes,
      contact_phone: contactPhone,
      batchRef,
    });
    facilityBookings.push(booking);
  }

  return {
    batch_ref: batchRef,
    group: group ? await getGroupById(group.id) : null,
    facility_bookings: facilityBookings,
    message: 'Booking request submitted for review.',
  };
}
