/**
 * Admin venue management — treats a venue as one physical space that can be
 * offered for several "uses" (functions). Each use is stored as a facilities
 * row (venue-level fields duplicated across the uses so the physical space is
 * described consistently), with its own seasonal prices in rates_facilities.
 *
 * A venue is identified by facility_group + name + room_code so that rows like
 * "GMC Chapel / Church" and "GMC Chapel / Wedding" collapse into a single venue
 * with a Church use and a Wedding use.
 */

import { pool } from '../config/db.js';
import { fetchFacilitiesWithRates } from './facilityCatalog.service.js';
import { FACILITY_GROUP_ICONS } from '../constants/facilities.js';
import { bustCatalogAndFacilities } from '../utils/cache.js';
import { deleteAllFacilityImages } from './facilityImage.service.js';
import {
  DEFAULT_FACILITY_BILLING_UNIT,
  DEFAULT_RATE_AUDIENCE,
  DEFAULT_RATE_AGE_BAND,
  DEFAULT_RATE_CURRENCY,
  matchesDefaultRateVariant,
  normalizeRateVariant,
} from '../constants/rateVariants.js';

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}
const badRequest = (message) => httpError(400, message);

function venueKey(facility) {
  return `${facility.facility_group || ''}\x1f${facility.name || ''}\x1f${facility.room_code || ''}`;
}

export { venueKey };

function toRate(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function toIntOrNull(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function seasonRate(rates, season) {
  return seasonRateForAudience(rates, season, DEFAULT_RATE_AUDIENCE);
}

function seasonRateForAudience(rates, season, audience) {
  const key = String(audience ?? DEFAULT_RATE_AUDIENCE).trim() || DEFAULT_RATE_AUDIENCE;
  const matches = (rates || []).filter((r) => r.season === season && String(r.audience || DEFAULT_RATE_AUDIENCE).trim() === key);
  const hit = matches.find((r) => matchesDefaultRateVariant(r, { billing_unit: DEFAULT_FACILITY_BILLING_UNIT })) || matches[0];
  return hit ? Number(hit.rate) : null;
}

function facilityVariant(rates = []) {
  const hit = rates.find((r) => matchesDefaultRateVariant(r, { billing_unit: DEFAULT_FACILITY_BILLING_UNIT }))
    || rates.find((r) => r.season === 'Regular')
    || rates[0];
  return normalizeRateVariant(hit || {}, { billing_unit: DEFAULT_FACILITY_BILLING_UNIT });
}

/** Grouped venue catalog for the admin "Manage venues" screen. */
export async function listAdminVenues() {
  const facilities = await fetchFacilitiesWithRates();

  const [countRows] = await pool.query(
    `SELECT facility_id, COUNT(*) AS n
     FROM bookings_facilities
     GROUP BY facility_id`
  );
  const bookingCounts = new Map(countRows.map((r) => [r.facility_id, Number(r.n)]));

  const byVenue = new Map();
  for (const f of facilities) {
    const key = venueKey(f);
    if (!byVenue.has(key)) {
      byVenue.set(key, {
        key,
        name: f.name,
        facility_group: f.facility_group,
        room_code: f.room_code,
        description: f.description,
        capacity_min: f.capacity_min,
        capacity_max: f.capacity_max,
        min_hours: f.min_hours,
        hourly_rate: f.hourly_rate,
        inclusions: f.inclusions,
        policies: f.policies,
        icon: f.icon || FACILITY_GROUP_ICONS[f.facility_group] || 'place',
        preview_images: Array.isArray(f.preview_images) ? f.preview_images : [],
        functions: [],
      });
    }
    const venue = byVenue.get(key);
    // Prefer the richest gallery if siblings somehow diverge.
    if ((f.preview_images || []).length > (venue.preview_images || []).length) {
      venue.preview_images = f.preview_images;
    }
    const variant = facilityVariant(f.rates);
    venue.functions.push({
      facility_id: f.id,
      function_name: f.package_name,
      inclusions: f.inclusions || '',
      policies: f.policies || '',
      rates: (f.rates || []).map((r) => ({
        id: r.id,
        season: r.season,
        rate: Number(r.rate),
        audience: r.audience,
        age_band: r.age_band,
        currency: r.currency,
        billing_unit: r.billing_unit,
        notes: r.notes,
      })),
      regular_rate: seasonRateForAudience(f.rates, 'Regular', DEFAULT_RATE_AUDIENCE),
      peak_rate: seasonRateForAudience(f.rates, 'Peak', DEFAULT_RATE_AUDIENCE),
      audience: variant.audience,
      age_band: variant.age_band,
      currency: variant.currency,
      billing_unit: variant.billing_unit,
      notes: variant.notes,
      booking_count: bookingCounts.get(f.id) || 0,
    });
  }

  return [...byVenue.values()].sort((a, b) => {
    const g = String(a.facility_group || '').localeCompare(String(b.facility_group || ''));
    return g !== 0 ? g : String(a.name || '').localeCompare(String(b.name || ''));
  });
}

async function upsertRate(conn, facilityId, season, rate, variant) {
  await conn.query(
    `INSERT INTO rates_facilities (facility_id, season, rate, audience, age_band, currency, billing_unit, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       rate = VALUES(rate),
       audience = VALUES(audience),
       age_band = VALUES(age_band),
       currency = VALUES(currency),
       billing_unit = VALUES(billing_unit),
       notes = VALUES(notes)`,
    [
      facilityId,
      season,
      rate,
      variant.audience,
      variant.age_band,
      variant.currency,
      variant.billing_unit,
      variant.notes,
    ]
  );
}

async function assertNoBookings(conn, facilityId) {
  const [active] = await conn.query(
    `SELECT COUNT(*) AS n FROM bookings_facilities
     WHERE facility_id = ? AND status IN ('Pending', 'Approved')`,
    [facilityId]
  );
  if (Number(active[0].n) > 0) {
    const n = Number(active[0].n);
    throw badRequest(
      `This venue use has ${n} active booking${n === 1 ? '' : 's'} (pending or approved). Cancel or reassign ${n === 1 ? 'it' : 'them'} before removing the venue.`
    );
  }
}

/**
 * Create or update a venue and its uses in one call.
 * @param {object} payload
 * @param {number[]} [payload.removed_function_ids] facility ids to delete
 */
export async function saveAdminVenue(payload = {}) {
  const {
    name, facility_group, room_code, description,
    capacity_min, capacity_max, min_hours, hourly_rate, inclusions, policies,
    functions = [], removed_function_ids = [],
    audience: audienceScopeRaw,
  } = payload;

  const audienceScope = audienceScopeRaw
    ? String(audienceScopeRaw).trim() || null
    : null;

  const venueName = String(name || '').trim();
  const group = String(facility_group || '').trim();
  if (!venueName) throw badRequest('Venue name is required.');
  if (!group) throw badRequest('Venue category is required.');

  const code = room_code && String(room_code).trim() ? String(room_code).trim() : null;

  // `undefined` = caller didn't send per-use text, so fall back to the venue-level
  // value; an explicit "" clears that use's inclusions/policies.
  const cleanText = (v) => (String(v).trim() || null);
  const cleanFns = (Array.isArray(functions) ? functions : []).map((f) => {
    const variant = normalizeRateVariant(
      { ...f, audience: audienceScope || f.audience },
      { billing_unit: DEFAULT_FACILITY_BILLING_UNIT },
    );
    return {
      facility_id: f.facility_id ? Number(f.facility_id) : null,
      function_name: f.function_name != null && String(f.function_name).trim() !== ''
        ? String(f.function_name).trim()
        : null,
      inclusions: f.inclusions === undefined ? undefined : cleanText(f.inclusions),
      policies: f.policies === undefined ? undefined : cleanText(f.policies),
      regular_rate: toRate(f.regular_rate),
      peak_rate: toRate(f.peak_rate),
      ...variant,
    };
  });

  if (!cleanFns.length) throw badRequest('Add at least one use for this venue.');
  if (cleanFns.length > 1) {
    const names = cleanFns.map((f) => (f.function_name || '').toLowerCase());
    if (names.some((n) => !n)) throw badRequest('Give each use a name (e.g. Wedding, Meeting, Baptism).');
    if (new Set(names).size !== names.length) throw badRequest('Two uses have the same name.');
  }
  if (code && cleanFns.length > 1) {
    throw badRequest('A venue with a booking code can only have one use. Remove the code to offer multiple uses.');
  }

  const capMin = toIntOrNull(capacity_min);
  const capMax = toIntOrNull(capacity_max);
  if (capMin != null && capMax != null && capMax < capMin) {
    throw badRequest('Maximum capacity must be greater than or equal to the minimum.');
  }
  const minH = toIntOrNull(min_hours);
  const venueHourly = toRate(hourly_rate);

  const venue = {
    name: venueName,
    room_code: code,
    description: description && String(description).trim() ? String(description).trim() : null,
    facility_group: group,
    capacity_min: capMin,
    capacity_max: capMax,
    min_hours: minH,
    hourly_rate: venueHourly,
    inclusions: inclusions && String(inclusions).trim() ? String(inclusions).trim() : null,
    policies: policies && String(policies).trim() ? String(policies).trim() : null,
  };

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    for (const rawId of (removed_function_ids || [])) {
      const id = Number(rawId);
      if (!id) continue;
      await assertNoBookings(conn, id);
      await conn.query('DELETE FROM rates_facilities WHERE facility_id = ?', [id]);
      await conn.query('DELETE FROM facilities WHERE id = ?', [id]);
    }

    for (const fn of cleanFns) {
      // Inclusions/policies are per-use; only fall back to the venue-level value
      // when the caller didn't send them for this use at all.
      const fnInclusions = fn.inclusions === undefined ? venue.inclusions : fn.inclusions;
      const fnPolicies = fn.policies === undefined ? venue.policies : fn.policies;

      let facilityId = fn.facility_id;
      if (facilityId) {
        await conn.query(
          `UPDATE facilities SET
             name = ?, room_code = ?, description = ?, package_name = ?, facility_group = ?,
             capacity_min = ?, capacity_max = ?, min_hours = ?, hourly_rate = ?, inclusions = ?, policies = ?
           WHERE id = ?`,
          [venue.name, venue.room_code, venue.description, fn.function_name, venue.facility_group,
            venue.capacity_min, venue.capacity_max, venue.min_hours, venue.hourly_rate,
            fnInclusions, fnPolicies, facilityId]
        );
      } else {
        const [ins] = await conn.query(
          `INSERT INTO facilities
             (name, room_code, description, package_name, facility_group,
              capacity_min, capacity_max, min_hours, hourly_rate, inclusions, policies)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [venue.name, venue.room_code, venue.description, fn.function_name, venue.facility_group,
            venue.capacity_min, venue.capacity_max, venue.min_hours, venue.hourly_rate,
            fnInclusions, fnPolicies]
        );
        facilityId = ins.insertId;
      }

      // A use may be created without a price yet; it simply has no rate row and
      // stays hidden from guests until a Regular price is set (via Venue prices).
      if (fn.regular_rate > 0) {
        await upsertRate(conn, facilityId, 'Regular', fn.regular_rate, fn);
      } else {
        await conn.query(
          `DELETE FROM rates_facilities WHERE facility_id = ? AND season = 'Regular' AND audience = ?`,
          [facilityId, fn.audience]
        );
      }
      if (fn.peak_rate > 0) {
        await upsertRate(conn, facilityId, 'Peak', fn.peak_rate, fn);
      } else {
        await conn.query(
          `DELETE FROM rates_facilities WHERE facility_id = ? AND season = 'Peak' AND audience = ?`,
          [facilityId, fn.audience]
        );
      }
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      throw badRequest('That booking code is already used by another venue.');
    }
    throw err;
  } finally {
    conn.release();
  }

  bustCatalogAndFacilities();
  return { message: 'Venue saved' };
}

/** Delete a single use (facility row). */
export async function deleteAdminVenueFunction(facilityId) {
  const id = Number(facilityId);
  if (!id) throw badRequest('Invalid venue use.');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await assertNoBookings(conn, id);
    await conn.query('DELETE FROM rates_facilities WHERE facility_id = ?', [id]);
    const [result] = await conn.query('DELETE FROM facilities WHERE id = ?', [id]);
    await conn.commit();
    if (!result.affectedRows) throw httpError(404, 'Venue use not found.');
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  bustCatalogAndFacilities();
  await deleteAllFacilityImages(id).catch((err) => {
    console.warn(`[facilities] image cleanup after use delete id=${id}:`, err.message);
  });
  return { message: 'Venue use removed' };
}

/** Delete an entire venue (all of its uses). */
export async function deleteAdminVenue(functionIds = []) {
  const ids = (Array.isArray(functionIds) ? functionIds : []).map(Number).filter(Boolean);
  if (!ids.length) throw badRequest('No venue uses to delete.');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const id of ids) {
      await assertNoBookings(conn, id);
      await conn.query('DELETE FROM rates_facilities WHERE facility_id = ?', [id]);
      await conn.query('DELETE FROM facilities WHERE id = ?', [id]);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  bustCatalogAndFacilities();
  await Promise.all(ids.map((id) => deleteAllFacilityImages(id).catch((err) => {
    console.warn(`[facilities] image cleanup after venue delete id=${id}:`, err.message);
  })));
  return { message: 'Venue removed' };
}
