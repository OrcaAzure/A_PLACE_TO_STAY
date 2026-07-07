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
  if (tier === 'Deluxe 2 BR') return 'Deluxe Apartment (2 BR)';
  if (tier === 'Deluxe 3 BR') return 'Deluxe Apartment (3 BR)';
  return tier;
}

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
