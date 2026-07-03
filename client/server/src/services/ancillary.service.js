import { pool } from '../config/db.js';
import {
  DEFAULT_MEAL_RATES,
  MEAL_ICONS,
  MEAL_TYPES,
  SERVICE_ICONS,
} from '../constants/ancillary.js';

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
