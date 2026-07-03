import { pool } from '../config/db.js';
import {
  ACCOMMODATION_EXTRAS_CATEGORY,
  LODGING_EXTRA_ITEM,
  PER_PERSON_NIGHT_ITEM,
  DEFAULT_ACCOMMODATION_SEASONAL_RATES,
} from '../constants/ancillary.js';

/** Seasonal accommodation extra rate (dorm per-person, extra bed/person, etc.). */
export async function getAccommodationExtraRate(season, item) {
  const [rows] = await pool.query(
    `SELECT rate FROM rates_extra_services
     WHERE category = ? AND item = ? AND season = ?
     LIMIT 1`,
    [ACCOMMODATION_EXTRAS_CATEGORY, item, season]
  );
  return rows.length ? Number(rows[0].rate) : null;
}

/** @deprecated alias */
export async function getLodgingExtraRate(season, item = LODGING_EXTRA_ITEM) {
  return getAccommodationExtraRate(season, item);
}

export {
  LODGING_EXTRA_ITEM,
  PER_PERSON_NIGHT_ITEM,
  DEFAULT_ACCOMMODATION_SEASONAL_RATES,
  DEFAULT_ACCOMMODATION_SEASONAL_RATES as DEFAULT_LODGING_EXTRA_RATES,
  ACCOMMODATION_EXTRAS_CATEGORY,
};
