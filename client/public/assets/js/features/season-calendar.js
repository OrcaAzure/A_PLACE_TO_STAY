/**
 * Client-side lodging season resolution (mirrors server season.service.js).
 */

const SEASON_PRIORITY = ['Super Peak', 'Peak', 'Regular'];

const DEFAULT_WEEKEND_RULE = {
  enabled: false,
  days: [5, 6, 0],
  season: 'Peak',
};

function monthDayValue(month, day) {
  return Number(month) * 100 + Number(day);
}

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

function normalizeWeekendRule(raw) {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_WEEKEND_RULE, days: [...DEFAULT_WEEKEND_RULE.days] };
  }
  const days = Array.isArray(raw.days)
    ? [...new Set(raw.days.map((d) => Math.round(Number(d))).filter((d) => d >= 0 && d <= 6))]
    : [...DEFAULT_WEEKEND_RULE.days];
  return {
    enabled: Boolean(raw.enabled),
    days: days.length ? days : [...DEFAULT_WEEKEND_RULE.days],
    season: ['Peak', 'Super Peak', 'Regular'].includes(raw.season) ? raw.season : 'Peak',
  };
}

function normalizePeriodList(periods) {
  if (!Array.isArray(periods)) return [];
  return periods
    .filter((p) => p && p.season !== 'Regular')
    .map((p) => ({
      season: p.season,
      start_month: Number(p.start_month) || 1,
      start_day: Number(p.start_day) || 1,
      end_month: Number(p.end_month) || 12,
      end_day: Number(p.end_day) || 31,
    }));
}

export function normalizeSeasonCalendar(raw = {}) {
  return {
    season_periods: normalizePeriodList(raw.season_periods || raw.seasonPeriods || raw.periods || []),
    weekend_rule: normalizeWeekendRule(raw.weekend_rule || raw.weekendRule),
  };
}

function dayOfWeekISO(dateStr) {
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

/** Resolve lodging season for one date. */
export function resolveLodgingSeason(dateStr, calendar = {}) {
  const { season_periods: periods, weekend_rule: weekendRule } = normalizeSeasonCalendar(calendar);

  for (const season of SEASON_PRIORITY) {
    const match = periods.find((p) => p.season === season && dateInSeasonPeriod(dateStr, p));
    if (match) return season;
  }

  if (weekendRule.enabled && weekendRule.days.includes(dayOfWeekISO(dateStr))) {
    return weekendRule.season;
  }

  return 'Regular';
}

/** Map of ISO date → season for a list of date strings. */
export function buildSeasonMap(dates, calendar = {}) {
  const map = new Map();
  for (const iso of dates) {
    map.set(iso, resolveLodgingSeason(iso, calendar));
  }
  return map;
}

export function seasonSlug(season) {
  if (season === 'Super Peak') return 'super';
  if (season === 'Peak') return 'peak';
  return 'regular';
}

export function seasonShortLabel(season) {
  if (season === 'Super Peak') return 'Super';
  return season || 'Regular';
}
