/** GMC deluxe units with three bedrooms (FY26 inventory). */
export const DELUXE_3_BEDROOM_ROOM_NUMBERS = new Set(['201', '304']);

/** @deprecated alias */
export const DELUXE_3_BED_ROOM_NUMBERS = DELUXE_3_BEDROOM_ROOM_NUMBERS;

/** FY26 pricelist — dorm bookings require at least this many guests. */
export const DORM_MIN_GUEST_COUNT = 5;

/** FY26 rate tier — "Deluxe 2 BR" / "Deluxe 3 BR" = two or three bedrooms. */
export function resolveRateRoomType(room) {
  if (!room?.room_type) return null;
  if (room.room_type === 'Deluxe Apartment') {
    const bedrooms = deluxeBedroomCount(room);
    return bedrooms >= 3 ? 'Deluxe 3 BR' : 'Deluxe 2 BR';
  }
  return room.room_type;
}

/** Bedroom count for deluxe apartments (`bed_count` column stores bedrooms). */
export function deluxeBedroomCount(room) {
  if (room?.room_type !== 'Deluxe Apartment') return null;
  if (room.bed_count != null) return Number(room.bed_count);
  if (room.bedroom_count != null) return Number(room.bedroom_count);
  return DELUXE_3_BEDROOM_ROOM_NUMBERS.has(String(room.room_number)) ? 3 : 2;
}

/** @deprecated alias — use deluxeBedroomCount */
export function deluxeBedCount(room) {
  return deluxeBedroomCount(room);
}

/** Guest-facing label for deluxe units. */
export function formatRoomTypeLabel(room) {
  if (!room?.room_type) return 'Room';
  if (room.room_type === 'Deluxe Apartment') {
    const bedrooms = deluxeBedroomCount(room);
    return bedrooms >= 3 ? 'Deluxe Apartment (3 BR)' : 'Deluxe Apartment (2 BR)';
  }
  return room.room_type;
}
