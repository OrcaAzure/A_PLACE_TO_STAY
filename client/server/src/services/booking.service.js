import { pool } from '../config/db.js';
import bcrypt from 'bcryptjs';
import { calcNights, isEmpty } from '../utils/helpers.js';
import { DEFAULT_BOOKING_GUEST_ROLE } from '../utils/constants.js';
import { sendBookingConfirmationEmail, sendBookingModifiedEmail } from './email.service.js';
import { validateReservationDates } from './fiscalYear.service.js';
import { DEFAULT_MEAL_RATES } from '../constants/ancillary.js';
import { getMealRatesMap } from './ancillary.service.js';
import { resolveRateRoomType, formatRoomTypeLabel } from '../constants/rooms.js';
import {
  resolveLodgingSeasonForDate,
  addDaysISO,
  resolveStaySeasons,
} from './season.service.js';

const ACTIVE_STATUSES = ['Pending', 'Approved'];

export async function getRoomById(roomId) {
  const [rows] = await pool.query(
    `SELECT rooms.*, buildings.name AS building_name
     FROM rooms
     LEFT JOIN buildings ON buildings.id = rooms.building_id
     WHERE rooms.id = ? LIMIT 1`,
    [roomId]
  );
  return rows[0] || null;
}

/** Lodging season for the check-in date (from admin-configured calendar periods). */
export async function resolveSeason(checkIn) {
  return resolveLodgingSeasonForDate(checkIn);
}

/** Sum nightly room charges — each night uses the season for that calendar date. */
export async function calculateStayTotalAmount({
  roomType,
  occupancyItem,
  guestCount,
  checkIn,
  checkOut,
}) {
  const nights = calcNights(checkIn, checkOut);
  if (!nights) return null;

  let total = 0;
  for (let i = 0; i < nights; i += 1) {
    const nightDate = addDaysISO(checkIn, i);
    const season = await resolveLodgingSeasonForDate(nightDate);
    const nightTotal = await calculateTotalAmount({
      roomType,
      occupancyItem,
      season,
      guestCount,
      nights: 1,
    });
    if (nightTotal == null) return null;
    total += nightTotal;
  }

  return Math.round(total * 100) / 100;
}

export async function getRate(roomType, occupancyItem, season) {
  const [rows] = await pool.query(
    `SELECT rate FROM rates_rooms
     WHERE room_type = ? AND item = ? AND season = ?
     LIMIT 1`,
    [roomType, occupancyItem, season]
  );
  return rows.length ? Number(rows[0].rate) : null;
}

export function defaultOccupancyItem(roomType) {
  return roomType === 'Dorm' ? 'Per person per Night' : 'Single/Double Occupancy';
}

export async function calculateTotalAmount({
  roomType,
  occupancyItem,
  season,
  guestCount,
  nights,
}) {
  const rate = await getRate(roomType, occupancyItem, season);
  if (rate == null) return null;

  let total = 0;

  switch (occupancyItem) {
    case 'Per person per Night':
      total = rate * guestCount * nights;
      break;
    case 'Single/Double Occupancy':
      total = rate * nights;
      if (roomType !== 'Dorm' && guestCount > 2) {
        const extraRate = await getRate(roomType, 'Extra Bed or Extra Person', season);
        if (extraRate != null) total += extraRate * (guestCount - 2) * nights;
      }
      break;
    case 'Daily Maximum':
      total = rate * nights;
      break;
    case 'Extra Bed or Extra Person':
      total = rate * guestCount * nights;
      break;
    default:
      total = rate * nights;
  }

  return Math.round(total * 100) / 100;
}

export async function hasOverlappingBooking(roomId, checkIn, checkOut, excludeBookingId = null, excludeGroupId = null) {
  const params = [roomId, checkOut, checkIn];
  let sql = `
    SELECT id FROM bookings_rooms
    WHERE room_id = ?
      AND status IN ('Pending', 'Approved')
      AND check_in < ?
      AND check_out > ?
  `;

  if (excludeBookingId) {
    sql += ' AND id != ?';
    params.push(excludeBookingId);
  }

  if (excludeGroupId) {
    sql += ' AND (group_id IS NULL OR group_id != ?)';
    params.push(excludeGroupId);
  }

  sql += ' LIMIT 1';
  const [rows] = await pool.query(sql, params);
  return rows.length > 0;
}

export function validateGuestCapacity(room, guestCount) {
  if (guestCount < room.capacity_min) {
    return `Minimum ${room.capacity_min} guest(s) required for this room`;
  }
  if (guestCount > room.capacity_max) {
    return `Maximum ${room.capacity_max} guest(s) allowed for this room`;
  }
  return null;
}

/** Resolve user_id for admin-created bookings (existing guest, email lookup, or new walk-in). */
export async function resolveGuestUser({ userId, guestName, email }) {
  if (userId) return Number(userId);
  const name = String(guestName || '').trim();
  if (!name) throw new Error('Guest name is required');

  const trimmedEmail = String(email || '').trim().toLowerCase();
  if (trimmedEmail) {
    const [rows] = await pool.query('SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1', [trimmedEmail]);
    if (rows.length) return rows[0].id;
  }

  const guestEmail = trimmedEmail || `guest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@aptspace.local`;
  const hashedPassword = await bcrypt.hash(Math.random().toString(36).slice(2), 10);
  const [result] = await pool.query(
    'INSERT INTO users (full_name, email, password, role) VALUES (?, ?, ?, ?)',
    [name, guestEmail, hashedPassword, DEFAULT_BOOKING_GUEST_ROLE]
  );
  return result.insertId;
}

export async function prepareBookingInsert({
  roomId,
  checkIn,
  checkOut,
  guestCount = 1,
  season,
  occupancyItem,
  bypassAdvanceLimit = false,
}) {
  await validateReservationDates(checkIn, checkOut, { bypassAdvanceLimit });

  const room = await getRoomById(roomId);
  if (!room) throw new Error('Room not found');
  if (room.status === 'Maintenance') {
    throw new Error('This room is under maintenance and cannot be booked');
  }
  if (room.status === 'Occupied') {
    throw new Error('This room is currently occupied and cannot be booked for these dates');
  }
  if (room.status === 'Dirty') {
    throw new Error('This room is being prepared and is not available to book yet');
  }

  const capacityError = validateGuestCapacity(room, guestCount);
  if (capacityError) throw new Error(capacityError);

  const overlap = await hasOverlappingBooking(roomId, checkIn, checkOut);
  if (overlap) throw new Error('This room is already reserved for the selected dates.');

  const resolvedSeason = season || (await resolveSeason(checkIn));
  const resolvedOccupancy = occupancyItem || defaultOccupancyItem(room.room_type);
  const rateRoomType = resolveRateRoomType(room);
  const nights = calcNights(checkIn, checkOut);
  const totalAmount = await calculateStayTotalAmount({
    roomType: rateRoomType,
    occupancyItem: resolvedOccupancy,
    guestCount,
    checkIn,
    checkOut,
  });

  return {
    season: resolvedSeason,
    occupancy_item: resolvedOccupancy,
    total_amount: totalAmount,
    nights,
    room,
  };
}

export async function validateBookingUpdate(existing, body, isAdmin) {
  const checkIn = body.check_in ?? existing.check_in;
  const checkOut = body.check_out ?? existing.check_out;
  const guestCount = body.guest_count ?? existing.guest_count;
  const roomId = body.room_id ?? existing.room_id;

  await validateReservationDates(checkIn, checkOut, { bypassAdvanceLimit: isAdmin });

  const room = await getRoomById(roomId);
  if (!room) throw new Error('Room not found');
  if (room.status === 'Maintenance') {
    throw new Error('This room is under maintenance and cannot be booked');
  }
  if (room.status === 'Occupied') {
    throw new Error('This room is currently occupied and cannot be booked for these dates');
  }
  if (room.status === 'Dirty') {
    throw new Error('This room is being prepared and is not available to book yet');
  }

  const capacityError = validateGuestCapacity(room, guestCount);
  if (capacityError) throw new Error(capacityError);

  const nextStatus = body.status ?? existing.status;
  if (ACTIVE_STATUSES.includes(nextStatus)) {
    const overlap = await hasOverlappingBooking(roomId, checkIn, checkOut, existing.id);
    if (overlap) throw new Error('This room is already reserved for the selected dates.');
  }

  let season = body.season ?? existing.season;
  let occupancyItem = body.occupancy_item ?? existing.occupancy_item;
  let totalAmount = body.total_amount ?? existing.total_amount;

  if (!isEmpty(body.check_in) || !isEmpty(body.check_out) || body.guest_count != null || body.room_id != null) {
    season = await resolveSeason(checkIn);
    occupancyItem = occupancyItem || defaultOccupancyItem(room.room_type);
    totalAmount = await calculateStayTotalAmount({
      roomType: resolveRateRoomType(room),
      occupancyItem,
      guestCount,
      checkIn,
      checkOut,
    });
  }

  return { checkIn, checkOut, guestCount, season, occupancyItem, totalAmount, roomId };
}

export const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

export async function getMealRates() {
  return getMealRatesMap();
}

export function calcMealsTotal(meals = {}, rates = DEFAULT_MEAL_RATES) {
  let total = 0;
  for (const type of MEAL_TYPES) {
    const qty = Number(meals[type] || 0);
    if (qty > 0) total += (rates[type] || 0) * qty;
  }
  return Math.round(total * 100) / 100;
}

export function calcFeesTotal(fees = []) {
  return Math.round((fees || []).reduce((s, f) => s + Number(f.amount || 0), 0) * 100) / 100;
}

export async function getBookingMeals(bookingId) {
  try {
    const [rows] = await pool.query(
      'SELECT meal_type, quantity, unit_price, subtotal FROM bookings_meals WHERE bookings_room_id = ?',
      [bookingId]
    );
    return rows;
  } catch {
    return [];
  }
}

export async function getBookingFees(bookingId) {
  try {
    const [rows] = await pool.query(
      'SELECT id, service_name, amount FROM bookings_extra_services WHERE bookings_room_id = ? ORDER BY id',
      [bookingId]
    );
    return rows.map((r) => ({ ...r, fee_name: r.service_name }));
  } catch {
    return [];
  }
}

export async function saveBookingFees(bookingId, fees = []) {
  try {
    await pool.query('DELETE FROM bookings_extra_services WHERE bookings_room_id = ?', [bookingId]);
    for (const fee of fees || []) {
      const name = String(fee.service_name || fee.fee_name || fee.name || '').trim();
      const amount = Number(fee.amount || 0);
      if (!name || amount <= 0) continue;
      await pool.query(
        'INSERT INTO bookings_extra_services (bookings_room_id, service_name, amount) VALUES (?, ?, ?)',
        [bookingId, name, amount]
      );
    }
  } catch { /* tables may not exist yet */ }
}

export async function saveBookingMeals(bookingId, meals = {}, rates = null) {
  const mealRates = rates || (await getMealRates());
  try {
    await pool.query('DELETE FROM bookings_meals WHERE bookings_room_id = ?', [bookingId]);
    for (const type of MEAL_TYPES) {
      const qty = Number(meals[type] || 0);
      if (qty <= 0) continue;
      const unitPrice = mealRates[type] || 0;
      const subtotal = Math.round(unitPrice * qty * 100) / 100;
      await pool.query(
        'INSERT INTO bookings_meals (bookings_room_id, meal_type, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?)',
        [bookingId, type, qty, unitPrice, subtotal]
      );
    }
  } catch { /* tables may not exist yet */ }
}

export async function computeGrandTotal({ roomTotal, meals, fees, mealRates = null }) {
  const rates = mealRates || (await getMealRates());
  return Math.round((Number(roomTotal || 0) + calcMealsTotal(meals, rates) + calcFeesTotal(fees)) * 100) / 100;
}

export async function getAvailableRooms({
  checkIn, checkOut, guestCount = 1, excludeBookingId = null, excludeGroupId = null, groupPicker = false,
  bypassAdvanceLimit = false,
}) {
  await validateReservationDates(checkIn, checkOut, { bypassAdvanceLimit });

  const [rooms] = await pool.query(
    `SELECT rooms.*, buildings.name AS building_name
     FROM rooms LEFT JOIN buildings ON buildings.id = rooms.building_id
     ORDER BY buildings.name, rooms.room_number`
  );

  const checkInSeason = await resolveSeason(checkIn);
  const staySeasons = await resolveStaySeasons(checkIn, checkOut);
  const nights = calcNights(checkIn, checkOut);
  const count = Number(guestCount) || 1;
  const results = [];

  for (const room of rooms) {
    const fitsCapacity = groupPicker
      ? count <= room.capacity_max
      : count >= room.capacity_min && count <= room.capacity_max;
    let availabilityStatus = 'available';

    if (room.status === 'Maintenance') availabilityStatus = 'maintenance';
    else if (room.status === 'Occupied') availabilityStatus = 'occupied';
    else if (room.status === 'Dirty') availabilityStatus = 'dirty';
    else if (!groupPicker && !fitsCapacity) availabilityStatus = 'too_small';
    else if (groupPicker && count > room.capacity_max) availabilityStatus = 'too_small';
    else if (await hasOverlappingBooking(room.id, checkIn, checkOut, excludeBookingId, excludeGroupId)) {
      availabilityStatus = 'booked';
    }

    const occupancyItem = defaultOccupancyItem(room.room_type);
    let pricePerNight = null;
    let estimatedTotal = null;
    const pricingGuests = groupPicker ? Math.max(room.capacity_min, Math.min(count, room.capacity_max)) : count;

    if (availabilityStatus !== 'maintenance' && availabilityStatus !== 'booked'
      && availabilityStatus !== 'occupied' && availabilityStatus !== 'dirty') {
      const rateRoomType = resolveRateRoomType(room);
      estimatedTotal = await calculateStayTotalAmount({
        roomType: rateRoomType,
        occupancyItem,
        guestCount: pricingGuests,
        checkIn,
        checkOut,
      });
      if (estimatedTotal != null && nights > 0) {
        pricePerNight = Math.round((estimatedTotal / nights) * 100) / 100;
      }
    }

    results.push({
      id: room.id,
      building_name: room.building_name,
      room_number: room.room_number,
      room_type: room.room_type,
      room_type_label: formatRoomTypeLabel(room),
      bed_count: room.bed_count ?? null,
      capacity_min: room.capacity_min,
      capacity_max: room.capacity_max,
      status: room.status,
      availability_status: availabilityStatus,
      fits_capacity: fitsCapacity,
      price_per_night: pricePerNight,
      estimated_total: estimatedTotal,
      nights,
      season: checkInSeason,
      seasons_in_stay: staySeasons,
      mixed_season_pricing: staySeasons.length > 1,
    });
  }

  return results;
}

export function notifyBookingCreated(bookingRow) {
  void sendBookingConfirmationEmail(
    { full_name: bookingRow.guest_name, email: bookingRow.guest_email },
    bookingRow
  );
}

export async function notifyBookingUpdated({ previous, current, modificationMessage, notifyModification }) {
  const user = { full_name: current.guest_name, email: current.guest_email };
  if (notifyModification && modificationMessage) {
    let previousRoom = 'Previous room';
    if (previous?.room_id) {
      const [rows] = await pool.query(
        `SELECT r.room_number, b.name AS building_name
         FROM rooms r JOIN buildings b ON r.building_id = b.id WHERE r.id = ? LIMIT 1`,
        [previous.room_id]
      );
      if (rows[0]) {
        previousRoom = `${rows[0].building_name} Room ${rows[0].room_number}`;
      }
    }
    await sendBookingModifiedEmail(user, current, {
      message: modificationMessage,
      previousRoom,
      previousCheckIn: previous?.check_in,
      previousCheckOut: previous?.check_out,
    });
    return;
  }
  if (String(current.status).toLowerCase() === 'approved') {
    notifyBookingCreated(current);
  }
}
