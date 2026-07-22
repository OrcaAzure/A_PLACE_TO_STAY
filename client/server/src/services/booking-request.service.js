/**
 * Guest booking-request cart — turns a guest's multi-item request (rooms,
 * venues, meals) into real bookings: single room bookings, a reservation
 * group when multiple rooms are requested, and venue bookings, all validated
 * against availability and the fiscal-year window before insert.
 */
import { pool } from '../config/db.js';
import { isEmpty } from '../utils/helpers.js';
import { createReservationGroup, getGroupById, notifyGroupCreated } from './group.service.js';
import { validateReservationDates } from './fiscalYear.service.js';
import {
  prepareBookingInsert,
  getMealRates,
  saveBookingMeals,
  saveBookingFees,
  computeGrandTotal,
  notifyBookingCreated,
} from './booking.service.js';
import { fetchExtraServiceRows, sanitizeGuestSubmittedFees, resolveGuestLodgingExtraFees } from './ancillary.service.js';
import {
  resolveFacilityIdentity,
  findVenueBookingOverlap,
  normalizeFacilityBookingSeason,
  computeVenueTotal,
  validateVenueCapacity,
  validateVenueDuration,
} from './facility.service.js';
import { sendVenueBookingRequestReceivedEmail } from './email.service.js';

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

function normalizeTime(value) {
  if (!value) return value;
  const raw = String(value).trim();
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(raw)) return raw;
  if (/^\d{1,2}:\d{2}$/.test(raw)) return `${raw}:00`;
  return raw;
}

/** HH:MM or HH:MM:SS → TIME string, or null. */
function normalizeArrivalTime(value) {
  if (value == null || value === '') return null;
  const normalized = normalizeTime(value);
  if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(String(normalized))) {
    throw new Error('Arrival time must be a valid time (HH:MM).');
  }
  return normalized;
}

function makeBatchRef() {
  return `BR-${Date.now().toString(36).toUpperCase()}`;
}

async function createStandalonePendingRoomBooking({
  userId,
  contactName,
  contactPhone,
  checkIn,
  checkOut,
  room,
  meals,
  fees,
  meal_allergen_notes,
  notes,
  expected_arrival_time,
  bookingRef,
}) {
  const { room_id, guest_count } = room;
  const prepared = await prepareBookingInsert({
    roomId: room_id,
    checkIn,
    checkOut,
    guestCount: guest_count,
    bypassAdvanceLimit: false,
  });

  const mealRates = await getMealRates();
  const catalogRows = await fetchExtraServiceRows();
  let feesToSave = fees || [];
  if (feesToSave.length) {
    const sanitized = sanitizeGuestSubmittedFees(feesToSave, catalogRows, []);
    feesToSave = await resolveGuestLodgingExtraFees(sanitized, { checkIn, checkOut });
  }

  const grandTotal = await computeGrandTotal({
    roomTotal: prepared.total_amount,
    meals,
    fees: feesToSave,
    mealRates,
    checkIn,
    checkOut,
  });

  const [result] = await pool.query(
    `INSERT INTO bookings_rooms
       (user_id, room_id, group_id, check_in, check_out, guest_count, season, occupancy_item,
        total_amount, status, notes, booking_ref, contact_phone, meal_allergen_notes, expected_arrival_time, pricing_category)
     VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?, ?, ?, ?, 'Guest')`,
    [
      userId, room_id, checkIn, checkOut, guest_count,
      prepared.season, prepared.occupancy_item, grandTotal,
      notes || null, bookingRef, contactPhone || null, meal_allergen_notes || null,
      expected_arrival_time || null,
    ]
  );

  await saveBookingMeals(result.insertId, meals, mealRates, { checkIn, checkOut });
  await saveBookingFees(result.insertId, feesToSave);

  const [rows] = await pool.query(`${bookingSelect} WHERE bk.id = ?`, [result.insertId]);
  notifyBookingCreated(rows[0]);
  return rows[0];
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
  bookingRef,
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

  const [result] = await pool.query(
    `INSERT INTO bookings_facilities
       (user_id, facility_id, event_date, start_time, end_time, guest_count, season, total_amount, status, notes, booking_ref, contact_phone)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?, ?)`,
    [
      userId,
      catalogFacilityId,
      event_date,
      startTime,
      endTime,
      guest_count || 1,
      season,
      total_amount,
      notes || null,
      bookingRef,
      contact_phone || null,
    ]
  );

  const [rows] = await pool.query(`${facilityBookingSelect} WHERE fb.id = ?`, [result.insertId]);
  const booking = rows[0];
  void sendVenueBookingRequestReceivedEmail(
    { full_name: booking.guest_name, email: booking.guest_email },
    booking,
    { batchRef: bookingRef },
  );
  return booking;
}

export async function submitGuestBookingRequest({
  userId,
  contactName,
  contactPhone,
  groupName,
  checkIn,
  checkOut,
  notes,
  expectedArrivalTime,
  rooms = [],
  venues = [],
  meals,
  fees,
  mealAllergenNotes,
  meal_allergen_notes,
  is_group_stay: isGroupStayFlag,
}) {
  const allergenNotes = mealAllergenNotes ?? meal_allergen_notes;
  if (!rooms.length && !venues.length) {
    throw new Error('Add at least one room or venue to your booking request.');
  }
  if (isEmpty(contactName)) {
    throw new Error('Contact name is required.');
  }

  const batchRef = makeBatchRef();
  let group = null;
  let standaloneBooking = null;
  let arrivalTime = null;

  if (rooms.length) {
    if (isEmpty(checkIn) || isEmpty(checkOut)) {
      throw new Error('Check-in and check-out are required for room bookings.');
    }
    await validateReservationDates(checkIn, checkOut, { bypassAdvanceLimit: false });
    arrivalTime = normalizeArrivalTime(expectedArrivalTime);

    const isGroupStay = isGroupStayFlag === true || rooms.length > 1;

    if (!isGroupStay && rooms.length === 1) {
      standaloneBooking = await createStandalonePendingRoomBooking({
        userId,
        contactName,
        contactPhone,
        checkIn,
        checkOut,
        room: {
          room_id: Number(rooms[0].room_id),
          guest_count: Math.max(1, Number(rooms[0].guest_count) || 1),
        },
        meals,
        fees,
        meal_allergen_notes: allergenNotes,
        notes,
        expected_arrival_time: arrivalTime,
        bookingRef: batchRef,
      });
    } else {
      const totalGuests = rooms.reduce((sum, row) => sum + Math.max(1, Number(row.guest_count) || 1), 0);
      const effectiveGroupName = (groupName || '').trim() || `Group stay — ${contactName.trim()}`;

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
        is_group_stay: true,
        booking_ref: batchRef,
        notes,
        expected_arrival_time: arrivalTime,
        rooms: rooms.map((row) => ({
          room_id: Number(row.room_id),
          guest_count: Math.max(1, Number(row.guest_count) || 1),
        })),
        meals,
        fees,
        meal_allergen_notes: allergenNotes,
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
      bookingRef: batchRef,
    });
    facilityBookings.push(booking);
  }

  return {
    batch_ref: batchRef,
    group: group ? await getGroupById(group.id) : null,
    booking: standaloneBooking,
    facility_bookings: facilityBookings,
    message: 'Booking request submitted for review.',
  };
}
