import { pool } from '../config/db.js';
import { calcNights, isEmpty } from '../utils/helpers.js';

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

export async function hasOverlappingBooking(roomId, checkIn, checkOut, excludeBookingId = null) {
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

export async function prepareBookingInsert({
  roomId,
  checkIn,
  checkOut,
  guestCount = 1,
  season,
  occupancyItem,
}) {
  if (new Date(checkOut) <= new Date(checkIn)) {
    throw new Error('check_out must be after check_in');
  }

  const room = await getRoomById(roomId);
  if (!room) throw new Error('Room not found');
  if (room.status === 'Maintenance') {
    throw new Error('This room is under maintenance and cannot be booked');
  }

  const capacityError = validateGuestCapacity(room, guestCount);
  if (capacityError) throw new Error(capacityError);

  const overlap = await hasOverlappingBooking(roomId, checkIn, checkOut);
  if (overlap) throw new Error('Room is not available for the selected dates');

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
  const roomId = existing.room_id;

  if (new Date(checkOut) <= new Date(checkIn)) {
    throw new Error('check_out must be after check_in');
  }

  const room = await getRoomById(roomId);
  if (!room) throw new Error('Room not found');

  const capacityError = validateGuestCapacity(room, guestCount);
  if (capacityError) throw new Error(capacityError);

  const nextStatus = body.status ?? existing.status;
  if (ACTIVE_STATUSES.includes(nextStatus)) {
    const overlap = await hasOverlappingBooking(roomId, checkIn, checkOut, existing.id);
    if (overlap) throw new Error('Room is not available for the selected dates');
  }

  let season = body.season ?? existing.season;
  let occupancyItem = body.occupancy_item ?? existing.occupancy_item;
  let totalAmount = body.total_amount ?? existing.total_amount;

  if (!isEmpty(body.check_in) || !isEmpty(body.check_out) || body.guest_count != null) {
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

  return { checkIn, checkOut, guestCount, season, occupancyItem, totalAmount };
}
