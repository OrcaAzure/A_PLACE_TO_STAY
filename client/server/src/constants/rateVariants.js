export const DEFAULT_RATE_AUDIENCE = 'Guest';
export const DEFAULT_RATE_AGE_BAND = 'Adult';
export const DEFAULT_RATE_CURRENCY = 'PHP';

export const DEFAULT_ROOM_BILLING_UNIT = 'per night';
export const DEFAULT_MEAL_BILLING_UNIT = 'per meal';
export const DEFAULT_EXTRA_BILLING_UNIT = 'per item';
export const DEFAULT_FACILITY_BILLING_UNIT = 'per segment';

export const BOOKING_RATE_VARIANT = Object.freeze({
  audience: DEFAULT_RATE_AUDIENCE,
  age_band: DEFAULT_RATE_AGE_BAND,
  currency: DEFAULT_RATE_CURRENCY,
});

export const RATE_CURRENCIES = ['PHP', 'USD'];
export const RATE_AGE_BANDS = ['Adult', 'Child', 'All Ages'];

function clean(value, fallback, maxLen = 120) {
  const next = String(value ?? '').trim().slice(0, maxLen);
  return next || fallback;
}

export function normalizeRateVariant(raw = {}, defaults = {}) {
  return {
    audience: clean(raw.audience, defaults.audience || DEFAULT_RATE_AUDIENCE, 80),
    age_band: clean(raw.age_band, defaults.age_band || DEFAULT_RATE_AGE_BAND, 40),
    currency: clean(raw.currency, defaults.currency || DEFAULT_RATE_CURRENCY, 8).toUpperCase(),
    billing_unit: clean(raw.billing_unit, defaults.billing_unit || DEFAULT_ROOM_BILLING_UNIT, 40),
    notes: String(raw.notes ?? '').trim().slice(0, 255) || null,
  };
}

export function rateVariantKey(raw = {}, defaults = {}) {
  const v = normalizeRateVariant(raw, defaults);
  return [v.audience, v.age_band, v.currency, v.billing_unit, v.notes || ''].join('\x1f');
}

export function matchesDefaultRateVariant(raw = {}, defaults = {}) {
  const v = normalizeRateVariant(raw, defaults);
  return v.audience === (defaults.audience || DEFAULT_RATE_AUDIENCE)
    && v.age_band === (defaults.age_band || DEFAULT_RATE_AGE_BAND)
    && v.currency === (defaults.currency || DEFAULT_RATE_CURRENCY)
    && v.billing_unit === (defaults.billing_unit || DEFAULT_ROOM_BILLING_UNIT);
}

/** Pick Guest · Adult · PHP row for live booking math. */
export function pickBookingRateRow(rows = [], { billing_unit = DEFAULT_ROOM_BILLING_UNIT } = {}) {
  if (!Array.isArray(rows) || !rows.length) return null;
  return rows.find((row) => matchesDefaultRateVariant(row, {
    ...BOOKING_RATE_VARIANT,
    billing_unit,
  })) || null;
}
