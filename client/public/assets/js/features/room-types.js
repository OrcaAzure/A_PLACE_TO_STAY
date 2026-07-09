/**
 * Shared lodging room-type helpers (client).
 * BR = bedrooms. Inventory uses `Deluxe Apartment` + bed_count; pricing uses `Deluxe 2 BR` / `Deluxe 3 BR`.
 */

export const DELUXE_3_BEDROOM_ROOM_NUMBERS = new Set(['201', '304']);

/** Canonical filter / rate tier keys in display order. */
export const ROOM_TYPE_FILTER_ORDER = [
  'Superior Guest Room',
  'Standard Apartment',
  'Deluxe 2 BR',
  'Deluxe 3 BR',
  'Dorm',
  'VIP',
];

export function deluxeBedroomCount(room) {
  if (!room) return null;
  if (room.room_type === 'Deluxe 3 BR') return 3;
  if (room.room_type === 'Deluxe 2 BR') return 2;
  if (room.room_type !== 'Deluxe Apartment') return null;
  if (room.bed_count != null) return Number(room.bed_count);
  const num = String(room.room_number ?? room.roomNumber ?? '').trim();
  return DELUXE_3_BEDROOM_ROOM_NUMBERS.has(num) ? 3 : 2;
}

/** Filter key and pricing tier for a room row. */
export function resolveRoomFilterKey(room) {
  if (!room) return 'Room';
  if (room.rate_room_type) return room.rate_room_type;
  if (!room.room_type) return 'Room';
  if (room.room_type === 'Deluxe Apartment') {
    const bedrooms = deluxeBedroomCount(room);
    return bedrooms >= 3 ? 'Deluxe 3 BR' : 'Deluxe 2 BR';
  }
  if (room.room_type === 'Deluxe 2 BR' || room.room_type === 'Deluxe 3 BR') {
    return room.room_type;
  }
  return room.room_type;
}

/** Image / icon lookup key (rate tier). */
export function resolveRoomVisualKey(room) {
  return resolveRoomFilterKey(room);
}

export function roomTypeFilterLabel(filterKey) {
  const labels = {
    'Superior Guest Room': 'Superior Guest Room',
    'Standard Apartment': 'Standard Apartment',
    'Deluxe 2 BR': 'Deluxe Apartment · 2 BR',
    'Deluxe 3 BR': 'Deluxe Apartment · 3 BR',
    Dorm: 'Dorm',
    VIP: 'VIP Room',
  };
  return labels[filterKey] || filterKey;
}

/** Guest/admin card label for one room. */
export function formatRoomTypeDisplay(room) {
  if (room?.room_type_label) return room.room_type_label;
  return roomTypeFilterLabel(resolveRoomFilterKey(room));
}

export function collectRoomTypeFilters(rooms) {
  const map = new Map();
  for (const room of rooms || []) {
    const key = resolveRoomFilterKey(room);
    if (!map.has(key)) map.set(key, roomTypeFilterLabel(key));
  }
  return [...map.entries()].sort((a, b) => {
    const ia = ROOM_TYPE_FILTER_ORDER.indexOf(a[0]);
    const ib = ROOM_TYPE_FILTER_ORDER.indexOf(b[0]);
    if (ia === -1 && ib === -1) return a[1].localeCompare(b[1]);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

export function roomMatchesTypeFilter(room, filterKey) {
  if (!filterKey) return true;
  return resolveRoomFilterKey(room) === filterKey;
}
