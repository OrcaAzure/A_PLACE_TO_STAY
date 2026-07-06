import { pool } from '../config/db.js';

export const LODGING_SEASONS = ['Regular', 'Peak', 'Super Peak'];

export const DEFAULT_ACTIVE_LODGING_SEASON = 'Regular';

const PERIODS_SETTING_KEY = 'lodging_season_periods';
const WEEKEND_RULE_SETTING_KEY = 'lodging_season_weekend_rule';
const OVERRIDES_SETTING_KEY = 'lodging_season_overrides';
const LEGACY_SETTING_KEY = 'active_lodging_season';

export const DEFAULT_WEEKEND_RULE = {
  enabled: false,
  days: [5, 6, 0],
  season: 'Peak',
};

const VALID_WEEKEND_DAYS = new Set([0, 1, 2, 3, 4, 5, 6]);

/** Sample Housing schedule — used only when migrating old 3-card baseline installs. */
export const LEGACY_BASELINE_PERIODS = [
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

function periodKey(period) {
  return [
    period.season,
    period.start_month,
    period.start_day,
    period.end_month,
    period.end_day,
  ].join(':');
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
  const label = String(raw?.label || '').trim().slice(0, 120);
  return label
    ? { season, start_month, start_day, end_month, end_day, label }
    : { season, start_month, start_day, end_month, end_day };
}

/** Flexible list of recurring date ranges. Empty list = all Regular. */
export function normalizeSeasonPeriodList(periods) {
  if (!Array.isArray(periods)) return [];

  const seen = new Set();
  const list = [];
  for (const raw of periods) {
    const p = normalizeSeasonPeriod(raw);
    if (p.season === 'Regular') continue;
    const key = periodKey(p);
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(p);
  }

  return list.sort((a, b) => {
    const av = monthDayValue(a.start_month, a.start_day);
    const bv = monthDayValue(b.start_month, b.start_day);
    return av - bv;
  });
}

export function normalizeWeekendRule(raw) {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_WEEKEND_RULE, days: [...DEFAULT_WEEKEND_RULE.days] };
  }

  const days = Array.isArray(raw.days)
    ? [...new Set(raw.days.map((d) => Math.round(Number(d))).filter((d) => VALID_WEEKEND_DAYS.has(d)))]
    : [...DEFAULT_WEEKEND_RULE.days];

  return {
    enabled: Boolean(raw.enabled),
    days: days.length ? days : [...DEFAULT_WEEKEND_RULE.days],
    season: normalizeLodgingSeason(raw.season || DEFAULT_WEEKEND_RULE.season),
  };
}

function normalizeCalendarInput(calendarOrPeriods = null) {
  if (Array.isArray(calendarOrPeriods)) {
    return {
      periods: normalizeSeasonPeriodList(calendarOrPeriods),
      weekend_rule: { ...DEFAULT_WEEKEND_RULE, days: [...DEFAULT_WEEKEND_RULE.days] },
    };
  }

  if (calendarOrPeriods?.baseline || calendarOrPeriods?.overrides) {
    return {
      periods: dedupePeriodLists(
        calendarOrPeriods.baseline || calendarOrPeriods.season_periods || [],
        calendarOrPeriods.overrides || [],
      ),
      weekend_rule: normalizeWeekendRule(calendarOrPeriods.weekend_rule),
    };
  }

  return {
    periods: normalizeSeasonPeriodList(
      calendarOrPeriods?.periods ?? calendarOrPeriods?.season_periods ?? calendarOrPeriods,
    ),
    weekend_rule: normalizeWeekendRule(calendarOrPeriods?.weekend_rule),
  };
}

function dayOfWeekISO(dateStr) {
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

function isLegacyThreeSeasonBaseline(periods) {
  if (!Array.isArray(periods) || periods.length !== 3) return false;
  const seasons = new Set(periods.map((p) => normalizeLodgingSeason(p?.season)));
  return seasons.size === 3
    && seasons.has('Regular')
    && seasons.has('Peak')
    && seasons.has('Super Peak');
}

function dedupePeriodLists(...lists) {
  return normalizeSeasonPeriodList(lists.flat());
}

async function readSetting(key) {
  const [rows] = await pool.query(
    'SELECT setting_value FROM system_settings WHERE setting_key = ? LIMIT 1',
    [key]
  );
  return rows[0]?.setting_value ?? null;
}

async function persistSeasonPeriodList(periods) {
  const normalized = normalizeSeasonPeriodList(periods);
  await pool.query(
    `INSERT INTO system_settings (setting_key, setting_value)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [PERIODS_SETTING_KEY, JSON.stringify(normalized)]
  );
  return normalized;
}

async function migrateLegacySeasonStorage() {
  let periods = [];
  let overrides = [];

  try {
    const raw = await readSetting(PERIODS_SETTING_KEY);
    if (raw) periods = JSON.parse(raw);
  } catch {
    periods = [];
  }

  try {
    const raw = await readSetting(OVERRIDES_SETTING_KEY);
    if (raw) overrides = JSON.parse(raw);
  } catch {
    overrides = [];
  }

  const normalizedPeriods = normalizeSeasonPeriodList(periods);
  let migrated = null;

  if (isLegacyThreeSeasonBaseline(periods)) {
    const fromBaseline = periods.filter((p) => normalizeLodgingSeason(p.season) !== 'Regular');
    migrated = dedupePeriodLists(fromBaseline, overrides);
  } else if (overrides.length) {
    migrated = dedupePeriodLists(normalizedPeriods, overrides);
  }

  const result = migrated ?? normalizedPeriods;

  if (migrated != null) {
    try {
      await persistSeasonPeriodList(migrated);
      await pool.query('DELETE FROM system_settings WHERE setting_key = ?', [OVERRIDES_SETTING_KEY]);
    } catch (err) {
      console.warn('[season] Could not persist merged season periods:', err.message);
    }
  }

  return result;
}

async function readSeasonPeriodsFromStorage() {
  try {
    const raw = await readSetting(PERIODS_SETTING_KEY);
    if (raw) return normalizeSeasonPeriodList(JSON.parse(raw));
  } catch {
    /* ignore */
  }
  return [];
}

export async function getWeekendRule() {
  try {
    const raw = await readSetting(WEEKEND_RULE_SETTING_KEY);
    if (raw) return normalizeWeekendRule(JSON.parse(raw));
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_WEEKEND_RULE, days: [...DEFAULT_WEEKEND_RULE.days] };
}

export async function setWeekendRule(rule) {
  const normalized = normalizeWeekendRule(rule);
  await pool.query(
    `INSERT INTO system_settings (setting_key, setting_value)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [WEEKEND_RULE_SETTING_KEY, JSON.stringify(normalized)]
  );
  return normalized;
}

export async function getSeasonPeriods() {
  try {
    return await migrateLegacySeasonStorage();
  } catch (err) {
    console.warn('[season] getSeasonPeriods migration failed:', err.message);
    return readSeasonPeriodsFromStorage();
  }
}

/** Full rate calendar: explicit periods + optional weekend rule. */
export async function getSeasonCalendar() {
  const [periods, weekend_rule] = await Promise.all([getSeasonPeriods(), getWeekendRule()]);
  return { periods, weekend_rule };
}

export async function setSeasonCalendar({ periods, weekend_rule } = {}) {
  const current = await getSeasonCalendar();
  return {
    periods: periods != null ? await setSeasonPeriods(periods) : current.periods,
    weekend_rule: weekend_rule != null ? await setWeekendRule(weekend_rule) : current.weekend_rule,
  };
}

export async function setSeasonPeriods(periods) {
  return persistSeasonPeriodList(periods);
}

/** Resolve lodging season: added period → weekend rule → Regular. */
export function resolveLodgingSeasonFromCalendar(dateStr, calendarOrPeriods = null) {
  const { periods, weekend_rule } = normalizeCalendarInput(calendarOrPeriods);

  for (const season of SEASON_PRIORITY) {
    const match = periods.find((p) => p.season === season && dateInSeasonPeriod(dateStr, p));
    if (match) return season;
  }

  if (weekend_rule.enabled && weekend_rule.days.includes(dayOfWeekISO(dateStr))) {
    return normalizeLodgingSeason(weekend_rule.season);
  }

  return DEFAULT_ACTIVE_LODGING_SEASON;
}

/** Resolve lodging season for a single calendar date (loads calendar from DB when omitted). */
export async function resolveLodgingSeasonForDate(dateStr, calendarOrPeriods = null) {
  if (calendarOrPeriods == null) {
    const calendar = await getSeasonCalendar();
    return resolveLodgingSeasonFromCalendar(dateStr, calendar);
  }

  return resolveLodgingSeasonFromCalendar(dateStr, calendarOrPeriods);
}

export function addDaysISO(dateStr, days) {
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

function calcNights(checkIn, checkOut) {
  return Math.max(0, Math.round((new Date(`${checkOut}T00:00:00`) - new Date(`${checkIn}T00:00:00`)) / 86400000));
}

/** Distinct seasons across each night of a stay. */
export async function resolveStaySeasons(checkIn, checkOut, calendarOrPeriods = null) {
  const calendar = calendarOrPeriods == null
    ? await getSeasonCalendar()
    : normalizeCalendarInput(calendarOrPeriods);

  const nights = calcNights(checkIn, checkOut);
  const used = new Set();
  for (let i = 0; i < nights; i += 1) {
    const nightDate = addDaysISO(checkIn, i);
    used.add(resolveLodgingSeasonFromCalendar(nightDate, calendar));
  }
  return [...used];
}

/** Per-night season breakdown for preview UI. */
export function previewStayNights(checkIn, checkOut, calendarOrPeriods = null) {
  const calendar = normalizeCalendarInput(calendarOrPeriods);
  const nights = calcNights(checkIn, checkOut);
  const rows = [];
  for (let i = 0; i < nights; i += 1) {
    const date = addDaysISO(checkIn, i);
    rows.push({
      date,
      season: resolveLodgingSeasonFromCalendar(date, calendar),
    });
  }
  return rows;
}

export function formatSeasonPeriodLabel(period) {
  const monthName = (m) => new Date(2000, m - 1, 1).toLocaleString('en-US', { month: 'short' });
  const start = `${monthName(period.start_month)} ${period.start_day}`;
  const end = `${monthName(period.end_month)} ${period.end_day}`;
  return `${start} – ${end}`;
}

export function describeSeasonPeriods(periods = [], weekendRule = null) {
  const list = normalizeSeasonPeriodList(periods);
  const parts = [];
  const rule = weekendRule ? normalizeWeekendRule(weekendRule) : null;

  if (rule?.enabled) {
    const dayLabels = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' };
    const days = rule.days.map((d) => dayLabels[d] || d).join(', ');
    parts.push(`Weekends (${days}) → ${rule.season}`);
  }

  if (!list.length && !parts.length) return 'All dates use Regular rates';
  if (!list.length) return parts.join(' · ');

  parts.push(...list.map((p) => `${p.season}: ${formatSeasonPeriodLabel(p)}${p.label ? ` (${p.label})` : ''}`));
  return parts.join(' · ');
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

// Back-compat exports used during transition
export const DEFAULT_SEASON_PERIODS = LEGACY_BASELINE_PERIODS;
export function normalizeSeasonPeriods(periods) {
  return normalizeSeasonPeriodList(periods);
}
export function normalizeSeasonCalendar(raw) {
  return normalizeCalendarInput(raw);
}
export function describeSeasonCalendar(calendarOrPeriods = null) {
  const calendar = normalizeCalendarInput(calendarOrPeriods);
  return describeSeasonPeriods(calendar.periods, calendar.weekend_rule);
}
