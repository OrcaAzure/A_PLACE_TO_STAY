import { pool } from '../config/db.js';
import { resolveSeason } from './booking.service.js';

export const NON_VENUE_CATEGORIES = [
  'Food Service',
  'Laundry',
  'Laundry-Iron',
  'Corkage Fee',
  'Maid Service',
  'Accommodation Extras',
];

export function venueSpaceKey(category, item) {
  return `${category}\x1f${item}`;
}

/** Map calendar season (incl. Super Peak) to a facilities.season row. */
export function mapSeasonToFacilitySeason(season) {
  if (season === 'Peak' || season === 'Super Peak') return 'Peak';
  return 'Regular';
}

export function isVenueCategory(category) {
  return !NON_VENUE_CATEGORIES.includes(category);
}

/** Pick the rate row for a physical venue space on a given date. */
export async function resolveVenueFacilityRow(category, item, eventDate) {
  const calendarSeason = await resolveSeason(eventDate);
  const preferred = mapSeasonToFacilitySeason(calendarSeason);
  const fallbacks = preferred === 'Peak' ? ['Peak', 'Regular'] : ['Regular', 'Peak'];

  for (const season of fallbacks) {
    const [rows] = await pool.query(
      `SELECT id, category, item, season, rate, capacity_min, capacity_max
       FROM facilities
       WHERE category = ? AND item = ? AND season = ?
       LIMIT 1`,
      [category, item, season]
    );
    if (rows.length) {
      return {
        ...rows[0],
        rate: Number(rows[0].rate),
        calendar_season: calendarSeason,
      };
    }
  }
  return null;
}

export async function getVenueFacilityIds(category, item) {
  const [rows] = await pool.query(
    'SELECT id FROM facilities WHERE category = ? AND item = ?',
    [category, item]
  );
  return rows.map((r) => r.id);
}

export async function findVenueBookingOverlap({
  category, item, eventDate, startTime, endTime, excludeBookingId,
}) {
  const ids = await getVenueFacilityIds(category, item);
  if (!ids.length) return null;

  const placeholders = ids.map(() => '?').join(',');
  const params = [...ids, eventDate, endTime, startTime];
  let sql = `
    SELECT id FROM facility_bookings
    WHERE facility_id IN (${placeholders})
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

/** True when two time ranges overlap (MySQL TIME strings). */
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

/** Resolve category + item + rate row from facility_id and/or explicit space + date. */
export async function resolveFacilityIdentity({ facility_id, category, item, event_date }) {
  if (category && item) {
    if (!event_date) {
      const [rows] = await pool.query(
        `SELECT id, category, item, season, rate, capacity_min, capacity_max
         FROM facilities WHERE category = ? AND item = ? ORDER BY FIELD(season, 'Regular', 'Peak') LIMIT 1`,
        [category, item]
      );
      if (!rows.length) return null;
      return {
        category,
        item,
        row: { ...rows[0], rate: Number(rows[0].rate) },
      };
    }
    const row = await resolveVenueFacilityRow(category, item, event_date);
    return row ? { category, item, row } : null;
  }

  if (facility_id) {
    const [rows] = await pool.query(
      'SELECT id, category, item, season, rate FROM facilities WHERE id = ? LIMIT 1',
      [facility_id]
    );
    if (!rows.length) return null;
    const f = rows[0];
    if (event_date) {
      const row = await resolveVenueFacilityRow(f.category, f.item, event_date);
      return row ? { category: f.category, item: f.item, row } : null;
    }
    return {
      category: f.category,
      item: f.item,
      row: { ...f, rate: Number(f.rate) },
    };
  }

  return null;
}

/** Group raw facility rows into unique physical spaces with all rate variants. */
export function groupVenueSpacesFromRows(rows) {
  const bySpace = new Map();

  for (const row of rows) {
    if (!isVenueCategory(row.category)) continue;
    const key = venueSpaceKey(row.category, row.item);
    if (!bySpace.has(key)) {
      bySpace.set(key, {
        category: row.category,
        item: row.item,
        capacity_min: row.capacity_min,
        capacity_max: row.capacity_max,
        facility_ids: [],
        rates: [],
      });
    }
    const space = bySpace.get(key);
    space.facility_ids.push(row.id);
    space.rates.push({
      id: row.id,
      season: row.season,
      rate: Number(row.rate),
    });
    if (row.capacity_min != null) space.capacity_min = row.capacity_min;
    if (row.capacity_max != null) space.capacity_max = row.capacity_max;
  }

  return bySpace;
}
