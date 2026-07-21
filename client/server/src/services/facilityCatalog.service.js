import { pool } from '../config/db.js';
import {
  GMC_ABLOCK_VENUE_META,
  FACILITY_GROUP_ICONS,
  formatFacilityLabel,
} from '../constants/facilities.js';
import {
  DEFAULT_FACILITY_BILLING_UNIT,
  matchesDefaultRateVariant,
  normalizeRateVariant,
} from '../constants/rateVariants.js';
import { parseFacilityPreviewImages } from './facilityImage.service.js';

export { formatFacilityLabel, FACILITY_GROUP_ICONS };

const SINGLE_NAME_FACILITIES = new Set(['Osgood Garden']);

/** Derive catalog fields from legacy rate-row category + item keys. */
export function deriveFacilityCatalogFields(category, item) {
  const meta = GMC_ABLOCK_VENUE_META[item];
  if (meta) {
    return {
      name: meta.name,
      room_code: item,
      description: meta.description,
      package_name: null,
      facility_group: 'GMC Conference Rooms',
    };
  }

  if (SINGLE_NAME_FACILITIES.has(item)) {
    return {
      name: item,
      room_code: null,
      description: null,
      package_name: null,
      facility_group: category,
    };
  }

  if (['Basketball Court', 'Childrens Playground', 'Recreational Center', 'Rec Center'].includes(category)) {
    return {
      name: category === 'Rec Center' ? 'Recreational Center' : category,
      room_code: null,
      description: null,
      package_name: item,
      facility_group: 'Recreation',
    };
  }

  return {
    name: category,
    room_code: null,
    description: null,
    package_name: item,
    facility_group: category,
  };
}

export async function fetchFacilitiesWithRates() {
  const [rows] = await pool.query(
    `SELECT
       f.id AS facility_id,
       f.name,
       f.room_code,
       f.description,
       f.package_name,
       f.facility_group,
       f.capacity_min,
       f.capacity_max,
       f.min_hours,
       f.hourly_rate,
       f.inclusions,
       f.policies,
       f.preview_images,
       rf.id AS rate_id,
       rf.season,
      rf.rate,
      rf.audience,
      rf.age_band,
      rf.currency,
      rf.billing_unit,
      rf.notes
     FROM facilities f
     LEFT JOIN rates_facilities rf ON rf.facility_id = f.id
     ORDER BY f.facility_group ASC, f.room_code ASC, f.name ASC,
       FIELD(rf.season, 'Regular', 'Peak', 'N/A') ASC`
  );

  const byFacility = new Map();

  for (const row of rows) {
    if (!byFacility.has(row.facility_id)) {
      byFacility.set(row.facility_id, {
        id: row.facility_id,
        name: row.name,
        room_code: row.room_code,
        description: row.description,
        package_name: row.package_name,
        facility_group: row.facility_group,
        icon: FACILITY_GROUP_ICONS[row.facility_group] || 'place',
        label: formatFacilityLabel(row),
        capacity_min: row.capacity_min,
        capacity_max: row.capacity_max,
        min_hours: row.min_hours,
        hourly_rate: row.hourly_rate != null ? Number(row.hourly_rate) : null,
        inclusions: row.inclusions,
        policies: row.policies,
        preview_images: parseFacilityPreviewImages(row.preview_images),
        rates: [],
        category: row.facility_group || 'Facility',
        item: row.room_code || row.package_name || row.name,
      });
    }
    if (row.rate_id) {
      byFacility.get(row.facility_id).rates.push({
        id: row.rate_id,
        season: row.season,
        rate: Number(row.rate),
        ...normalizeRateVariant(row, { billing_unit: DEFAULT_FACILITY_BILLING_UNIT }),
      });
    }
  }

  return [...byFacility.values()];
}

export function groupFacilitiesForOverview(facilities) {
  const byGroup = new Map();

  for (const facility of facilities) {
    const defaultRates = (facility.rates || []).filter((r) => matchesDefaultRateVariant(r, {
      billing_unit: DEFAULT_FACILITY_BILLING_UNIT,
    }));
    // A use with no Regular price isn't bookable yet — keep it out of guest and
    // booking-wizard listings until an admin prices it under "Venue prices".
    const hasRegular = defaultRates.some((r) => r.season === 'Regular' && Number(r.rate) > 0);
    if (!hasRegular) continue;

    const groupKey = facility.facility_group || 'Facilities';
    if (!byGroup.has(groupKey)) {
      byGroup.set(groupKey, {
        category: groupKey,
        icon: facility.icon || FACILITY_GROUP_ICONS[groupKey] || 'place',
        items: [],
      });
    }
    byGroup.get(groupKey).items.push({
      id: facility.rates[0]?.id ?? facility.id,
      facility_id: facility.id,
      name: facility.name,
      room_code: facility.room_code,
      description: facility.description,
      package_name: facility.package_name,
      label: facility.label,
      item: facility.item,
      capacity_min: facility.capacity_min,
      capacity_max: facility.capacity_max,
      min_hours: facility.min_hours,
      hourly_rate: facility.hourly_rate,
      inclusions: facility.inclusions,
      policies: facility.policies,
      preview_images: facility.preview_images || [],
      rates: defaultRates,
    });
  }

  return [...byGroup.values()];
}

export async function getFacilityById(facilityId) {
  const [rows] = await pool.query('SELECT * FROM facilities WHERE id = ? LIMIT 1', [facilityId]);
  return rows[0] || null;
}

export async function getFacilityByRoomCode(roomCode) {
  const [rows] = await pool.query('SELECT * FROM facilities WHERE room_code = ? LIMIT 1', [roomCode]);
  return rows[0] || null;
}

export async function getFacilityByLegacyKeys(category, item) {
  const [byRoom] = await pool.query(
    'SELECT * FROM facilities WHERE room_code = ? LIMIT 1',
    [item]
  );
  if (byRoom.length) return byRoom[0];

  const [rows] = await pool.query(
    `SELECT * FROM facilities
     WHERE (facility_group = ? OR name = ?)
       AND (package_name = ? OR (package_name IS NULL AND name = ?))
     LIMIT 1`,
    [category, category, item, item]
  );
  return rows[0] || null;
}
