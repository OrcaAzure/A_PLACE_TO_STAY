import { pool } from '../../config/db.js';
import { tableExists, columnExists } from '../helpers.js';

/**
 * Schema changes for the AptSpace bug-fix pass (Jul 2026).
 * - Per-day meal rows (meal_date on bookings_meals)
 * - Dedicated booking_ref columns (stop stuffing refs into notes)
 * - is_group_stay flag on reservation_groups
 * - Prayer Mountain 4-hour minimum
 *
 * Each section is independent so a failure (e.g. unique-key length) does not
 * skip later columns that API inserts depend on.
 */
export async function runBugFixPassJul2026Migration() {
  // --- bookings_meals: per-day meal selections ---
  try {
    if (await tableExists('bookings_meals')) {
      if (!(await columnExists('bookings_meals', 'meal_date'))) {
        await pool.execute(
          `ALTER TABLE bookings_meals
           ADD COLUMN meal_date DATE DEFAULT NULL AFTER bookings_room_id`
        );
        await pool.execute(
          `UPDATE bookings_meals bm
           JOIN bookings_rooms br ON br.id = bm.bookings_room_id
           SET bm.meal_date = br.check_in
           WHERE bm.meal_date IS NULL`
        );
        // Orphan rows with no parent stay date — remove so NOT NULL can apply
        await pool.execute('DELETE FROM bookings_meals WHERE meal_date IS NULL');
        await pool.execute(
          `ALTER TABLE bookings_meals
           MODIFY meal_date DATE NOT NULL`
        );
        try {
          await pool.execute('ALTER TABLE bookings_meals DROP INDEX uq_bookings_meals');
        } catch { /* may not exist */ }
        try {
          await pool.execute(
            `ALTER TABLE bookings_meals
             ADD UNIQUE KEY uq_bookings_meals_day (bookings_room_id, meal_type, meal_date)`
          );
        } catch (err) {
          // VARCHAR(100) meal_type can exceed index length on some MySQL configs —
          // fall back to a prefixed unique key.
          console.warn('[schema] bookings_meals day unique (full) skipped:', err.message);
          try {
            await pool.execute(
              `ALTER TABLE bookings_meals
               ADD UNIQUE KEY uq_bookings_meals_day (bookings_room_id, meal_type(64), meal_date)`
            );
          } catch (err2) {
            console.warn('[schema] bookings_meals day unique (prefix) skipped:', err2.message);
          }
        }
        console.log('[schema] bookings_meals.meal_date added (per-day meals)');
      } else {
        // Column already present from a partial prior run — still ensure unique key
        try {
          await pool.execute('ALTER TABLE bookings_meals DROP INDEX uq_bookings_meals');
        } catch { /* already gone */ }
        try {
          await pool.execute(
            `ALTER TABLE bookings_meals
             ADD UNIQUE KEY uq_bookings_meals_day (bookings_room_id, meal_type, meal_date)`
          );
        } catch { /* already exists or length issue */ }
      }
    }
  } catch (err) {
    console.warn('[schema] bookings_meals meal_date migration skipped:', err.message);
  }

  // --- booking_ref on room bookings ---
  try {
    if (await tableExists('bookings_rooms') && !(await columnExists('bookings_rooms', 'booking_ref'))) {
      await pool.execute(
        `ALTER TABLE bookings_rooms
         ADD COLUMN booking_ref VARCHAR(40) DEFAULT NULL AFTER notes`
      );
      console.log('[schema] bookings_rooms.booking_ref added');
    }
  } catch (err) {
    console.warn('[schema] bookings_rooms.booking_ref skipped:', err.message);
  }

  // --- booking_ref + is_group_stay on reservation_groups ---
  try {
    if (await tableExists('reservation_groups')) {
      if (!(await columnExists('reservation_groups', 'booking_ref'))) {
        await pool.execute(
          `ALTER TABLE reservation_groups
           ADD COLUMN booking_ref VARCHAR(40) DEFAULT NULL AFTER notes`
        );
        console.log('[schema] reservation_groups.booking_ref added');
      }
      if (!(await columnExists('reservation_groups', 'is_group_stay'))) {
        await pool.execute(
          `ALTER TABLE reservation_groups
           ADD COLUMN is_group_stay TINYINT(1) NOT NULL DEFAULT 1 AFTER rooms_requested`
        );
        console.log('[schema] reservation_groups.is_group_stay added');
      }
    }
  } catch (err) {
    console.warn('[schema] reservation_groups columns skipped:', err.message);
  }

  // --- booking_ref on facility bookings ---
  try {
    if (await tableExists('bookings_facilities') && !(await columnExists('bookings_facilities', 'booking_ref'))) {
      await pool.execute(
        `ALTER TABLE bookings_facilities
         ADD COLUMN booking_ref VARCHAR(40) DEFAULT NULL AFTER notes`
      );
      console.log('[schema] bookings_facilities.booking_ref added');
    }
  } catch (err) {
    console.warn('[schema] bookings_facilities.booking_ref skipped:', err.message);
  }

  // --- Prayer Mountain: 4-hour booking floor, still billed hourly ---
  // Catalog rate stays ₱/hr. Set hourly_rate = rate so computeVenueTotal does
  // NOT treat this as a flat package (GMC Chapel / Burdine style).
  try {
    if (await tableExists('facilities') && (await columnExists('facilities', 'min_hours'))) {
      const hasHourly = await columnExists('facilities', 'hourly_rate');
      const [result] = await pool.execute(
        hasHourly
          ? `UPDATE facilities f
             LEFT JOIN rates_facilities rf
               ON rf.facility_id = f.id AND rf.season = 'Regular'
             SET f.min_hours = 4,
                 f.hourly_rate = COALESCE(f.hourly_rate, rf.rate)
             WHERE f.facility_group = 'Prayer Mountain'`
          : `UPDATE facilities
             SET min_hours = 4
             WHERE facility_group = 'Prayer Mountain'
               AND (min_hours IS NULL OR min_hours <> 4)`
      );
      if (result.affectedRows > 0) {
        console.log(`[schema] Prayer Mountain 4-hr minimum (hourly billing) (${result.affectedRows} row(s))`);
      }
    }
  } catch (err) {
    console.warn('[schema] Prayer Mountain min_hours skipped:', err.message);
  }
}
