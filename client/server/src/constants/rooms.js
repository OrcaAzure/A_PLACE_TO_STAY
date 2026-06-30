/** GMC deluxe units with three beds (FY26 inventory). */
export const DELUXE_3_BED_ROOM_NUMBERS = new Set(['201', '304']);

/** FY26 rate tier for pricing — sheet labels "Deluxe 2 BR" / "Deluxe 3 BR" map to bed count, not bedroom count. */
export function resolveRateRoomType(room) {
  if (!room?.room_type) return null;
  if (room.room_type === 'Deluxe Apartment') {
    const beds = deluxeBedCount(room);
    return beds >= 3 ? 'Deluxe 3 BR' : 'Deluxe 2 BR';
  }
  return room.room_type;
}

export function deluxeBedCount(room) {
  if (room?.room_type !== 'Deluxe Apartment') return null;
  if (room.bed_count != null) return Number(room.bed_count);
  if (room.bedroom_count != null) return Number(room.bedroom_count);
  return DELUXE_3_BED_ROOM_NUMBERS.has(String(room.room_number)) ? 3 : 2;
}

/** Guest-facing label — only 3-bed deluxe units get an explicit suffix. */
export function formatRoomTypeLabel(room) {
  if (!room?.room_type) return 'Room';
  if (room.room_type === 'Deluxe Apartment') {
    const beds = deluxeBedCount(room);
    return beds >= 3 ? 'Deluxe Apartment (3 beds)' : 'Deluxe Apartment';
  }
  return room.room_type;
}
