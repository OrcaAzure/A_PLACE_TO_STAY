import { pool } from '../../config/db.js';
import { FISCAL_YEAR_DEFAULTS } from '../../utils/constants.js';

/** Bootstrap system_settings + fiscal year defaults. */
export async function runSystemSettingsBootstrap() {
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS system_settings (
       setting_key   VARCHAR(64) PRIMARY KEY,
       setting_value TEXT NOT NULL,
       updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
     )`
  );
  try {
    await pool.execute(
      `ALTER TABLE system_settings MODIFY setting_value TEXT NOT NULL`
    );
  } catch (err) {
    console.warn('[schema] system_settings.setting_value TEXT patch skipped:', err.message);
  }
  for (const [key, value] of Object.entries(FISCAL_YEAR_DEFAULTS)) {
    await pool.execute(
      `INSERT INTO system_settings (setting_key, setting_value)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE setting_key = setting_key`,
      [key, String(value)]
    );
  }
}

/** Migrate guest_cancellation_cutoff_days → guest_cancellation_cutoff_hours. */
export async function runGuestCancellationCutoffHours() {
  const [hourRows] = await pool.query(
    `SELECT setting_value FROM system_settings WHERE setting_key = 'guest_cancellation_cutoff_hours' LIMIT 1`
  );
  if (!hourRows.length) {
    const [dayRows] = await pool.query(
      `SELECT setting_value FROM system_settings WHERE setting_key = 'guest_cancellation_cutoff_days' LIMIT 1`
    );
    const legacyDays = dayRows.length ? Number(dayRows[0].setting_value) : 1;
    const hours = Number.isFinite(legacyDays) ? legacyDays * 24 : 24;
    await pool.execute(
      `INSERT INTO system_settings (setting_key, setting_value)
       VALUES ('guest_cancellation_cutoff_hours', ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [String(hours)]
    );
  }
}
