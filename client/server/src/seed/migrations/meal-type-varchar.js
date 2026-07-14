import { pool } from '../../config/db.js';
import { tableExists } from '../helpers.js';

/** Ensure Snack is present on meal_type ENUM (before VARCHAR widen). */
export async function runBookingsMealsSnackEnum() {
  try {
    await pool.execute(
      `ALTER TABLE bookings_meals
       MODIFY meal_type ENUM('Breakfast', 'Lunch', 'Dinner', 'Snack') NOT NULL`
    );
  } catch {
    await pool.execute(
      `ALTER TABLE booking_meals
       MODIFY meal_type ENUM('Breakfast', 'Lunch', 'Dinner', 'Snack') NOT NULL`
    );
  }
}

/** Allow custom meal types beyond the original Breakfast/Lunch/Dinner/Snack enum. */
export async function runMealTypeVarcharMigration() {
  if (!(await tableExists('rates_meals'))) return;

  try {
    await pool.execute('ALTER TABLE rates_meals MODIFY meal_type VARCHAR(100) NOT NULL');
    console.log('[schema] rates_meals.meal_type is VARCHAR(100) — custom meal types allowed');
  } catch (err) {
    console.warn('[schema] rates_meals.meal_type varchar migration skipped:', err.message);
  }

  for (const table of ['bookings_meals', 'booking_meals']) {
    if (!(await tableExists(table))) continue;
    try {
      await pool.execute(`ALTER TABLE ${table} MODIFY meal_type VARCHAR(100) NOT NULL`);
      console.log(`[schema] ${table}.meal_type is VARCHAR(100)`);
    } catch (err) {
      console.warn(`[schema] ${table}.meal_type varchar migration skipped:`, err.message);
    }
  }
}
