import { pool } from '../config/db.js';
import {
  LODGING_EXTRA_ITEM,
  calculateLodgingExtraTotalForStay,
} from './lodgingExtras.service.js';
import {
  DEFAULT_MEAL_RATES,
  MEAL_ICONS,
  MEAL_TYPES,
  SERVICE_ICONS,
  ACCOMMODATION_EXTRAS_CATEGORY,
  PER_PERSON_NIGHT_ITEM,
  GUEST_SELF_BOOK_EXCLUDED_CATEGORIES,
  GUEST_SELF_BOOK_EXCLUDED_ITEMS,
} from '../constants/ancillary.js';
import {
  ROOM_RATE_BASE_TIERS,
  ROOM_RATE_SEASONS,
  ROOM_RATE_TIER_ICONS,
  NON_RATE_ROOM_TYPES,
  DERIVED_RATE_ROOM_TYPES,
  roomRateTierLabel,
  collectRoomRateItemsForTier,
} from '../constants/rooms.js';
import {
  DEFAULT_EXTRA_BILLING_UNIT,
  DEFAULT_MEAL_BILLING_UNIT,
  DEFAULT_RATE_AUDIENCE,
  DEFAULT_RATE_AGE_BAND,
  DEFAULT_RATE_CURRENCY,
  DEFAULT_ROOM_BILLING_UNIT,
  normalizeRateVariant,
  rateVariantKey,
  matchesDefaultRateVariant,
  pickBookingRateRow,
} from '../constants/rateVariants.js';

export async function fetchMealRateRows() {
  const [rows] = await pool.query(
    `SELECT id, meal_type AS item, rate, audience, age_band, currency, billing_unit, notes
     FROM rates_meals
     ORDER BY meal_type ASC`
  );
  return rows;
}

export async function fetchExtraServiceRows() {
  const [rows] = await pool.query(
    `SELECT id, category, item, season, rate, audience, age_band, currency, billing_unit, notes
     FROM rates_extra_services
     ORDER BY category ASC, item ASC, FIELD(season, 'Regular', 'Peak', 'Super Peak', 'N/A')`
  );
  return rows;
}

export function groupMealRows(rows) {
  const byItem = new Map();

  for (const row of rows) {
    const item = row.item || row.meal_type;
    const variant = normalizeRateVariant(row, { billing_unit: DEFAULT_MEAL_BILLING_UNIT });
    const key = `${item}|${rateVariantKey(row, { billing_unit: DEFAULT_MEAL_BILLING_UNIT })}`;
    if (byItem.has(key)) continue;
    byItem.set(key, {
      id: row.id,
      item,
      icon: MEAL_ICONS[item] || 'restaurant',
      rate: Number(row.rate),
      ...variant,
    });
  }

  return [...byItem.values()].sort((a, b) =>
    `${a.item} ${a.audience} ${a.age_band} ${a.currency}`.localeCompare(`${b.item} ${b.audience} ${b.age_band} ${b.currency}`));
}

export function groupServiceRows(rows) {
  const byCategory = new Map();

  for (const row of rows) {
    if (!byCategory.has(row.category)) {
      byCategory.set(row.category, {
        category: row.category,
        icon: SERVICE_ICONS[row.category] || 'add_circle',
        items: [],
      });
    }
    const variant = normalizeRateVariant(row, {
      billing_unit: row.category === ACCOMMODATION_EXTRAS_CATEGORY ? 'per night' : DEFAULT_EXTRA_BILLING_UNIT,
    });
    byCategory.get(row.category).items.push({
      id: row.id,
      item: row.item,
      season: row.season || 'N/A',
      rate: Number(row.rate),
      ...variant,
    });
  }

  return [...byCategory.values()];
}

export function groupDefaultMealRows(rows) {
  return groupMealRows(rows).filter((row) => matchesDefaultRateVariant(row, { billing_unit: DEFAULT_MEAL_BILLING_UNIT }));
}

export function groupDefaultServiceRows(rows) {
  const grouped = groupServiceRows(rows);
  return grouped.map((group) => ({
    ...group,
    items: group.items.filter((item) => matchesDefaultRateVariant(item, {
      billing_unit: group.category === ACCOMMODATION_EXTRAS_CATEGORY ? 'per night' : DEFAULT_EXTRA_BILLING_UNIT,
    })),
  })).filter((group) => group.items.length);
}

function feeKey(name, amount) {
  return `${String(name || '').trim()}|${Number(amount)}`;
}

export function isGuestSelfBookableExtra(row) {
  if (!row) return false;
  if (GUEST_SELF_BOOK_EXCLUDED_CATEGORIES.includes(row.category)) return false;
  if (GUEST_SELF_BOOK_EXCLUDED_ITEMS.includes(row.item)) return false;
  return true;
}

export function guestBookableCatalogRows(catalogRows = []) {
  return (catalogRows || []).filter(isGuestSelfBookableExtra);
}

/** Guests may only keep existing fees or add catalog-listed extras (not arbitrary amounts). */
export function sanitizeGuestSubmittedFees(submitted = [], catalogRows = [], originalFees = []) {
  const catalogKeys = new Set(
    guestBookableCatalogRows(catalogRows).map((row) => feeKey(row.item, row.rate))
  );
  const originalKeys = new Set(
    (originalFees || []).map((f) => feeKey(f.fee_name || f.service_name, f.amount))
  );
  return (submitted || []).filter((f) => {
    const name = f.fee_name || f.service_name || f.name;
    if (isLodgingExtraFeeName(name)) return true;
    const key = feeKey(name, f.amount);
    return catalogKeys.has(key) || originalKeys.has(key);
  });
}

const LODGING_EXTRA_ALIASES = new Set([
  LODGING_EXTRA_ITEM,
  'Extra bed',
  'Extra person',
  'Extra Bed or Extra Person',
]);

function isLodgingExtraFeeName(name) {
  const raw = String(name || '').trim();
  if (!raw) return false;
  if (LODGING_EXTRA_ALIASES.has(raw)) return true;
  return /^extra\s+(bed|person)/i.test(raw);
}

/**
 * Re-price guest-selected lodging extras (extra bed/person) from stay dates.
 * Guests submit the canonical item name without choosing a rate tier.
 */
export async function resolveGuestLodgingExtraFees(submitted = [], { checkIn, checkOut } = {}) {
  if (!checkIn || !checkOut) return submitted || [];
  const resolved = [];
  for (const fee of submitted || []) {
    const name = String(fee.fee_name || fee.service_name || fee.name || '').trim();
    if (!isLodgingExtraFeeName(name)) {
      resolved.push(fee);
      continue;
    }
    const qty = Math.max(1, Number(fee.quantity) || 1);
    const amount = await calculateLodgingExtraTotalForStay({
      item: LODGING_EXTRA_ITEM,
      checkIn,
      checkOut,
      quantity: qty,
    });
    if (amount == null) continue;
    resolved.push({
      fee_name: LODGING_EXTRA_ITEM,
      amount,
      quantity: qty,
    });
  }
  return resolved;
}

export async function fetchRoomRateRows() {
  const [rows] = await pool.query(
    `SELECT id, room_type, item, season, rate, audience, age_band, currency, billing_unit, notes FROM rates_rooms`
  );
  return rows;
}

/**
 * Every priceable room tier with its full season x item matrix (rate or null).
 * Combines built-in tiers, any custom room types in inventory, and any tier
 * already present in rates_rooms — so admins can see and set every price.
 */
/**
 * Dorm nightly pricing lives in rates_extra_services (Accommodation Extras →
 * "Per person per Night", seasonal). Surfaced as a room-rate card so admins can
 * manage it alongside the other room types.
 */
async function getDormRateGroup() {
  const [rows] = await pool.query(
    `SELECT season, rate, audience, age_band, currency, billing_unit, notes
     FROM rates_extra_services
     WHERE category = ? AND item = ?`,
    [ACCOMMODATION_EXTRAS_CATEGORY, PER_PERSON_NIGHT_ITEM]
  );
  const defaults = { billing_unit: 'per night' };
  const defaultRows = rows.filter((r) => matchesDefaultRateVariant(r, defaults));
  const bySeason = new Map(defaultRows.map((r) => [r.season, Number(r.rate)]));
  return {
    room_type: 'Dorm',
    label: 'Dorm (per person / night)',
    icon: 'night_shelter',
    custom: false,
    items: [
      {
        item: PER_PERSON_NIGHT_ITEM,
        ...normalizeRateVariant(defaultRows[0] || {}, defaults),
        cells: ROOM_RATE_SEASONS.map((season) => ({
          season,
          rate: bySeason.has(season) ? bySeason.get(season) : null,
        })),
      },
    ],
  };
}

export async function getRoomRateGroups() {
  const rateRows = await fetchRoomRateRows();

  const excluded = new Set([...NON_RATE_ROOM_TYPES, ...DERIVED_RATE_ROOM_TYPES, ...ROOM_RATE_BASE_TIERS]);
  const [customRows] = await pool.query('SELECT DISTINCT room_type FROM rooms');
  const customTiers = customRows
    .map((r) => r.room_type)
    .filter((t) => t && !excluded.has(t))
    .sort((a, b) => String(a).localeCompare(String(b)));

  const tiers = [...ROOM_RATE_BASE_TIERS];
  const seen = new Set(tiers);
  for (const t of customTiers) {
    if (!seen.has(t)) { tiers.push(t); seen.add(t); }
  }
  for (const row of rateRows) {
    if (row.room_type && !NON_RATE_ROOM_TYPES.includes(row.room_type) && !seen.has(row.room_type)) {
      tiers.push(row.room_type);
      seen.add(row.room_type);
    }
  }

  const rateMap = new Map();
  for (const row of rateRows) {
    rateMap.set(`${row.room_type}|${rateVariantKey(row, { billing_unit: DEFAULT_ROOM_BILLING_UNIT })}|${row.item}|${row.season}`, Number(row.rate));
  }

  const dormGroup = await getDormRateGroup();

  const roomGroups = tiers.map((tier) => {
    const tierRows = rateRows.filter((row) => row.room_type === tier
      && matchesDefaultRateVariant(row, { billing_unit: DEFAULT_ROOM_BILLING_UNIT }));
    const variantMap = new Map();
    for (const row of tierRows) {
      const key = `${row.item}|${rateVariantKey(row, { billing_unit: DEFAULT_ROOM_BILLING_UNIT })}`;
      if (!variantMap.has(key)) {
        variantMap.set(key, {
          item: row.item,
          ...normalizeRateVariant(row, { billing_unit: DEFAULT_ROOM_BILLING_UNIT }),
        });
      }
    }

    if (!variantMap.size) {
      for (const item of collectRoomRateItemsForTier(tier, rateRows)) {
        const key = `${item}|${rateVariantKey({}, { billing_unit: DEFAULT_ROOM_BILLING_UNIT })}`;
        variantMap.set(key, {
          item,
          audience: DEFAULT_RATE_AUDIENCE,
          age_band: DEFAULT_RATE_AGE_BAND,
          currency: DEFAULT_RATE_CURRENCY,
          billing_unit: DEFAULT_ROOM_BILLING_UNIT,
          notes: null,
        });
      }
    }

    const items = [...variantMap.values()];
    return {
      room_type: tier,
      label: roomRateTierLabel(tier),
      icon: ROOM_RATE_TIER_ICONS[tier] || 'meeting_room',
      custom: !ROOM_RATE_BASE_TIERS.includes(tier),
      items: items.map((item) => ({
        item: item.item,
        audience: item.audience,
        age_band: item.age_band,
        currency: item.currency,
        billing_unit: item.billing_unit,
        notes: item.notes,
        cells: ROOM_RATE_SEASONS.map((season) => {
          const rate = rateMap.get(`${tier}|${rateVariantKey(item, { billing_unit: DEFAULT_ROOM_BILLING_UNIT })}|${item.item}|${season}`);
          return { season, rate: rate != null ? rate : null };
        }),
      })),
    };
  });

  return [dormGroup, ...roomGroups];
}

export async function getMealRatesMap() {
  try {
    const rows = await fetchMealRateRows();
    const rates = { ...DEFAULT_MEAL_RATES };
    rows.forEach((r) => {
      const match = pickBookingRateRow([r], { billing_unit: DEFAULT_MEAL_BILLING_UNIT });
      if (!match) return;
      const type = r.item || r.meal_type;
      rates[type] = Number(match.rate);
    });
    return rates;
  } catch {
    return { ...DEFAULT_MEAL_RATES };
  }
}
