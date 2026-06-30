import { pool } from '../config/db.js';

export const LODGING_SEASONS = ['Regular', 'Peak', 'Super Peak'];

export const DEFAULT_ACTIVE_LODGING_SEASON = 'Regular';

const PERIODS_SETTING_KEY = 'lodging_season_periods';
const LEGACY_SETTING_KEY = 'active_lodging_season';

/** Default calendar windows (month/day, repeat every year). Jul–Jun fiscal alignment. */
export const DEFAULT_SEASON_PERIODS = [
  { season: 'Regular', start_month: 7, start_day: 1, end_month: 3, end_day: 31 },
  { season: 'Peak', start_month: 4, start_day: 1, end_month: 5, end_day: 31 },
  { season: 'Super Peak', start_month: 6, start_day: 1, end_month: 6, end_day: 30 },
];

const SEASON_PRIORITY = ['Super Peak', 'Peak', 'Regular'];

export function normalizeLodgingSeason(value) {
  const season = String(value || '').trim();
  return LODGING_SEASONS.includes(season) ? season : DEFAULT_ACTIVE_LODGING_SEASON;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function monthDayValue(month, day) {
  return Number(month) * 100 + Number(day);
}

/** True when calendar month/day falls inside a recurring period (handles year wrap). */
export function dateInSeasonPeriod(dateStr, period) {
  if (!dateStr || !period) return false;
  const parts = String(dateStr).slice(0, 10).split('-').map(Number);
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return false;

  const current = monthDayValue(parts[1], parts[2]);
  const start = monthDayValue(period.start_month, period.start_day);
  const end = monthDayValue(period.end_month, period.end_day);

  if (start <= end) return current >= start && current <= end;
  return current >= start || current <= end;
}

export function normalizeSeasonPeriod(raw) {
  const season = normalizeLodgingSeason(raw?.season);
  const start_month = Math.min(12, Math.max(1, Math.round(Number(raw?.start_month)) || 1));
  const end_month = Math.min(12, Math.max(1, Math.round(Number(raw?.end_month)) || 12));
  const start_day = Math.min(31, Math.max(1, Math.round(Number(raw?.start_day)) || 1));
  const end_day = Math.min(31, Math.max(1, Math.round(Number(raw?.end_day)) || 28));
  return { season, start_month, start_day, end_month, end_day };
}

export function normalizeSeasonPeriods(periods) {
  if (!Array.isArray(periods) || !periods.length) {
    return DEFAULT_SEASON_PERIODS.map((p) => ({ ...p }));
  }

  const bySeason = new Map();
  for (const raw of periods) {
    const p = normalizeSeasonPeriod(raw);
    bySeason.set(p.season, p);
  }

  return LODGING_SEASONS.map((season) => bySeason.get(season) || DEFAULT_SEASON_PERIODS.find((p) => p.season === season) || {
    season,
    start_month: 1,
    start_day: 1,
    end_month: 12,
    end_day: 31,
  });
}

async function readSetting(key) {
  const [rows] = await pool.query(
    'SELECT setting_value FROM system_settings WHERE setting_key = ? LIMIT 1',
    [key]
  );
  return rows[0]?.setting_value ?? null;
}

export async function getSeasonPeriods() {
  try {
    const raw = await readSetting(PERIODS_SETTING_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return normalizeSeasonPeriods(parsed);
    }
  } catch {
    /* fall through to legacy / defaults */
  }

  try {
    const legacy = await readSetting(LEGACY_SETTING_KEY);
    if (legacy) {
      return normalizeSeasonPeriods([{ season: normalizeLodgingSeason(legacy), start_month: 1, start_day: 1, end_month: 12, end_day: 31 }]);
    }
  } catch {
    /* ignore */
  }

  return DEFAULT_SEASON_PERIODS.map((p) => ({ ...p }));
}

export async function setSeasonPeriods(periods) {
  const normalized = normalizeSeasonPeriods(periods);
  await pool.query(
    `INSERT INTO system_settings (setting_key, setting_value)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [PERIODS_SETTING_KEY, JSON.stringify(normalized)]
  );
  return normalized;
}

/** Resolve lodging season for a single calendar date using configured periods. */
export async function resolveLodgingSeasonForDate(dateStr, periods = null) {
  const list = periods || (await getSeasonPeriods());
  for (const season of SEASON_PRIORITY) {
    const period = list.find((p) => p.season === season);
    if (period && dateInSeasonPeriod(dateStr, period)) return season;
  }
  return DEFAULT_ACTIVE_LODGING_SEASON;
}

export function addDaysISO(dateStr, days) {
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

/** Distinct seasons across each night of a stay. */
export async function resolveStaySeasons(checkIn, checkOut, periods = null) {
  const list = periods || (await getSeasonPeriods());
  const nights = Math.max(0, Math.round((new Date(`${checkOut}T00:00:00`) - new Date(`${checkIn}T00:00:00`)) / 86400000));
  const used = new Set();
  for (let i = 0; i < nights; i += 1) {
    const nightDate = addDaysISO(checkIn, i);
    used.add(await resolveLodgingSeasonForDate(nightDate, list));
  }
  return [...used];
}

export function formatSeasonPeriodLabel(period) {
  const monthName = (m) => new Date(2000, m - 1, 1).toLocaleString('en-US', { month: 'short' });
  const start = `${monthName(period.start_month)} ${period.start_day}`;
  const end = `${monthName(period.end_month)} ${period.end_day}`;
  return `${start} – ${end}`;
}

export function describeSeasonPeriods(periods = DEFAULT_SEASON_PERIODS) {
  return normalizeSeasonPeriods(periods)
    .map((p) => `${p.season}: ${formatSeasonPeriodLabel(p)}`)
    .join(' · ');
}

/** @deprecated alias — season for today (date-based). */
export async function getActiveLodgingSeason() {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  return resolveLodgingSeasonForDate(todayStr);
}

export async function setActiveLodgingSeason(season) {
  const next = normalizeLodgingSeason(season);
  await pool.query(
    `INSERT INTO system_settings (setting_key, setting_value)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [LEGACY_SETTING_KEY, next]
  );
  return next;
}

/** Venue rates use Regular / Peak only — Super Peak maps to Peak. */
export function mapLodgingSeasonToFacilitySeason(season) {
  const normalized = normalizeLodgingSeason(season);
  if (normalized === 'Peak' || normalized === 'Super Peak') return 'Peak';
  return 'Regular';
}
