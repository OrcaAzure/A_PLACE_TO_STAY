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
import {
  resolveLodgingSeasonForDate,
  addDaysISO,
} from './season.service.js';

function calcNights(checkIn, checkOut) {
  const start = new Date(`${String(checkIn).slice(0, 10)}T12:00:00`);
  const end = new Date(`${String(checkOut).slice(0, 10)}T12:00:00`);
  const diff = Math.round((end - start) / 86400000);
  return diff > 0 ? diff : 0;
}

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

/** Sum nightly lodging-extra charges across a stay — each night uses its season. */
export async function calculateLodgingExtraTotalForStay({
  item,
  checkIn,
  checkOut,
  quantity = 1,
}) {
  const nights = calcNights(checkIn, checkOut);
  if (!nights) return null;
  const qty = Math.max(1, Number(quantity) || 1);
  let total = 0;
  for (let i = 0; i < nights; i += 1) {
    const nightDate = addDaysISO(checkIn, i);
    const season = await resolveLodgingSeasonForDate(nightDate);
    const rate = await getAccommodationExtraRate(season, item);
    if (rate == null) return null;
    total += rate * qty;
  }
  return Math.round(total * 100) / 100;
}

export {
  LODGING_EXTRA_ITEM,
  PER_PERSON_NIGHT_ITEM,
  DEFAULT_ACCOMMODATION_SEASONAL_RATES,
  ACCOMMODATION_EXTRAS_CATEGORY,
};
