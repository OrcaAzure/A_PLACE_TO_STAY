import { pool } from '../../config/db.js';
import { tableExists, columnExists } from '../helpers.js';

/**
 * Per-day meal rows on bookings_meals (meal_date + day unique key).
 * Legacy flat totals are backfilled onto the stay check-in date.
 */
export async function runBookingsMealsPerDayMigration() {
  if (!(await tableExists('bookings_meals'))) return;

  try {
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
      return;
    }

    try {
      await pool.execute('ALTER TABLE bookings_meals DROP INDEX uq_bookings_meals');
    } catch { /* already gone */ }
    try {
      await pool.execute(
        `ALTER TABLE bookings_meals
         ADD UNIQUE KEY uq_bookings_meals_day (bookings_room_id, meal_type, meal_date)`
      );
    } catch { /* already exists or length issue */ }
  } catch (err) {
    console.warn('[schema] bookings_meals meal_date migration skipped:', err.message);
  }
}
