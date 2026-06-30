import { pool } from '../config/db.js';

export const LODGING_SEASONS = ['Regular', 'Peak', 'Super Peak'];

export const DEFAULT_ACTIVE_LODGING_SEASON = 'Regular';

const SETTING_KEY = 'active_lodging_season';

export function normalizeLodgingSeason(value) {
  const season = String(value || '').trim();
  return LODGING_SEASONS.includes(season) ? season : DEFAULT_ACTIVE_LODGING_SEASON;
}

/** Admin-selected season for lodging and venue rate lookups (not calendar-based). */
export async function getActiveLodgingSeason() {
  try {
    const [rows] = await pool.query(
      'SELECT setting_value FROM system_settings WHERE setting_key = ? LIMIT 1',
      [SETTING_KEY]
    );
    return normalizeLodgingSeason(rows[0]?.setting_value);
  } catch {
    return DEFAULT_ACTIVE_LODGING_SEASON;
  }
}

export async function setActiveLodgingSeason(season) {
  const next = normalizeLodgingSeason(season);
  await pool.query(
    `INSERT INTO system_settings (setting_key, setting_value)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [SETTING_KEY, next]
  );
  return next;
}

/** Venue rates use Regular / Peak only — Super Peak maps to Peak. */
export function mapLodgingSeasonToFacilitySeason(season) {
  const normalized = normalizeLodgingSeason(season);
  if (normalized === 'Peak' || normalized === 'Super Peak') return 'Peak';
  return 'Regular';
}
