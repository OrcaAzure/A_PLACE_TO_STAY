/**
 * Venue booking math — rate resolution (Regular/Peak, per-hour vs per-event),
 * totals with extra hours, duration/capacity validation, and slot-overlap
 * detection. Consumed by facilityBooking.controller.js and payment.service.js.
 */
import { pool } from '../config/db.js';
import { resolveLodgingSeasonForDate, mapLodgingSeasonToFacilitySeason } from './season.service.js';
import {
  DEFAULT_FACILITY_BILLING_UNIT,
  normalizeRateVariant,
  pickBookingRateRow,
} from '../constants/rateVariants.js';
import {
  getFacilityById,
  getFacilityByLegacyKeys,
  getFacilityByRoomCode,
} from './facilityCatalog.service.js';
import { formatFacilityLabel } from '../constants/facilities.js';

export function facilitySpaceKey(facilityGroup, item) {
  return `${facilityGroup}\x1f${item}`;
}

export function facilitySpaceKeyFromId(facilityId) {
  return String(facilityId);
}

export function mapSeasonToFacilitySeason(season) {
  return mapLodgingSeasonToFacilitySeason(season);
}

const FACILITY_BOOKING_SEASONS = ['Regular', 'Peak', 'N/A'];

/** bookings_facilities.season accepts Regular | Peak | N/A — not lodging Super Peak. */
export function normalizeFacilityBookingSeason(season) {
  if (FACILITY_BOOKING_SEASONS.includes(season)) return season;
  return mapLodgingSeasonToFacilitySeason(season);
}

function enrichRateRow(rateRow, facility, calendarSeason) {
  const label = facility ? formatFacilityLabel(facility) : null;
  const variant = normalizeRateVariant(rateRow, { billing_unit: DEFAULT_FACILITY_BILLING_UNIT });
  return {
    rate_id: rateRow.id,
    id: rateRow.id,
    facility_id: facility?.id ?? rateRow.facility_id,
    season: rateRow.season,
    rate: Number(rateRow.rate),
    ...variant,
    name: facility?.name ?? null,
    room_code: facility?.room_code ?? null,
    description: facility?.description ?? null,
    package_name: facility?.package_name ?? null,
    facility_group: facility?.facility_group ?? null,
    capacity_min: facility?.capacity_min ?? null,
    capacity_max: facility?.capacity_max ?? null,
    min_hours: facility?.min_hours ?? null,
    hourly_rate: facility?.hourly_rate != null ? Number(facility.hourly_rate) : null,
    inclusions: facility?.inclusions ?? null,
    policies: facility?.policies ?? null,
    label,
    calendar_season: calendarSeason,
    category: facility?.facility_group || 'Facility',
    item: facility?.room_code || facility?.package_name || facility?.name,
  };
}

async function pickRateRowForFacility(facilityId, eventDate) {
  const lodgingSeason = eventDate
    ? await resolveLodgingSeasonForDate(String(eventDate).slice(0, 10))
    : await resolveLodgingSeasonForDate(new Date().toISOString().slice(0, 10));
  const preferred = mapLodgingSeasonToFacilitySeason(lodgingSeason);
  const fallbacks = preferred === 'Peak' ? ['Peak', 'Regular'] : ['Regular', 'Peak'];
  const facility = await getFacilityById(facilityId);

  for (const season of fallbacks) {
    const [rows] = await pool.query(
      `SELECT rf.id, rf.facility_id, rf.season, rf.rate, rf.audience, rf.age_band, rf.currency, rf.billing_unit, rf.notes
       FROM rates_facilities rf
       WHERE rf.facility_id = ? AND rf.season = ?
       LIMIT 10`,
      [facilityId, season]
    );
    const match = pickBookingRateRow(rows, { billing_unit: DEFAULT_FACILITY_BILLING_UNIT });
    if (match) {
      return enrichRateRow(match, facility, lodgingSeason);
    }
  }
  return null;
}

export async function resolveVenueFacilityRowByFacilityId(facilityId, eventDate) {
  return pickRateRowForFacility(facilityId, eventDate);
}

export async function resolveVenueFacilityRow(category, item, eventDate) {
  const facility = await getFacilityByLegacyKeys(category, item);
  if (facility) {
    return pickRateRowForFacility(facility.id, eventDate);
  }
  return null;
}

export async function findVenueBookingOverlap({
  facility_id, event_venue_id, category, item, eventDate, startTime, endTime, excludeBookingId,
}) {
  const catalogId = facility_id || event_venue_id;
  let resolvedId = catalogId;

  if (!resolvedId && category && item) {
    const facility = await getFacilityByLegacyKeys(category, item);
    resolvedId = facility?.id;
  }
  if (!resolvedId) return null;

  const params = [resolvedId, eventDate, endTime, startTime];
  let sql = `
    SELECT id FROM bookings_facilities
    WHERE facility_id = ?
      AND event_date = ?
      AND status IN ('Pending', 'Approved')
      AND deleted_at IS NULL
      AND start_time < ? AND end_time > ?
  `;
  if (excludeBookingId) {
    sql += ' AND id <> ?';
    params.push(excludeBookingId);
  }
  sql += ' LIMIT 1';

  const [rows] = await pool.query(sql, params);
  return rows[0] || null;
}

export function normalizeTimeValue(value) {
  if (!value) return value;
  const raw = String(value).trim();
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(raw)) return raw;
  if (/^\d{1,2}:\d{2}$/.test(raw)) return `${raw}:00`;
  return raw;
}

export function timesOverlap(startA, endA, startB, endB) {
  const a = normalizeTimeValue(startA);
  const b = normalizeTimeValue(endA);
  const c = normalizeTimeValue(startB);
  const d = normalizeTimeValue(endB);
  if (!a || !b || !c || !d) return false;
  return a < d && b > c;
}

export function bookingOverlapsSlot(booking, startTime, endTime) {
  return timesOverlap(booking.start_time, booking.end_time, startTime, endTime);
}

export async function resolveFacilityIdentity({
  facility_id, event_venue_id, room_code, category, item, event_date,
}) {
  const catalogId = facility_id || event_venue_id;

  if (catalogId) {
    const facility = await getFacilityById(catalogId);
    if (!facility) return null;
    if (!event_date) {
      const [rows] = await pool.query(
        `SELECT rf.id, rf.facility_id, rf.season, rf.rate, rf.audience, rf.age_band, rf.currency, rf.billing_unit, rf.notes
         FROM rates_facilities rf
         WHERE rf.facility_id = ?
         ORDER BY FIELD(rf.season, 'Regular', 'Peak')
         LIMIT 10`,
        [catalogId]
      );
      const match = pickBookingRateRow(rows, { billing_unit: DEFAULT_FACILITY_BILLING_UNIT });
      if (!match) return null;
      return {
        facility_id: catalogId,
        category: facility.facility_group || 'Facility',
        item: facility.room_code || facility.package_name || facility.name,
        facility,
        row: enrichRateRow(match, facility, null),
      };
    }
    const row = await pickRateRowForFacility(catalogId, event_date);
    return row ? {
      facility_id: catalogId,
      category: facility.facility_group || 'Facility',
      item: facility.room_code || facility.package_name || facility.name,
      facility,
      row,
    } : null;
  }

  if (room_code) {
    const facility = await getFacilityByRoomCode(room_code);
    if (!facility) return null;
    return resolveFacilityIdentity({ facility_id: facility.id, event_date });
  }

  if (category && item) {
    const facility = await getFacilityByLegacyKeys(category, item);
    if (facility) {
      return resolveFacilityIdentity({ facility_id: facility.id, event_date });
    }
    return null;
  }

  return null;
}

export function parsePackageHours(itemName) {
  if (!itemName) return null;
  const s = String(itemName);
  const explicit = s.match(/(\d+)\s*hr/i);
  if (explicit) return Number(explicit[1]);
  const word = s.match(/(\d+)\s*[- ]?\s*hour/i);
  if (/minimum|min\./i.test(s) && word) return Number(word[1]);
  return null;
}

export function bookingDurationHours(startTime, endTime) {
  const start = normalizeTimeValue(startTime);
  const end = normalizeTimeValue(endTime);
  if (!start || !end || end <= start) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return ((eh * 60 + em) - (sh * 60 + sm)) / 60;
}

/**
 * Minimum booking hours for a venue. Uses the admin-configured `min_hours`
 * column, falling back to a value parsed from the package/item name so
 * pre-migration data keeps working. Returns null for purely hourly venues.
 */
export function resolveMinHours(facility) {
  const configured = Number(facility?.min_hours);
  if (Number.isFinite(configured) && configured > 1) return configured;
  if (Number.isFinite(configured) && configured === 1) return null;
  return parsePackageHours(facility?.package_name || facility?.item) || null;
}

/** Per-hour price for time beyond the minimum block. */
export function resolveExtraHourRate(facility, baseRate, minHours) {
  const configured = Number(facility?.hourly_rate);
  if (Number.isFinite(configured) && configured > 0) return configured;
  if (minHours) return Number(baseRate) / minHours;
  return Number(baseRate);
}

/**
 * Hourly venue that also enforces a booking floor via min_hours
 * (e.g. Prayer Mountain: ₱6,000/hr with a 4-hour minimum).
 *
 * Package venues (GMC Chapel / Burdine): min_hours set, hourly_rate NULL
 * (or an overflow rate ≈ rate / min_hours).
 * Hourly-floor venues: hourly_rate set near the catalog season rate.
 */
export function isHourlyMinimumVenue(facility) {
  const minHours = resolveMinHours(facility);
  if (!minHours) return false;
  const rate = Number(facility?.rate);
  const hourly = Number(facility?.hourly_rate);
  if (!(Number.isFinite(hourly) && hourly > 0) || !(Number.isFinite(rate) && rate > 0)) {
    return false;
  }
  const impliedPackageHourly = rate / minHours;
  // Configured overflow for a flat package block — keep package billing.
  if (Math.abs(hourly - impliedPackageHourly) / impliedPackageHourly < 0.15) {
    return false;
  }
  // hourly_rate sits near the season catalog rate (Peak/Regular may differ slightly).
  return Math.abs(hourly - rate) / rate < 0.25;
}

/**
 * Total venue price.
 * - Hourly + minimum (rate === hourly_rate): base rate × hours (floor enforced by validateVenueDuration).
 * - Minimum-block / package (min_hours set): base rate covers the minimum block,
 *   each extra hour is charged at the overflow rate.
 * - Pure hourly venues: base rate × hours (at least one hour).
 */
export function computeVenueTotal(facility, startTime, endTime) {
  const rate = Number(facility?.rate);
  const hours = bookingDurationHours(startTime, endTime);
  const minHours = resolveMinHours(facility);
  const round = (n) => Math.round(n * 100) / 100;

  if (minHours && isHourlyMinimumVenue(facility)) {
    return round(rate * Math.max(hours, 1));
  }
  if (minHours) {
    if (hours <= minHours) return round(rate);
    const perHour = resolveExtraHourRate(facility, rate, minHours);
    return round(rate + perHour * (hours - minHours));
  }
  return round(rate * Math.max(hours, 1));
}

export function validateVenueCapacity(facilityRow, guestCount) {
  const count = Number(guestCount);
  if (!Number.isFinite(count) || count < 1) {
    return 'Guest count must be at least 1.';
  }
  const min = facilityRow?.capacity_min;
  const max = facilityRow?.capacity_max;
  if (min != null && count < min) {
    return `This venue requires at least ${min} guest${min === 1 ? '' : 's'}.`;
  }
  if (max != null && count > max) {
    return `This venue accommodates up to ${max} guests.`;
  }
  return null;
}

export function validateVenueDuration(facility, startTime, endTime) {
  const hours = bookingDurationHours(startTime, endTime);
  if (hours <= 0) return 'End time must be after start time.';
  const minHours = resolveMinHours(facility);
  if (minHours && hours < minHours) {
    return `This venue has a ${minHours}-hour minimum booking. Please select at least ${minHours} hours.`;
  }
  return null;
}

export function venueRateMeta(facility) {
  const rate = Number(facility?.rate);
  const minHours = resolveMinHours(facility);
  const fmt = (n) => Number(n).toLocaleString('en-PH', { minimumFractionDigits: 0 });
  if (minHours && isHourlyMinimumVenue(facility)) {
    return {
      min_hours: minHours,
      package_hours: null,
      hourly_rate: rate,
      rate_type: 'hourly_minimum',
      rate_label: `₱${fmt(rate)} / hour · ${minHours}-hr minimum`,
    };
  }
  if (minHours) {
    const perHour = resolveExtraHourRate(facility, rate, minHours);
    return {
      min_hours: minHours,
      package_hours: minHours,
      hourly_rate: perHour,
      rate_type: 'minimum',
      rate_label: `${minHours}-hr minimum · ₱${fmt(rate)} (+₱${fmt(perHour)}/extra hr)`,
    };
  }
  return {
    min_hours: null,
    package_hours: null,
    hourly_rate: rate,
    rate_type: 'hourly',
    rate_label: `₱${fmt(rate)} / hour`,
  };
}
