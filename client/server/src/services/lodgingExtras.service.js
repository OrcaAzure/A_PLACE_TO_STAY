import { pool } from '../config/db.js';
import {
  ACCOMMODATION_EXTRAS_CATEGORY,
  LODGING_EXTRA_ITEM,
  PER_PERSON_NIGHT_ITEM,
  DEFAULT_ACCOMMODATION_SEASONAL_RATES,
} from '../constants/ancillary.js';
import {
  DEFAULT_EXTRA_BILLING_UNIT,
  pickBookingRateRow,
} from '../constants/rateVariants.js';

/** Seasonal accommodation extra rate (dorm per-person, extra bed/person, etc.). */
export async function getAccommodationExtraRate(season, item) {
  const [rows] = await pool.query(
    `SELECT rate, audience, age_band, currency, billing_unit, notes FROM rates_extra_services
     WHERE category = ? AND item = ? AND season = ?
     LIMIT 10`,
    [ACCOMMODATION_EXTRAS_CATEGORY, item, season]
  );
  const billing_unit = item === PER_PERSON_NIGHT_ITEM || item === LODGING_EXTRA_ITEM
    ? 'per night'
    : DEFAULT_EXTRA_BILLING_UNIT;
  const match = pickBookingRateRow(rows, { billing_unit });
  return match ? Number(match.rate) : null;
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
