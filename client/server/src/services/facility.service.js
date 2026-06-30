import { pool } from '../config/db.js';
import { getActiveLodgingSeason, mapLodgingSeasonToFacilitySeason } from './season.service.js';
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

function enrichRateRow(rateRow, facility, calendarSeason) {
  const label = facility ? formatFacilityLabel(facility) : null;
  return {
    rate_id: rateRow.id,
    id: rateRow.id,
    facility_id: facility?.id ?? rateRow.facility_id,
    season: rateRow.season,
    rate: Number(rateRow.rate),
    name: facility?.name ?? null,
    room_code: facility?.room_code ?? null,
    description: facility?.description ?? null,
    package_name: facility?.package_name ?? null,
    facility_group: facility?.facility_group ?? null,
    capacity_min: facility?.capacity_min ?? null,
    capacity_max: facility?.capacity_max ?? null,
    label,
    calendar_season: calendarSeason,
    category: facility?.facility_group || 'Facility',
    item: facility?.room_code || facility?.package_name || facility?.name,
  };
}

async function pickRateRowForFacility(facilityId, _eventDate) {
  const activeSeason = await getActiveLodgingSeason();
  const preferred = mapLodgingSeasonToFacilitySeason(activeSeason);
  const fallbacks = preferred === 'Peak' ? ['Peak', 'Regular'] : ['Regular', 'Peak'];
  const facility = await getFacilityById(facilityId);

  for (const season of fallbacks) {
    const [rows] = await pool.query(
      `SELECT rf.id, rf.facility_id, rf.season, rf.rate
       FROM rates_facilities rf
       WHERE rf.facility_id = ? AND rf.season = ?
       LIMIT 1`,
      [facilityId, season]
    );
    if (rows.length) {
      return enrichRateRow(rows[0], facility, activeSeason);
    }
  }
  return null;
}

export async function resolveVenueFacilityRowByFacilityId(facilityId, eventDate) {
  return pickRateRowForFacility(facilityId, eventDate);
}

/** @deprecated alias */
export const resolveVenueFacilityRowByEventVenueId = resolveVenueFacilityRowByFacilityId;

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
        `SELECT rf.id, rf.facility_id, rf.season, rf.rate
         FROM rates_facilities rf
         WHERE rf.facility_id = ?
         ORDER BY FIELD(rf.season, 'Regular', 'Peak') LIMIT 1`,
        [catalogId]
      );
      if (!rows.length) return null;
      return {
        facility_id: catalogId,
        category: facility.facility_group || 'Facility',
        item: facility.room_code || facility.package_name || facility.name,
        facility,
        row: enrichRateRow(rows[0], facility, null),
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

export function computeVenueTotal(rate, startTime, endTime, itemName) {
  const hours = bookingDurationHours(startTime, endTime);
  const packageHours = parsePackageHours(itemName);
  const r = Number(rate);
  if (packageHours) {
    if (hours <= packageHours) return Math.round(r * 100) / 100;
    const perHour = r / packageHours;
    return Math.round(perHour * hours * 100) / 100;
  }
  return Math.round(r * Math.max(hours, 1) * 100) / 100;
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

export function validateVenueDuration(startTime, endTime, itemName) {
  const hours = bookingDurationHours(startTime, endTime);
  if (hours <= 0) return 'End time must be after start time.';
  const packageHours = parsePackageHours(itemName);
  if (packageHours && hours < packageHours) {
    return `This venue is booked in ${packageHours}-hour blocks. Please select at least ${packageHours} hours.`;
  }
  return null;
}

export function venueRateMeta(itemName, rate) {
  const packageHours = parsePackageHours(itemName);
  const fmt = (n) => Number(n).toLocaleString('en-PH', { minimumFractionDigits: 0 });
  if (packageHours) {
    return {
      package_hours: packageHours,
      rate_type: 'package',
      rate_label: `${packageHours}-hr package · ₱${fmt(rate)}`,
    };
  }
  return {
    package_hours: null,
    rate_type: 'hourly',
    rate_label: `₱${fmt(rate)} / hour`,
  };
}
