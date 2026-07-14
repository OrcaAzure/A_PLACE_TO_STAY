import { pool } from '../../config/db.js';
import { tableExists, columnExists } from '../helpers.js';

/**
 * Schema changes for the AptSpace bug-fix pass (Jul 2026).
 * - Per-day meal rows (meal_date on bookings_meals)
 * - Dedicated booking_ref columns (stop stuffing refs into notes)
 * - is_group_stay flag on reservation_groups
 * - Prayer Mountain 4-hour minimum
 */
export async function runBugFixPassJul2026Migration() {
  // --- bookings_meals: per-day meal selections ---
  if (await tableExists('bookings_meals')) {
    if (!(await columnExists('bookings_meals', 'meal_date'))) {
      await pool.execute(
        `ALTER TABLE bookings_meals
         ADD COLUMN meal_date DATE DEFAULT NULL AFTER bookings_room_id`
      );
      // Backfill legacy flat totals onto the parent booking check-in date
      await pool.execute(
        `UPDATE bookings_meals bm
         JOIN bookings_rooms br ON br.id = bm.bookings_room_id
         SET bm.meal_date = br.check_in
         WHERE bm.meal_date IS NULL`
      );
      await pool.execute(
        `ALTER TABLE bookings_meals
         MODIFY meal_date DATE NOT NULL`
      );
      try {
        await pool.execute('ALTER TABLE bookings_meals DROP INDEX uq_bookings_meals');
      } catch { /* may not exist */ }
      await pool.execute(
        `ALTER TABLE bookings_meals
         ADD UNIQUE KEY uq_bookings_meals_day (bookings_room_id, meal_type, meal_date)`
      );
      console.log('[schema] bookings_meals.meal_date added (per-day meals)');
    }
  }

  // --- booking_ref on room bookings ---
  if (await tableExists('bookings_rooms') && !(await columnExists('bookings_rooms', 'booking_ref'))) {
    await pool.execute(
      `ALTER TABLE bookings_rooms
       ADD COLUMN booking_ref VARCHAR(40) DEFAULT NULL AFTER notes`
    );
    console.log('[schema] bookings_rooms.booking_ref added');
  }

  // --- booking_ref + is_group_stay on reservation_groups ---
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

  // --- booking_ref on facility bookings ---
  if (await tableExists('bookings_facilities') && !(await columnExists('bookings_facilities', 'booking_ref'))) {
    await pool.execute(
      `ALTER TABLE bookings_facilities
       ADD COLUMN booking_ref VARCHAR(40) DEFAULT NULL AFTER notes`
    );
    console.log('[schema] bookings_facilities.booking_ref added');
  }

  // --- Prayer Mountain: 4-hour minimum (scoped, does not overwrite admin edits) ---
  if (await tableExists('facilities') && (await columnExists('facilities', 'min_hours'))) {
    const [result] = await pool.execute(
      `UPDATE facilities
       SET min_hours = 4
       WHERE min_hours IS NULL
         AND facility_group = 'Prayer Mountain'`
    );
    if (result.affectedRows > 0) {
      console.log(`[schema] Prayer Mountain min_hours set to 4 (${result.affectedRows} row(s))`);
    }
  }
}
