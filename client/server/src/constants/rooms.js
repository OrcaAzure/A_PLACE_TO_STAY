/** GMC deluxe units with three bedrooms (FY26 inventory). */
export const DELUXE_3_BEDROOM_ROOM_NUMBERS = new Set(['201', '304']);

/** Room nightly-rate matrix dimensions (rates_rooms). */
export const ROOM_RATE_ITEMS = ['Single/Double Occupancy', 'Daily Maximum'];
export const ROOM_RATE_SEASONS = ['Regular', 'Peak', 'Super Peak'];
export const ROOM_RATE_ITEM_MAX_LENGTH = 120;

/** Built-in occupancy rate row names (FY26 pricelist). */
export const SINGLE_DOUBLE_OCCUPANCY_ITEM = 'Single/Double Occupancy';
export const DAILY_MAXIMUM_ITEM = 'Daily Maximum';

/**
 * Guests at or below this count use Single/Double; above uses Daily Maximum.
 * Matches the standard FY26 lodging pricelist (1–2 vs 3+).
 */
export const SINGLE_DOUBLE_MAX_GUESTS = 2;

/** Starter rows shown when a room type has no saved price rows yet. */
export const DEFAULT_ROOM_RATE_ITEMS = [...ROOM_RATE_ITEMS];

export function normalizeRoomRateItemName(value) {
  return String(value || '').trim().slice(0, ROOM_RATE_ITEM_MAX_LENGTH);
}

/** Distinct price row names for one room tier, with defaults first. */
export function collectRoomRateItemsForTier(roomType, rateRows = []) {
  const fromDb = [...new Set(
    rateRows
      .filter((row) => row.room_type === roomType)
      .map((row) => normalizeRoomRateItemName(row.item))
      .filter(Boolean),
  )];

  if (fromDb.length) {
    const defaults = ROOM_RATE_ITEMS.filter((item) => fromDb.includes(item));
    const custom = fromDb.filter((item) => !ROOM_RATE_ITEMS.includes(item)).sort((a, b) => a.localeCompare(b));
    return [...defaults, ...custom];
  }

  return [...DEFAULT_ROOM_RATE_ITEMS];
}

/** Built-in priceable tiers. Dorm is intentionally excluded (priced via Accommodation Extras). */
export const ROOM_RATE_BASE_TIERS = [
  'Superior Guest Room',
  'Standard Apartment',
  'Deluxe 2 BR',
  'Deluxe 3 BR',
  'VIP',
];

/** Inventory room types that are NOT priced through rates_rooms directly. */
export const NON_RATE_ROOM_TYPES = ['Dorm'];

/** Inventory room types whose pricing is derived (Deluxe splits into 2 BR / 3 BR tiers). */
export const DERIVED_RATE_ROOM_TYPES = ['Deluxe Apartment'];

export const ROOM_RATE_TIER_ICONS = {
  'Superior Guest Room': 'king_bed',
  'Standard Apartment': 'apartment',
  'Deluxe 2 BR': 'holiday_village',
  'Deluxe 3 BR': 'holiday_village',
  VIP: 'workspace_premium',
};

/** Friendly label for a pricing tier. */
export function roomRateTierLabel(tier) {
  if (tier === 'Deluxe 2 BR') return 'Deluxe Apartment · 2 BR';
  if (tier === 'Deluxe 3 BR') return 'Deluxe Apartment · 3 BR';
  if (tier === 'Superior Guest Room') return 'Superior Guest Room';
  if (tier === 'VIP') return 'VIP Room';
  return tier;
}
/** FY26 pricelist — dorm bookings require at least this many guests. */

/** FY26 rate tier — "Deluxe 2 BR" / "Deluxe 3 BR" = two or three bedrooms. */
export function resolveRateRoomType(room) {
  if (!room?.room_type) return null;
  if (room.room_type === 'Deluxe 2 BR') return 'Deluxe 2 BR';
  if (room.room_type === 'Deluxe 3 BR') return 'Deluxe 3 BR';
  if (room.room_type === 'Deluxe Apartment') {
    const bedrooms = deluxeBedroomCount(room);
    return bedrooms >= 3 ? 'Deluxe 3 BR' : 'Deluxe 2 BR';
  }
  return room.room_type;
}

/** Bedroom count for deluxe apartments (`bed_count` column stores bedrooms). */
export function deluxeBedroomCount(room) {
  if (!room) return null;
  if (room.room_type === 'Deluxe 3 BR') return 3;
  if (room.room_type === 'Deluxe 2 BR') return 2;
  if (room?.room_type !== 'Deluxe Apartment') return null;
  if (room.bed_count != null) return Number(room.bed_count);
  if (room.bedroom_count != null) return Number(room.bedroom_count);
  return DELUXE_3_BEDROOM_ROOM_NUMBERS.has(String(room.room_number)) ? 3 : 2;
}
/** Friendly label for deluxe units and built-in types. BR = bedrooms. */
export function formatRoomTypeLabel(room) {
  if (!room?.room_type) return 'Room';
  if (room.room_type === 'Superior Guest Room') return 'Superior Guest Room';
  if (room.room_type === 'VIP') return 'VIP Room';
  if (room.room_type === 'Deluxe Apartment' || room.room_type === 'Deluxe 2 BR' || room.room_type === 'Deluxe 3 BR') {
    const bedrooms = deluxeBedroomCount(room) ?? (room.room_type === 'Deluxe 3 BR' ? 3 : 2);
    return bedrooms >= 3 ? 'Deluxe Apartment · 3 BR' : 'Deluxe Apartment · 2 BR';
  }
  return room.room_type;
}
