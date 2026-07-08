export const DEFAULT_RATE_AUDIENCE = 'Guest';
export const DEFAULT_RATE_AGE_BAND = 'Adult';
export const DEFAULT_RATE_CURRENCY = 'PHP';

export const DEFAULT_ROOM_BILLING_UNIT = 'per night';
export const DEFAULT_MEAL_BILLING_UNIT = 'per meal';
export const DEFAULT_EXTRA_BILLING_UNIT = 'per item';
export const DEFAULT_FACILITY_BILLING_UNIT = 'per segment';

/** Variant used for all live booking quotes until category rules are enabled. */
export const BOOKING_RATE_VARIANT = Object.freeze({
  audience: DEFAULT_RATE_AUDIENCE,
  age_band: DEFAULT_RATE_AGE_BAND,
  currency: DEFAULT_RATE_CURRENCY,
});

/**
 * When true, booking/availability APIs only read Guest · Adult · PHP rows.
 * Admin catalog editors may still store Category 1/2, Program, USD, child, etc.
 */
export const BOOKING_USES_DEFAULT_VARIANT_ONLY = true;

export const RATE_CURRENCIES = ['PHP', 'USD'];
export const RATE_AGE_BANDS = ['Adult', 'Child', 'All Ages'];

export const RATE_AUDIENCE_PRESETS = [
  'Guest',
  'Category 1',
  'Category 2',
  'Program',
  'Internal',
];

/** Categories housing can assign when approving or creating a stay. */
export const BOOKING_PRICING_CATEGORIES = ['Guest', 'Category 1', 'Category 2'];

export function normalizePricingCategory(value) {
  const next = normalizeAudienceValue(value, DEFAULT_RATE_AUDIENCE);
  return BOOKING_PRICING_CATEGORIES.includes(next) ? next : DEFAULT_RATE_AUDIENCE;
}

function clean(value, fallback, maxLen = 120) {
  const next = String(value ?? '').trim().slice(0, maxLen);
  return next || fallback;
}

function normalizeAudienceValue(raw, fallback = DEFAULT_RATE_AUDIENCE) {
  const next = clean(raw, fallback, 80);
  return next === 'Category 3' ? DEFAULT_RATE_AUDIENCE : next;
}

export function normalizeRateVariant(raw = {}, defaults = {}) {
  return {
    audience: normalizeAudienceValue(raw.audience, defaults.audience || DEFAULT_RATE_AUDIENCE),
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

/** Pick the row used for live booking math — never falls back to alternate audiences. */
export function pickBookingRateRow(rows = [], { billing_unit = DEFAULT_ROOM_BILLING_UNIT } = {}) {
  return pickRateRowForAudience(rows, DEFAULT_RATE_AUDIENCE, { billing_unit });
}

/** Pick a rate row for a specific pricing category (Guest, Category 1, Category 2). */
export function pickRateRowForAudience(
  rows = [],
  audience = DEFAULT_RATE_AUDIENCE,
  { billing_unit = DEFAULT_ROOM_BILLING_UNIT } = {},
) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const key = normalizePricingCategory(audience);
  return rows.find((row) => {
    const v = normalizeRateVariant(row, { billing_unit });
    return v.audience === key
      && v.age_band === DEFAULT_RATE_AGE_BAND
      && v.currency === DEFAULT_RATE_CURRENCY
      && v.billing_unit === billing_unit;
  }) || null;
}
