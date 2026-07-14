import { pool } from '../../config/db.js';
import { columnExists } from '../helpers.js';

/** Extract Food/Laundry/etc. from facilities into rates_meals / rates_extra_services. */
export async function runRatesAncillaryExtract() {
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS rates_meals (
       id         INT AUTO_INCREMENT PRIMARY KEY,
       meal_type  ENUM('Breakfast', 'Lunch', 'Dinner', 'Snack') NOT NULL,
       rate       DECIMAL(10,2) NOT NULL,
       UNIQUE KEY uq_meal_type (meal_type),
       CONSTRAINT chk_meal_rate CHECK (rate > 0),
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
     )`
  );
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS rates_extra_services (
       id       INT AUTO_INCREMENT PRIMARY KEY,
       category VARCHAR(50)  NOT NULL,
       item     VARCHAR(100) NOT NULL,
       season   ENUM('Regular', 'Peak', 'Super Peak', 'N/A') NOT NULL DEFAULT 'N/A',
       rate     DECIMAL(10,2) NOT NULL,
       UNIQUE KEY uq_extra_service (category, item, season),
       CONSTRAINT chk_extra_service_rate CHECK (rate > 0),
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
     )`
  );

  if (await columnExists('facilities', 'season')) {
    await pool.execute(
      `INSERT INTO rates_meals (meal_type, rate)
       SELECT item, rate FROM facilities
       WHERE category = 'Food Service' AND season = 'N/A'
       ON DUPLICATE KEY UPDATE rate = VALUES(rate)`
    );

    await pool.execute(
      `INSERT INTO rates_extra_services (category, item, season, rate)
       SELECT category, item, 'N/A', rate FROM facilities
       WHERE category IN ('Laundry', 'Laundry-Iron', 'Corkage Fee', 'Maid Service', 'Accommodation Extras')
       ON DUPLICATE KEY UPDATE rate = VALUES(rate)`
    );

    await pool.execute(
      `DELETE FROM facilities
       WHERE category IN (
         'Food Service', 'Laundry', 'Laundry-Iron',
         'Corkage Fee', 'Maid Service', 'Accommodation Extras'
       )`
    );
  }
}
