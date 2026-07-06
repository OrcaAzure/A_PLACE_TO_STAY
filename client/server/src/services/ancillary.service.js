import { pool } from '../config/db.js';
import {
  DEFAULT_MEAL_RATES,
  MEAL_ICONS,
  MEAL_TYPES,
  SERVICE_ICONS,
  ACCOMMODATION_EXTRAS_CATEGORY,
  PER_PERSON_NIGHT_ITEM,
} from '../constants/ancillary.js';
import {
  ROOM_RATE_BASE_TIERS,
  ROOM_RATE_ITEMS,
  ROOM_RATE_SEASONS,
  ROOM_RATE_TIER_ICONS,
  NON_RATE_ROOM_TYPES,
  DERIVED_RATE_ROOM_TYPES,
  roomRateTierLabel,
} from '../constants/rooms.js';

export async function fetchMealRateRows() {
  const [rows] = await pool.query(
    `SELECT id, meal_type AS item, rate
     FROM rates_meals
     ORDER BY FIELD(meal_type, 'Breakfast', 'Lunch', 'Dinner', 'Snack')`
  );
  return rows;
}

export async function fetchExtraServiceRows() {
  const [rows] = await pool.query(
    `SELECT id, category, item, season, rate
     FROM rates_extra_services
     ORDER BY category ASC, item ASC, FIELD(season, 'Regular', 'Peak', 'Super Peak', 'N/A')`
  );
  return rows;
}

export function groupMealRows(rows) {
  const byItem = new Map();

  for (const row of rows) {
    const item = row.item || row.meal_type;
    if (!byItem.has(item)) {
      byItem.set(item, {
        id: row.id,
        item,
        icon: MEAL_ICONS[item] || 'restaurant',
        rate: Number(row.rate),
      });
    }
  }

  return MEAL_TYPES.filter((name) => byItem.has(name)).map((name) => byItem.get(name));
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
    byCategory.get(row.category).items.push({
      id: row.id,
      item: row.item,
      season: row.season || 'N/A',
      rate: Number(row.rate),
    });
  }

  return [...byCategory.values()];
}

function feeKey(name, amount) {
  return `${String(name || '').trim()}|${Number(amount)}`;
}

/** Guests may only keep existing fees or add catalog-listed extras (not arbitrary amounts). */
export function sanitizeGuestSubmittedFees(submitted = [], catalogRows = [], originalFees = []) {
  const catalogKeys = new Set(
    (catalogRows || []).map((row) => feeKey(row.item, row.rate))
  );
  const originalKeys = new Set(
    (originalFees || []).map((f) => feeKey(f.fee_name || f.service_name, f.amount))
  );
  return (submitted || []).filter((f) => {
    const key = feeKey(f.fee_name || f.service_name || f.name, f.amount);
    return catalogKeys.has(key) || originalKeys.has(key);
  });
}

export async function fetchRoomRateRows() {
  const [rows] = await pool.query(
    `SELECT id, room_type, item, season, rate FROM rates_rooms`
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
    'SELECT season, rate FROM rates_extra_services WHERE category = ? AND item = ?',
    [ACCOMMODATION_EXTRAS_CATEGORY, PER_PERSON_NIGHT_ITEM]
  );
  const bySeason = new Map(rows.map((r) => [r.season, Number(r.rate)]));
  return {
    room_type: 'Dorm',
    label: 'Dorm (per person / night)',
    icon: 'night_shelter',
    custom: false,
    items: [
      {
        item: PER_PERSON_NIGHT_ITEM,
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
    rateMap.set(`${row.room_type}|${row.item}|${row.season}`, Number(row.rate));
  }

  const dormGroup = await getDormRateGroup();

  const roomGroups = tiers.map((tier) => ({
    room_type: tier,
    label: roomRateTierLabel(tier),
    icon: ROOM_RATE_TIER_ICONS[tier] || 'meeting_room',
    custom: !ROOM_RATE_BASE_TIERS.includes(tier),
    items: ROOM_RATE_ITEMS.map((item) => ({
      item,
      cells: ROOM_RATE_SEASONS.map((season) => {
        const rate = rateMap.get(`${tier}|${item}|${season}`);
        return { season, rate: rate != null ? rate : null };
      }),
    })),
  }));

  return [dormGroup, ...roomGroups];
}

export async function getMealRatesMap() {
  try {
    const rows = await fetchMealRateRows();
    const rates = { ...DEFAULT_MEAL_RATES };
    rows.forEach((r) => {
      const type = r.item || r.meal_type;
      rates[type] = Number(r.rate);
    });
    return rates;
  } catch {
    return { ...DEFAULT_MEAL_RATES };
  }
}
