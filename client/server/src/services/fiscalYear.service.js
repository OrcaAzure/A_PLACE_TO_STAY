import { pool } from '../config/db.js';
import { FISCAL_YEAR_DEFAULTS } from '../utils/constants.js';

const SETTING_KEYS = [
  'fiscal_year_start_month',
  'fiscal_year_start_day',
  'booking_advance_months',
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

export async function getFiscalYearSettings() {
  try {
    const [rows] = await pool.query(
      'SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN (?, ?, ?)',
      SETTING_KEYS
    );
    const stored = Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value]));
    return {
      fiscal_year_start_month: Number(stored.fiscal_year_start_month) || FISCAL_YEAR_DEFAULTS.fiscal_year_start_month,
      fiscal_year_start_day: Number(stored.fiscal_year_start_day) || FISCAL_YEAR_DEFAULTS.fiscal_year_start_day,
      booking_advance_months: Number(stored.booking_advance_months) || FISCAL_YEAR_DEFAULTS.booking_advance_months,
    };
  } catch {
    return { ...FISCAL_YEAR_DEFAULTS };
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
  };

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
  const checkInFiscalYear = bounds.maxCheckInDate
    ? getFiscalYearForDate(bounds.maxCheckInDate, settings)
    : null;

  return {
    ...bounds,
    settings,
    checkInFiscalYear,
    advanceLimitLabel: bounds.maxCheckInDate
      ? `Reservations may be made up to ${bounds.bookingAdvanceMonths} month(s) in advance (latest check-in: ${formatDisplayDate(bounds.maxCheckInDate)}).`
      : 'No advance booking limit.',
  };
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
