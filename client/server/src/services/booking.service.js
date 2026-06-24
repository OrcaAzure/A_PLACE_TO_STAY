import { pool } from '../config/db.js';
import bcrypt from 'bcryptjs';
import { calcNights, isEmpty } from '../utils/helpers.js';
import { DEFAULT_BOOKING_GUEST_ROLE } from '../utils/constants.js';
import { sendBookingConfirmationEmail } from './email.service.js';
import { validateReservationDates } from './fiscalYear.service.js';

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

export async function resolveSeason(checkIn) {
  const [rows] = await pool.query(
    `SELECT season FROM season_definitions
     WHERE ? BETWEEN start_date AND end_date
     ORDER BY start_date DESC
     LIMIT 1`,
    [checkIn]
  );
  return rows[0]?.season || 'Regular';
}

export async function getRate(roomType, occupancyItem, season) {
  const [rows] = await pool.query(
    `SELECT rate FROM room_rates
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
    SELECT id FROM bookings
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

  const capacityError = validateGuestCapacity(room, guestCount);
  if (capacityError) throw new Error(capacityError);

  const overlap = await hasOverlappingBooking(roomId, checkIn, checkOut);
  if (overlap) throw new Error('This room is already reserved for the selected dates.');

  const resolvedSeason = season || (await resolveSeason(checkIn));
  const resolvedOccupancy = occupancyItem || defaultOccupancyItem(room.room_type);
  const nights = calcNights(checkIn, checkOut);
  const totalAmount = await calculateTotalAmount({
    roomType: room.room_type,
    occupancyItem: resolvedOccupancy,
    season: resolvedSeason,
    guestCount,
    nights,
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
    totalAmount = await calculateTotalAmount({
      roomType: room.room_type,
      occupancyItem,
      season,
      guestCount,
      nights: calcNights(checkIn, checkOut),
    });
  }

  return { checkIn, checkOut, guestCount, season, occupancyItem, totalAmount, roomId };
}

export const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
const DEFAULT_MEAL_RATES = { Breakfast: 175, Lunch: 225, Dinner: 225, Snack: 85 };

export async function getMealRates() {
  try {
    const [rows] = await pool.query(
      `SELECT item AS meal_type, rate AS price FROM facilities
       WHERE category = 'Food Service' AND item IN ('Breakfast', 'Lunch', 'Dinner', 'Snack')`
    );
    const rates = { ...DEFAULT_MEAL_RATES };
    rows.forEach((r) => { rates[r.meal_type] = Number(r.price); });
    return rates;
  } catch {
    return { ...DEFAULT_MEAL_RATES };
  }
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
      'SELECT meal_type, quantity, unit_price, subtotal FROM booking_meals WHERE booking_id = ?',
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
      'SELECT id, fee_name, amount FROM booking_fees WHERE booking_id = ? ORDER BY id',
      [bookingId]
    );
    return rows;
  } catch {
    return [];
  }
}

export async function saveBookingMeals(bookingId, meals = {}, rates = null) {
  const mealRates = rates || (await getMealRates());
  try {
    await pool.query('DELETE FROM booking_meals WHERE booking_id = ?', [bookingId]);
    for (const type of MEAL_TYPES) {
      const qty = Number(meals[type] || 0);
      if (qty <= 0) continue;
      const unitPrice = mealRates[type] || 0;
      const subtotal = Math.round(unitPrice * qty * 100) / 100;
      await pool.query(
        'INSERT INTO booking_meals (booking_id, meal_type, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?)',
        [bookingId, type, qty, unitPrice, subtotal]
      );
    }
  } catch { /* tables may not exist yet */ }
}

export async function saveBookingFees(bookingId, fees = []) {
  try {
    await pool.query('DELETE FROM booking_fees WHERE booking_id = ?', [bookingId]);
    for (const fee of fees || []) {
      const name = String(fee.fee_name || fee.name || '').trim();
      const amount = Number(fee.amount || 0);
      if (!name || amount <= 0) continue;
      await pool.query(
        'INSERT INTO booking_fees (booking_id, fee_name, amount) VALUES (?, ?, ?)',
        [bookingId, name, amount]
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

  const season = await resolveSeason(checkIn);
  const nights = calcNights(checkIn, checkOut);
  const count = Number(guestCount) || 1;
  const results = [];

  for (const room of rooms) {
    const fitsCapacity = groupPicker
      ? count <= room.capacity_max
      : count >= room.capacity_min && count <= room.capacity_max;
    let availabilityStatus = 'available';

    if (room.status === 'Maintenance') availabilityStatus = 'maintenance';
    else if (!groupPicker && !fitsCapacity) availabilityStatus = 'too_small';
    else if (groupPicker && count > room.capacity_max) availabilityStatus = 'too_small';
    else if (await hasOverlappingBooking(room.id, checkIn, checkOut, excludeBookingId, excludeGroupId)) {
      availabilityStatus = 'booked';
    }

    const occupancyItem = defaultOccupancyItem(room.room_type);
    let pricePerNight = null;
    let estimatedTotal = null;
    const pricingGuests = groupPicker ? Math.max(room.capacity_min, Math.min(count, room.capacity_max)) : count;

    if (availabilityStatus !== 'maintenance' && availabilityStatus !== 'booked') {
      pricePerNight = await getRate(room.room_type, occupancyItem, season);
      if (pricePerNight != null) {
        estimatedTotal = await calculateTotalAmount({
          roomType: room.room_type,
          occupancyItem,
          season,
          guestCount: pricingGuests,
          nights,
        });
      }
    }

    results.push({
      id: room.id,
      building_name: room.building_name,
      room_number: room.room_number,
      room_type: room.room_type,
      capacity_min: room.capacity_min,
      capacity_max: room.capacity_max,
      status: room.status,
      availability_status: availabilityStatus,
      fits_capacity: fitsCapacity,
      price_per_night: pricePerNight,
      estimated_total: estimatedTotal,
      nights,
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
