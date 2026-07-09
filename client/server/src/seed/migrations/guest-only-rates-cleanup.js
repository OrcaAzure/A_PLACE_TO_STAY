import { pool } from '../../config/db.js';
import { tableExists } from '../helpers.js';
import { ACCOMMODATION_EXTRAS_CATEGORY } from '../../constants/ancillary.js';

const GUEST = 'Guest';
const ADULT = 'Adult';
const PHP = 'PHP';

async function deleteNonGuestRows(table) {
  if (!(await tableExists(table))) return 0;
  const [result] = await pool.execute(
    `DELETE FROM ${table}
     WHERE audience <> ? OR age_band <> ? OR currency <> ?`,
    [GUEST, ADULT, PHP]
  );
  return result.affectedRows || 0;
}

async function dedupeGuestRows(table, joinOn) {
  if (!(await tableExists(table))) return 0;
  const [result] = await pool.execute(
    `DELETE t1 FROM ${table} t1
     INNER JOIN ${table} t2
       ON ${joinOn}
      AND t1.id > t2.id`
  );
  return result.affectedRows || 0;
}

/**
 * Remove Category 1/2 (and other non-Guest) rate rows left from multi-tier pricing.
 * Normalize billing units and dedupe identical guest rows (e.g. duplicate Accommodation Extras).
 */
export async function runGuestOnlyRateCleanup() {
  try {
    const removedMeals = await deleteNonGuestRows('rates_meals');
    const removedExtras = await deleteNonGuestRows('rates_extra_services');
    const removedRooms = await deleteNonGuestRows('rates_rooms');
    const removedFacilities = await deleteNonGuestRows('rates_facilities');

    const totalRemoved = removedMeals + removedExtras + removedRooms + removedFacilities;
    if (totalRemoved > 0) {
      console.log(`[schema] Removed ${totalRemoved} non-guest pricing tier rows`);
    }

    if (await tableExists('rates_meals')) {
      await pool.execute(`DELETE FROM rates_meals WHERE billing_unit <> 'per meal'`);
    }
    if (await tableExists('rates_rooms')) {
      await pool.execute(`DELETE FROM rates_rooms WHERE billing_unit <> 'per night'`);
    }
    if (await tableExists('rates_facilities')) {
      await pool.execute(`DELETE FROM rates_facilities WHERE billing_unit <> 'per segment'`);
    }
    if (await tableExists('rates_extra_services')) {
      await pool.execute(
        `DELETE FROM rates_extra_services
         WHERE (category = ? AND billing_unit <> 'per night')
            OR (category <> ? AND billing_unit <> 'per item')`,
        [ACCOMMODATION_EXTRAS_CATEGORY, ACCOMMODATION_EXTRAS_CATEGORY]
      );
    }

    const dedupedMeals = await dedupeGuestRows(
      'rates_meals',
      `t1.meal_type = t2.meal_type
       AND t1.audience = t2.audience AND t1.age_band = t2.age_band
       AND t1.currency = t2.currency AND t1.billing_unit = t2.billing_unit`
    );
    const dedupedExtras = await dedupeGuestRows(
      'rates_extra_services',
      `t1.category = t2.category AND t1.item = t2.item AND t1.season = t2.season
       AND t1.audience = t2.audience AND t1.age_band = t2.age_band
       AND t1.currency = t2.currency AND t1.billing_unit = t2.billing_unit`
    );
    const dedupedRooms = await dedupeGuestRows(
      'rates_rooms',
      `t1.room_type = t2.room_type AND t1.item = t2.item AND t1.season = t2.season
       AND t1.audience = t2.audience AND t1.age_band = t2.age_band
       AND t1.currency = t2.currency AND t1.billing_unit = t2.billing_unit`
    );
    const dedupedFacilities = await dedupeGuestRows(
      'rates_facilities',
      `t1.facility_id = t2.facility_id AND t1.season = t2.season
       AND t1.audience = t2.audience AND t1.age_band = t2.age_band
       AND t1.currency = t2.currency AND t1.billing_unit = t2.billing_unit`
    );

    const totalDeduped = dedupedMeals + dedupedExtras + dedupedRooms + dedupedFacilities;
    if (totalDeduped > 0) {
      console.log(`[schema] Removed ${totalDeduped} duplicate guest rate rows`);
    }

    console.log('[schema] Guest-only rate catalog cleanup complete');
  } catch (err) {
    console.warn('[schema] guest-only rate cleanup skipped:', err.message);
  }
}
