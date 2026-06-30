import { pool } from '../config/db.js';
import { FISCAL_YEAR_DEFAULTS } from '../utils/constants.js';
import {
  LODGING_SEASONS,
  DEFAULT_SEASON_PERIODS,
  normalizeSeasonPeriods,
  setSeasonPeriods,
  getSeasonPeriods,
  resolveLodgingSeasonForDate,
  describeSeasonPeriods,
  formatSeasonPeriodLabel,
} from './season.service.js';

const SETTING_KEYS = [
  'fiscal_year_start_month',
  'fiscal_year_start_day',
  'booking_advance_months',
  'guest_cancellation_cutoff_days',
];

function pad(n) {
  return String(n).padStart(2, '0');
}

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addMonthsISO(dateStr, months) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1 + months, d);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

function addDaysISO(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

function formatDisplayDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function getFiscalYearForDate(dateStr, settings = FISCAL_YEAR_DEFAULTS) {
  const startMonth = Number(settings.fiscal_year_start_month);
  const startDay = Number(settings.fiscal_year_start_day);
  const [y, m, d] = dateStr.split('-').map(Number);
  const onOrAfterStart = m > startMonth || (m === startMonth && d >= startDay);
  const startYear = onOrAfterStart ? y : y - 1;
  const endYear = startYear + 1;
  const startDate = `${startYear}-${pad(startMonth)}-${pad(startDay)}`;
  const endDate = addDaysISO(`${endYear}-${pad(startMonth)}-${pad(startDay)}`, -1);

  return {
    label: `FY ${startYear}–${endYear}`,
    shortLabel: `FY ${String(endYear).slice(-2)}`,
    startDate,
    endDate,
    startYear,
    endYear,
  };
}

export function getBookingDateBounds(settings = FISCAL_YEAR_DEFAULTS, { bypassAdvanceLimit = false } = {}) {
  const today = todayISO();
  const currentFiscalYear = getFiscalYearForDate(today, settings);
  const advanceMonths = Number(settings.booking_advance_months) || FISCAL_YEAR_DEFAULTS.booking_advance_months;

  if (bypassAdvanceLimit) {
    return {
      minDate: today,
      maxCheckInDate: null,
      currentFiscalYear,
      bookingAdvanceMonths: advanceMonths,
      fiscalYearStartMonth: Number(settings.fiscal_year_start_month),
      fiscalYearStartDay: Number(settings.fiscal_year_start_day),
    };
  }

  const maxCheckInDate = addMonthsISO(today, advanceMonths);

  return {
    minDate: today,
    maxCheckInDate,
    currentFiscalYear,
    bookingAdvanceMonths: advanceMonths,
    fiscalYearStartMonth: Number(settings.fiscal_year_start_month),
    fiscalYearStartDay: Number(settings.fiscal_year_start_day),
  };
}

function readSettingInt(stored, key, fallback, min, max) {
  const raw = stored[key];
  if (raw == null || raw === '') return fallback;
  const n = Math.round(Number(raw));
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export async function getFiscalYearSettings() {
  try {
    const [rows] = await pool.query(
      'SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN (?, ?, ?, ?)',
      SETTING_KEYS
    );
    const stored = Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value]));
    const season_periods = await getSeasonPeriods();
    return {
      fiscal_year_start_month: readSettingInt(stored, 'fiscal_year_start_month', FISCAL_YEAR_DEFAULTS.fiscal_year_start_month, 1, 12),
      fiscal_year_start_day: readSettingInt(stored, 'fiscal_year_start_day', FISCAL_YEAR_DEFAULTS.fiscal_year_start_day, 1, 31),
      booking_advance_months: readSettingInt(stored, 'booking_advance_months', FISCAL_YEAR_DEFAULTS.booking_advance_months, 1, 36),
      guest_cancellation_cutoff_days: readSettingInt(stored, 'guest_cancellation_cutoff_days', FISCAL_YEAR_DEFAULTS.guest_cancellation_cutoff_days, 0, 90),
      season_periods,
    };
  } catch {
    return {
      ...FISCAL_YEAR_DEFAULTS,
      season_periods: DEFAULT_SEASON_PERIODS.map((p) => ({ ...p })),
    };
  }
}

export async function updateFiscalYearSettings(updates = {}) {
  const current = await getFiscalYearSettings();
  const next = {
    fiscal_year_start_month: clampInt(
      updates.fiscal_year_start_month ?? current.fiscal_year_start_month,
      1,
      12
    ),
    fiscal_year_start_day: clampInt(
      updates.fiscal_year_start_day ?? current.fiscal_year_start_day,
      1,
      31
    ),
    booking_advance_months: clampInt(
      updates.booking_advance_months ?? current.booking_advance_months,
      1,
      36
    ),
    guest_cancellation_cutoff_days: clampInt(
      updates.guest_cancellation_cutoff_days ?? current.guest_cancellation_cutoff_days,
      0,
      90
    ),
  };

  if (updates.season_periods != null) {
    next.season_periods = await setSeasonPeriods(updates.season_periods);
  } else {
    next.season_periods = current.season_periods;
  }

  for (const key of SETTING_KEYS) {
    await pool.query(
      `INSERT INTO system_settings (setting_key, setting_value)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [key, String(next[key])]
    );
  }

  return next;
}

function clampInt(value, min, max) {
  const n = Math.round(Number(value));
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export async function getPublicFiscalYearInfo({ bypassAdvanceLimit = false } = {}) {
  const settings = await getFiscalYearSettings();
  const bounds = getBookingDateBounds(settings, { bypassAdvanceLimit });
  const today = bounds.minDate;
  const seasonForToday = await resolveLodgingSeasonForDate(today, settings.season_periods);
  const checkInFiscalYear = bounds.maxCheckInDate
    ? getFiscalYearForDate(bounds.maxCheckInDate, settings)
    : null;

  return {
    ...bounds,
    settings,
    seasonPeriods: settings.season_periods,
    seasonPeriodsSummary: describeSeasonPeriods(settings.season_periods),
    seasonForToday,
    activeLodgingSeason: seasonForToday,
    activeSeasonLabel: `${seasonForToday} season rates apply today`,
    checkInFiscalYear,
    advanceLimitLabel: bounds.maxCheckInDate
      ? `Reservations may be made up to ${bounds.bookingAdvanceMonths} month(s) in advance (latest check-in: ${formatDisplayDate(bounds.maxCheckInDate)}).`
      : 'No advance booking limit.',
    cancellationPolicyLabel: formatCancellationPolicyLabel(settings.guest_cancellation_cutoff_days),
  };
}

export { formatSeasonPeriodLabel, describeSeasonPeriods, LODGING_SEASONS };

export function formatCancellationPolicyLabel(cutoffDays) {
  const days = Number(cutoffDays);
  if (days <= 0) {
    return 'Guests may cancel pending or approved reservations any time before check-in or the event starts.';
  }
  if (days === 1) {
    return 'Guests may cancel pending or approved reservations at least 1 day before check-in or the event date.';
  }
  return `Guests may cancel pending or approved reservations at least ${days} days before check-in or the event date.`;
}

export async function validateReservationDates(checkIn, checkOut, { bypassAdvanceLimit = false } = {}) {
  if (!checkIn || !checkOut) {
    throw new Error('check_in and check_out are required');
  }
  if (checkOut <= checkIn) {
    throw new Error('check_out must be after check_in');
  }

  const settings = await getFiscalYearSettings();
  const bounds = getBookingDateBounds(settings, { bypassAdvanceLimit });
  const today = bounds.minDate;

  if (!bypassAdvanceLimit && checkIn < today) {
    throw new Error('Check-in cannot be in the past.');
  }

  if (!bypassAdvanceLimit && bounds.maxCheckInDate && checkIn > bounds.maxCheckInDate) {
    throw new Error(
      `Reservations can only be made up to ${bounds.bookingAdvanceMonths} month(s) in advance (latest check-in: ${formatDisplayDate(bounds.maxCheckInDate)}).`
    );
  }

  const checkInFy = getFiscalYearForDate(checkIn, settings);
  const checkOutFy = getFiscalYearForDate(addDaysISO(checkOut, -1), settings);

  return {
    settings,
    bounds,
    checkInFiscalYear: checkInFy,
    checkOutFiscalYear: checkOutFy,
    spansFiscalYears: checkInFy.startYear !== checkOutFy.startYear,
  };
}
