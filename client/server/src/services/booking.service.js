import { pool } from '../config/db.js';
import bcrypt from 'bcryptjs';
import { calcNights, isEmpty } from '../utils/helpers.js';
import { DEFAULT_BOOKING_GUEST_ROLE } from '../utils/constants.js';
import {
  sendBookingConfirmationEmail, sendBookingRequestReceivedEmail,
  sendBookingModifiedEmail, sendGuestRoomSelfModifyEmail,
  sendRoomBookingCancelledEmail, sendRoomBookingDeclinedEmail,
  sendVenueBookingCancelledEmail, sendVenueBookingDeclinedEmail,
} from './email.service.js';
import { validateReservationDates } from './fiscalYear.service.js';
import { DEFAULT_MEAL_RATES } from '../constants/ancillary.js';
import { getMealRatesMap } from './ancillary.service.js';
import {
  fetchExtraServiceRows,
  sanitizeGuestSubmittedFees,
  resolveGuestLodgingExtraFees,
} from './ancillary.service.js';
import { resolveRateRoomType, formatRoomTypeLabel, DORM_MIN_GUEST_COUNT, SINGLE_DOUBLE_OCCUPANCY_ITEM, DAILY_MAXIMUM_ITEM, SINGLE_DOUBLE_MAX_GUESTS } from '../constants/rooms.js';
import {
  DEFAULT_RATE_AGE_BAND,
  DEFAULT_RATE_CURRENCY,
  DEFAULT_ROOM_BILLING_UNIT,
  pickBookingRateRow,
  DEFAULT_RATE_AUDIENCE,
} from '../constants/rateVariants.js';
import {
  resolveLodgingSeasonForDate,
  addDaysISO,
  resolveStaySeasons,
} from './season.service.js';
import { getAccommodationExtraRate, LODGING_EXTRA_ITEM, PER_PERSON_NIGHT_ITEM } from './lodgingExtras.service.js';

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
    `SELECT rate, audience, age_band, currency, billing_unit, notes FROM rates_rooms
     WHERE room_type = ? AND item = ? AND season = ?
     LIMIT 10`,
    [roomType, occupancyItem, season]
  );
  const match = pickBookingRateRow(rows, { billing_unit: DEFAULT_ROOM_BILLING_UNIT });
  return match ? Number(match.rate) : null;
}

export async function roomHasRateItem(roomType, item) {
  if (!roomType || !item) return false;
  const [rows] = await pool.query(
    `SELECT 1 FROM rates_rooms
     WHERE room_type = ? AND item = ?
       AND audience = ? AND age_band = ? AND currency = ? AND billing_unit = ?
     LIMIT 1`,
    [roomType, item, DEFAULT_RATE_AUDIENCE, DEFAULT_RATE_AGE_BAND, DEFAULT_RATE_CURRENCY, DEFAULT_ROOM_BILLING_UNIT],
  );
  return rows.length > 0;
}

/** Pick occupancy row from guest count (1–2 → Single/Double, 3+ → Daily Maximum). */
export function pickOccupancyItemByGuestCount(roomType, guestCount) {
  if (roomType === 'Dorm') return PER_PERSON_NIGHT_ITEM;
  const guests = Math.max(1, Number(guestCount) || 1);
  if (guests <= SINGLE_DOUBLE_MAX_GUESTS) return SINGLE_DOUBLE_OCCUPANCY_ITEM;
  return DAILY_MAXIMUM_ITEM;
}

/**
 * Resolve which price row applies for a stay.
 * Honors an explicit admin override; otherwise uses the 1–2 / 3+ pricelist rule.
 * Falls back to Single/Double when Daily Maximum is not configured for the room type.
 */
export async function resolveOccupancyItem({ roomType, guestCount, explicitItem = null } = {}) {
  const override = String(explicitItem || '').trim();
  if (override) return override;

  const preferred = pickOccupancyItemByGuestCount(roomType, guestCount);
  if (preferred === DAILY_MAXIMUM_ITEM && !(await roomHasRateItem(roomType, DAILY_MAXIMUM_ITEM))) {
    return SINGLE_DOUBLE_OCCUPANCY_ITEM;
  }
  return preferred;
}

export async function calculateTotalAmount({
  roomType,
  occupancyItem,
  season,
  guestCount,
  nights,
}) {
  if (occupancyItem === PER_PERSON_NIGHT_ITEM) {
    const rate = await getAccommodationExtraRate(season, PER_PERSON_NIGHT_ITEM);
    if (rate == null) return null;
    return Math.round(rate * guestCount * nights * 100) / 100;
  }

  if (occupancyItem === LODGING_EXTRA_ITEM) {
    const extraRate = await getAccommodationExtraRate(season, LODGING_EXTRA_ITEM);
    if (extraRate == null) return null;
    return Math.round(extraRate * guestCount * nights * 100) / 100;
  }

  const rate = await getRate(roomType, occupancyItem, season);
  if (rate == null) return null;

  let total = 0;

  switch (occupancyItem) {
    case SINGLE_DOUBLE_OCCUPANCY_ITEM:
      total = rate * nights;
      if (roomType !== 'Dorm' && guestCount > SINGLE_DOUBLE_MAX_GUESTS) {
        const extraRate = await getAccommodationExtraRate(season, LODGING_EXTRA_ITEM);
        if (extraRate != null) total += extraRate * (guestCount - SINGLE_DOUBLE_MAX_GUESTS) * nights;
      }
      break;
    case DAILY_MAXIMUM_ITEM:
    default:
      total = rate * nights;
      break;
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

const ACTIVE_BOOKING_STATUSES = ['Pending', 'Approved'];

/** Block room deletion when reservations still reference the inventory row. */
export async function assertRoomDeletable(roomId) {
  const [active] = await pool.query(
    `SELECT COUNT(*) AS n FROM bookings_rooms
     WHERE room_id = ? AND status IN (?, ?)`,
    [roomId, ...ACTIVE_BOOKING_STATUSES]
  );
  if (Number(active[0].n) > 0) {
    const n = Number(active[0].n);
    throw new Error(
      `This room has ${n} active reservation${n === 1 ? '' : 's'} (pending or approved). Cancel or reassign ${n === 1 ? 'it' : 'them'} before deleting the room.`
    );
  }

  const [history] = await pool.query(
    'SELECT COUNT(*) AS n FROM bookings_rooms WHERE room_id = ?',
    [roomId]
  );
  if (Number(history[0].n) > 0) {
    throw new Error(
      'This room still has reservation records on file (cancelled or past). Delete those records from Admin → Reservations (filter by Cancelled), then try removing the room again.'
    );
  }
}

export function physicalCapacityMin(room) {
  return Number(room?.capacity_min) || 1;
}

export function effectiveCapacityMin(room) {
  if (room?.room_type === 'Dorm') {
    return Math.max(physicalCapacityMin(room), DORM_MIN_GUEST_COUNT);
  }
  return physicalCapacityMin(room);
}

export function validateGuestCapacity(room, guestCount) {
  const minGuests = effectiveCapacityMin(room);
  if (guestCount < minGuests) {
    if (room?.room_type === 'Dorm' && minGuests === DORM_MIN_GUEST_COUNT) {
      return `Minimum ${DORM_MIN_GUEST_COUNT} guest(s) required for dorm bookings`;
    }
    return `Minimum ${minGuests} guest(s) required for this room`;
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
  excludeBookingId = null,
  excludeGroupId = null,
}) {
  await validateReservationDates(checkIn, checkOut, { bypassAdvanceLimit });

  const room = await getRoomById(roomId);
  if (!room) throw new Error('Room not found');
  if (room.status === 'Maintenance') {
    throw new Error('This room is under maintenance and cannot be booked');
  }
  if (room.status === 'Dirty') {
    throw new Error('This room is being prepared and is not available to book yet');
  }

  const capacityError = validateGuestCapacity(room, guestCount);
  if (capacityError) throw new Error(capacityError);

  const overlap = await hasOverlappingBooking(
    roomId, checkIn, checkOut, excludeBookingId, excludeGroupId
  );
  if (overlap) throw new Error('This room is already reserved for the selected dates.');

  const rateRoomType = resolveRateRoomType(room);
  const resolvedOccupancy = await resolveOccupancyItem({
    roomType: rateRoomType,
    guestCount,
    explicitItem: occupancyItem,
  });
  const nights = calcNights(checkIn, checkOut);
  const totalAmount = await calculateStayTotalAmount({
    roomType: rateRoomType,
    occupancyItem: resolvedOccupancy,
    guestCount,
    checkIn,
    checkOut,
  });

  if (totalAmount == null) {
    throw new Error('Room pricing is not configured for these dates. Contact the office to complete this booking.');
  }

  return {
    season: season || (await resolveSeason(checkIn)),
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
  if (room.status === 'Dirty') {
    throw new Error('This room is being prepared and is not available to book yet');
  }

  const capacityError = validateGuestCapacity(room, guestCount);
  if (capacityError) throw new Error(capacityError);

  const venueStay = existing.occupancy_item === 'Venue stay'
    || /\[Venue stay:/i.test(String(existing.notes || ''));

  const nextStatus = body.status ?? existing.status;

  let season = body.season ?? existing.season;
  let occupancyItem = body.occupancy_item ?? existing.occupancy_item;
  let totalAmount = body.total_amount != null ? Number(body.total_amount) : Number(existing.total_amount);

  const datesChanged = (body.check_in != null && body.check_in !== existing.check_in)
    || (body.check_out != null && body.check_out !== existing.check_out);
  const guestsChanged = body.guest_count != null && Number(body.guest_count) !== Number(existing.guest_count);
  const roomChanged = body.room_id != null && Number(body.room_id) !== Number(existing.room_id);
  const statusOnlyApproval = nextStatus === 'Approved'
    && existing.status === 'Pending'
    && body.status === 'Approved'
    && !datesChanged
    && !guestsChanged
    && !roomChanged;

  const skipOverlap = room.room_number === 'VENUE-STAY' || venueStay || statusOnlyApproval;
  if (ACTIVE_STATUSES.includes(nextStatus) && !skipOverlap) {
    const overlap = await hasOverlappingBooking(
      roomId, checkIn, checkOut, existing.id, existing.group_id ?? null
    );
    if (overlap) throw new Error('This room is already reserved for the selected dates.');
  }

  if (!venueStay && (datesChanged || guestsChanged || roomChanged)) {
    const rateRoomType = resolveRateRoomType(room);
    season = await resolveSeason(checkIn);
    occupancyItem = await resolveOccupancyItem({
      roomType: rateRoomType,
      guestCount,
      explicitItem: body.occupancy_item != null ? body.occupancy_item : null,
    });
    totalAmount = await calculateStayTotalAmount({
      roomType: rateRoomType,
      occupancyItem,
      guestCount,
      checkIn,
      checkOut,
    });
    if (totalAmount == null) {
      throw new Error('Room pricing is not configured for these dates.');
    }
  } else if (!venueStay && body.total_amount == null) {
    const mealRows = await getBookingMeals(existing.id);
    const feeRows = await getBookingFees(existing.id);
    const mealsTotal = calcMealsTotalFromRows(mealRows);
    const feesTotal = calcFeesTotal(feeRows);
    totalAmount = Math.round((Number(existing.total_amount) - mealsTotal - feesTotal) * 100) / 100;
  }

  return { checkIn, checkOut, guestCount, season, occupancyItem, totalAmount, roomId };
}

export const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

/** Stay nights as calendar dates (check-in through night before check-out). */
export function mealDatesForStay(checkIn, checkOut) {
  const nights = calcNights(checkIn, checkOut);
  const dates = [];
  for (let i = 0; i < nights; i += 1) {
    dates.push(addDaysISO(checkIn, i));
  }
  return dates;
}

/**
 * Normalize guest/admin meal payload to per-day rows.
 * Supports: array [{ meal_type, meal_date, quantity }], { byDate: { 'YYYY-MM-DD': { Breakfast: 1 } } },
 * or legacy flat { Breakfast: 2 } (same qty each stay night).
 */
export function normalizeMealsPayload(meals, checkIn, checkOut) {
  if (!meals) return [];
  if (Array.isArray(meals)) {
    return meals
      .filter((m) => m?.meal_type && m?.meal_date && Number(m.quantity) > 0)
      .map((m) => ({
        meal_type: m.meal_type,
        meal_date: String(m.meal_date).slice(0, 10),
        quantity: Number(m.quantity),
      }));
  }
  if (meals.byDate && typeof meals.byDate === 'object') {
    const rows = [];
    for (const [date, dayMeals] of Object.entries(meals.byDate)) {
      for (const [type, qtyRaw] of Object.entries(dayMeals || {})) {
        const qty = Number(qtyRaw || 0);
        if (qty > 0) {
          rows.push({
            meal_type: type,
            meal_date: String(date).slice(0, 10),
            quantity: qty,
          });
        }
      }
    }
    return rows;
  }
  const dates = mealDatesForStay(checkIn, checkOut);
  const rows = [];
  for (const date of dates) {
    for (const [type, qtyRaw] of Object.entries(meals)) {
      if (type === 'byDate') continue;
      const qty = Number(qtyRaw || 0);
      if (qty > 0) {
        rows.push({ meal_type: type, meal_date: date, quantity: qty });
      }
    }
  }
  return rows;
}

export function formatMealsBreakdown(rows = []) {
  const payload = mealsPayloadFromRows(rows);
  const byDate = payload.byDate || {};
  return Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, types]) => {
      const items = Object.entries(types)
        .filter(([, qty]) => Number(qty) > 0)
        .map(([type, qty]) => `${type} × ${qty}`)
        .join(', ');
      return { date, summary: items };
    })
    .filter((row) => row.summary);
}

export async function getMealRates() {
  return getMealRatesMap();
}

export function calcMealsTotal(meals = {}, rates = DEFAULT_MEAL_RATES, { checkIn, checkOut } = {}) {
  if (checkIn && checkOut) {
    const rows = normalizeMealsPayload(meals, checkIn, checkOut);
    let total = 0;
    for (const row of rows) {
      total += (rates[row.meal_type] || 0) * row.quantity;
    }
    return Math.round(total * 100) / 100;
  }
  let total = 0;
  for (const [type, qtyRaw] of Object.entries(meals || {})) {
    if (type === 'byDate') continue;
    const qty = Number(qtyRaw || 0);
    if (qty > 0) total += (rates[type] || 0) * qty;
  }
  return Math.round(total * 100) / 100;
}

/** Sum stored meal line subtotals (price locked at booking time). */
export function calcMealsTotalFromRows(rows = []) {
  const total = (rows || []).reduce((sum, row) => sum + Number(row.subtotal || 0), 0);
  return Math.round(total * 100) / 100;
}

export function mealUnitPriceMap(existingRows = []) {
  const map = {};
  for (const row of existingRows || []) {
    if (row.meal_type) map[row.meal_type] = Number(row.unit_price) || 0;
  }
  return map;
}

/**
 * Build per-meal unit prices for an update: keep stored prices for known lines,
 * use catalog only for newly added meal types.
 */
export function resolveMealUnitPricesForUpdate(meals = {}, catalogRates = {}, existingRows = []) {
  const stored = mealUnitPriceMap(existingRows);
  const prices = {};
  const types = new Set();
  if (meals?.byDate) {
    for (const dayMeals of Object.values(meals.byDate)) {
      for (const type of Object.keys(dayMeals || {})) types.add(type);
    }
  } else {
    for (const type of Object.keys(meals || {})) {
      if (type !== 'byDate') types.add(type);
    }
  }
  for (const type of types) {
    prices[type] = stored[type] != null ? stored[type] : (Number(catalogRates[type]) || 0);
  }
  return prices;
}

export function calcMealsTotalWithUnitPrices(meals = {}, unitPrices = {}) {
  let total = 0;
  for (const [type, qtyRaw] of Object.entries(meals || {})) {
    const qty = Number(qtyRaw || 0);
    if (qty <= 0) continue;
    total += (Number(unitPrices[type]) || 0) * qty;
  }
  return Math.round(total * 100) / 100;
}

export function calcFeesTotal(fees = []) {
  return Math.round((fees || []).reduce((s, f) => s + Number(f.amount || 0), 0) * 100) / 100;
}

export function mealsPayloadFromRows(rows = []) {
  const out = {};
  for (const row of rows || []) {
    if (!row.meal_type) continue;
    const date = String(row.meal_date || '').slice(0, 10);
    if (date) {
      if (!out.byDate) out.byDate = {};
      if (!out.byDate[date]) out.byDate[date] = {};
      out.byDate[date][row.meal_type] = Number(row.quantity) || 0;
    } else {
      out[row.meal_type] = (out[row.meal_type] || 0) + (Number(row.quantity) || 0);
    }
  }
  return out;
}

/** Recompute booking total when meals/fees change without double-counting existing add-ons. */
export async function computeUpdatedBookingGrandTotal(existing, validated, { meals, fees, mealRates, preserveMealPrices = true } = {}) {
  const rates = mealRates || (await getMealRates());
  const existingMealRows = await getBookingMeals(existing.id);

  const mealPayload = meals != null
    ? meals
    : mealsPayloadFromRows(existingMealRows);

  const mealUnitPrices = preserveMealPrices && existingMealRows.length
    ? resolveMealUnitPricesForUpdate(mealPayload, rates, existingMealRows)
    : null;

  const feePayload = fees != null
    ? fees
    : (await getBookingFees(existing.id)).map((f) => ({
      fee_name: f.fee_name || f.service_name || 'Extra service',
      amount: Number(f.amount || 0),
    }));

  return computeGrandTotal({
    roomTotal: validated.totalAmount,
    meals: mealPayload,
    fees: feePayload,
    mealRates: rates,
    mealUnitPrices,
    checkIn: validated.checkIn || existing.check_in,
    checkOut: validated.checkOut || existing.check_out,
  });
}

export async function getBookingMeals(bookingId) {
  try {
    const [rows] = await pool.query(
      'SELECT meal_type, meal_date, quantity, unit_price, subtotal FROM bookings_meals WHERE bookings_room_id = ? ORDER BY meal_date, meal_type',
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

export async function saveBookingMeals(bookingId, meals = {}, rates = null, {
  existingRows = null,
  preserveExisting = false,
  checkIn = null,
  checkOut = null,
} = {}) {
  const mealRates = rates || (await getMealRates());
  const storedPrices = preserveExisting
    ? mealUnitPriceMap(existingRows ?? await getBookingMeals(bookingId))
    : {};

  let stayCheckIn = checkIn;
  let stayCheckOut = checkOut;
  if (!stayCheckIn || !stayCheckOut) {
    const [bookingRows] = await pool.query(
      'SELECT check_in, check_out FROM bookings_rooms WHERE id = ? LIMIT 1',
      [bookingId]
    );
    stayCheckIn = stayCheckIn || bookingRows[0]?.check_in;
    stayCheckOut = stayCheckOut || bookingRows[0]?.check_out;
  }

  const mealRows = normalizeMealsPayload(meals, stayCheckIn, stayCheckOut);

  try {
    await pool.query('DELETE FROM bookings_meals WHERE bookings_room_id = ?', [bookingId]);
    for (const row of mealRows) {
      const unitPrice = preserveExisting && storedPrices[row.meal_type] != null
        ? storedPrices[row.meal_type]
        : (mealRates[row.meal_type] || 0);
      const subtotal = Math.round(unitPrice * row.quantity * 100) / 100;
      await pool.query(
        'INSERT INTO bookings_meals (bookings_room_id, meal_date, meal_type, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?, ?)',
        [bookingId, row.meal_date, row.meal_type, row.quantity, unitPrice, subtotal]
      );
    }
  } catch { /* tables may not exist yet */ }
}

export async function computeGrandTotal({
  roomTotal, meals, fees, mealRates = null, mealUnitPrices = null, checkIn, checkOut,
}) {
  const rates = mealRates || (await getMealRates());
  let mealsTotal;
  if (mealUnitPrices) {
    const rows = checkIn && checkOut
      ? normalizeMealsPayload(meals, checkIn, checkOut)
      : [];
    if (rows.length) {
      mealsTotal = rows.reduce(
        (sum, row) => sum + (Number(mealUnitPrices[row.meal_type]) || 0) * row.quantity,
        0
      );
      mealsTotal = Math.round(mealsTotal * 100) / 100;
    } else {
      mealsTotal = calcMealsTotalWithUnitPrices(meals, mealUnitPrices);
    }
  } else {
    mealsTotal = calcMealsTotal(meals, rates, { checkIn, checkOut });
  }
  return Math.round((Number(roomTotal || 0) + mealsTotal + calcFeesTotal(fees)) * 100) / 100;
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
    const physicalMin = physicalCapacityMin(room);
    const meetsDormMinimum = room.room_type !== 'Dorm' || count >= DORM_MIN_GUEST_COUNT;
    let availabilityStatus = 'available';

    if (room.status === 'Maintenance') availabilityStatus = 'maintenance';
    else if (await hasOverlappingBooking(room.id, checkIn, checkOut, excludeBookingId, excludeGroupId)) {
      availabilityStatus = 'booked';
    } else if (room.status === 'Dirty') availabilityStatus = 'dirty';
    else if (!groupPicker && count > room.capacity_max) availabilityStatus = 'too_small';
    else if (!groupPicker && room.room_type === 'Dorm' && room.capacity_max < DORM_MIN_GUEST_COUNT) {
      availabilityStatus = 'too_small';
    } else if (!groupPicker && room.room_type === 'Dorm' && !meetsDormMinimum) {
      availabilityStatus = 'dorm_min_guests';
    } else if (!groupPicker && room.room_type !== 'Dorm' && count < physicalMin) {
      availabilityStatus = 'too_small';
    }

    const pricingGuests = (() => {
      if (groupPicker) return Math.max(physicalMin, Math.min(count, room.capacity_max));
      if (room.room_type === 'Dorm') return Math.max(count, DORM_MIN_GUEST_COUNT);
      return count;
    })();

    const rateRoomType = resolveRateRoomType(room);
    const occupancyItem = await resolveOccupancyItem({
      roomType: rateRoomType,
      guestCount: pricingGuests,
    });
    let pricePerNight = null;
    let estimatedTotal = null;

    if (availabilityStatus !== 'maintenance' && availabilityStatus !== 'booked'
      && availabilityStatus !== 'occupied' && availabilityStatus !== 'dirty') {
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
      rate_room_type: rateRoomType,
      bed_count: room.bed_count ?? null,
      capacity_min: physicalMin,
      capacity_max: room.capacity_max,
      dorm_booking_minimum: room.room_type === 'Dorm' ? DORM_MIN_GUEST_COUNT : null,
      status: room.status,
      description: room.description ?? null,
      inclusions: room.inclusions ?? room.highlights ?? null,
      policies: room.policies ?? null,
      availability_status: availabilityStatus,
      fits_capacity: (room.room_type === 'Dorm'
        ? count <= room.capacity_max
        : count >= physicalMin && count <= room.capacity_max) && meetsDormMinimum,
      meets_dorm_minimum: meetsDormMinimum,
      per_person_pricing: room.room_type === 'Dorm',
      occupancy_item: occupancyItem,
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

/** Quote lodging total for one room using per-room guest count (Single/Double vs Daily Maximum). */
export async function getRoomStayEstimate({
  roomId,
  checkIn,
  checkOut,
  guestCount = 1,
  bypassAdvanceLimit = false,
}) {
  await validateReservationDates(checkIn, checkOut, { bypassAdvanceLimit });

  const room = await getRoomById(roomId);
  if (!room) throw new Error('Room not found');

  const count = Math.max(1, Number(guestCount) || 1);
  const capacityError = validateGuestCapacity(room, count);
  if (capacityError) throw new Error(capacityError);

  if (room.status === 'Maintenance') throw new Error('This room is under maintenance');
  if (room.status === 'Dirty') throw new Error('This room is not ready for booking');
  if (await hasOverlappingBooking(room.id, checkIn, checkOut)) {
    throw new Error('This room is not available for the selected dates');
  }

  const rateRoomType = resolveRateRoomType(room);
  const occupancyItem = await resolveOccupancyItem({
    roomType: rateRoomType,
    guestCount: count,
  });
  const nights = calcNights(checkIn, checkOut);
  const estimatedTotal = await calculateStayTotalAmount({
    roomType: rateRoomType,
    occupancyItem,
    guestCount: count,
    checkIn,
    checkOut,
  });
  if (estimatedTotal == null) throw new Error('No rate configured for this room and stay');

  const checkInSeason = await resolveSeason(checkIn);
  const pricePerNight = nights > 0
    ? Math.round((estimatedTotal / nights) * 100) / 100
    : null;

  return {
    room_id: room.id,
    guest_count: count,
    occupancy_item: occupancyItem,
    nights,
    price_per_night: pricePerNight,
    estimated_total: estimatedTotal,
    season: checkInSeason,
    room_type: room.room_type,
    capacity_min: effectiveCapacityMin(room),
    capacity_max: room.capacity_max,
    dorm_booking_minimum: room.room_type === 'Dorm' ? DORM_MIN_GUEST_COUNT : null,
  };
}

export async function buildBookingEmailPayload(bookingRow) {
  if (!bookingRow?.id) return bookingRow;
  const meals = bookingRow.meals ?? await getBookingMeals(bookingRow.id);
  const fees = bookingRow.fees ?? await getBookingFees(bookingRow.id);
  return {
    ...bookingRow,
    meals,
    fees,
    nights: calcNights(bookingRow.check_in, bookingRow.check_out),
  };
}

export function notifyBookingCreated(bookingRow) {
  void (async () => {
    const payload = await buildBookingEmailPayload(bookingRow);
    const user = { full_name: payload.guest_name, email: payload.guest_email };
    const status = String(payload.status || '').toLowerCase();
    if (status === 'approved') {
      await sendBookingConfirmationEmail(user, payload);
    } else if (status === 'pending') {
      await sendBookingRequestReceivedEmail(user, payload);
    }
  })();
}

export function notifyBookingCancelled(bookingRow, { cancelledByGuest = true } = {}) {
  void sendRoomBookingCancelledEmail(
    { full_name: bookingRow.guest_name, email: bookingRow.guest_email },
    bookingRow,
    { cancelledByGuest }
  );
}

export function notifyBookingDeclined(bookingRow, { reason = '' } = {}) {
  void sendRoomBookingDeclinedEmail(
    { full_name: bookingRow.guest_name, email: bookingRow.guest_email },
    bookingRow,
    { reason }
  );
}

export function notifyVenueBookingCancelled(bookingRow, { cancelledByGuest = true } = {}) {
  void sendVenueBookingCancelledEmail(
    { full_name: bookingRow.guest_name, email: bookingRow.guest_email },
    bookingRow,
    { cancelledByGuest }
  );
}

export function notifyVenueBookingDeclined(bookingRow, { reason = '' } = {}) {
  void sendVenueBookingDeclinedEmail(
    { full_name: bookingRow.guest_name, email: bookingRow.guest_email },
    bookingRow,
    { reason }
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
    const payload = await buildBookingEmailPayload(current);
    await sendBookingModifiedEmail(user, payload, {
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

export async function notifyGuestRoomSelfModified({ previous, current, wasApproved, message }) {
  const user = { full_name: current.guest_name, email: current.guest_email };
  let previousRoom = '—';
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
  void (async () => {
    const payload = await buildBookingEmailPayload(current);
    await sendGuestRoomSelfModifyEmail(user, payload, {
      wasApproved,
      message,
      previousRoom,
      previousCheckIn: previous?.check_in,
      previousCheckOut: previous?.check_out,
    });
  })();
}

/** Itemized stay quote — shared by guest wizard, admin detail, and billing. */
export async function getStayQuote({
  roomId,
  checkIn,
  checkOut,
  guestCount = 1,
  meals,
  fees,
  bypassAdvanceLimit = false,
}) {
  const estimate = await getRoomStayEstimate({
    roomId,
    checkIn,
    checkOut,
    guestCount,
    bypassAdvanceLimit,
  });

  const mealRates = await getMealRates();
  const catalogRows = await fetchExtraServiceRows();
  let feesToSave = fees || [];
  if (feesToSave.length) {
    const sanitized = sanitizeGuestSubmittedFees(feesToSave, catalogRows, []);
    feesToSave = await resolveGuestLodgingExtraFees(sanitized, { checkIn, checkOut });
  }

  const mealsTotal = calcMealsTotal(meals, mealRates, { checkIn, checkOut });
  const feesTotal = calcFeesTotal(feesToSave);
  const roomTotal = Number(estimate.estimated_total || 0);
  const grandTotal = Math.round((roomTotal + mealsTotal + feesTotal) * 100) / 100;

  const mealRows = normalizeMealsPayload(meals, checkIn, checkOut);
  const mealLines = mealRows.map((row) => ({
    label: `${row.meal_type} (${row.meal_date})`,
    quantity: row.quantity,
    unit_price: mealRates[row.meal_type] || 0,
    subtotal: Math.round((mealRates[row.meal_type] || 0) * row.quantity * 100) / 100,
  }));

  const feeLines = (feesToSave || []).map((f) => ({
    label: f.fee_name || f.service_name || 'Extra',
    amount: Number(f.amount || 0),
  }));

  return {
    room: {
      label: `Room × ${estimate.nights} night${estimate.nights === 1 ? '' : 's'}`,
      nights: estimate.nights,
      subtotal: roomTotal,
      occupancy_item: estimate.occupancy_item,
      season: estimate.season,
    },
    meals: mealLines,
    fees: feeLines,
    meals_total: mealsTotal,
    fees_total: feesTotal,
    room_total: roomTotal,
    grand_total: grandTotal,
    meals_breakdown: formatMealsBreakdown(
      mealRows.map((row) => ({
        meal_type: row.meal_type,
        meal_date: row.meal_date,
        quantity: row.quantity,
        unit_price: mealRates[row.meal_type] || 0,
        subtotal: Math.round((mealRates[row.meal_type] || 0) * row.quantity * 100) / 100,
      }))
    ),
  };
}
