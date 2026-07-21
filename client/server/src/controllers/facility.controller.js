/**
 * REST handlers for venues/facilities and their rates (/api/facilities).
 *
 * Covers the guest-facing catalog (grouped venues with rates), the admin
 * venue CRUD (via venueAdmin.service.js), seasonal rate resolution, and the
 * facility photo pipeline (facilityImage.service.js -> facilities.preview_images).
 * Uploaded photos are the source of truth; hardcoded client images are fallback.
 */
import { pool } from '../config/db.js';
import { isEmpty } from '../utils/helpers.js';
import {
  fetchExtraServiceRows,
  fetchMealRateRows,
  groupDefaultMealRows,
  groupDefaultServiceRows,
  filterGuestBookableServiceGroups,
} from '../services/ancillary.service.js';
import {
  fetchFacilitiesWithRates,
  getFacilityByRoomCode,
  getFacilityByLegacyKeys,
  groupFacilitiesForOverview,
} from '../services/facilityCatalog.service.js';
import {
  resolveVenueFacilityRow,
  resolveVenueFacilityRowByFacilityId,
  venueRateMeta,
} from '../services/facility.service.js';
import {
  DEFAULT_FACILITY_BILLING_UNIT,
  normalizeRateVariant,
} from '../constants/rateVariants.js';
import {
  listAdminVenues,
  saveAdminVenue,
  deleteAdminVenue,
  deleteAdminVenueFunction,
} from '../services/venueAdmin.service.js';
import { resolveLodgingSeasonForDate } from '../services/season.service.js';
import { bustCatalogAndFacilities } from '../utils/cache.js';
import { isAdminPortalRole } from '../utils/constants.js';
import {
  parseFacilityPreviewImages,
  processFacilityImageUpload,
  deleteFacilityImageFile,
  unlinkFacilityImagePath,
  replaceFacilityImageFile,
  sanitizeFacilityImageFilename,
  facilityPreviewImagesForMysql,
  FACILITY_IMAGE_MAX_COUNT,
} from '../services/facilityImage.service.js';

const VALID_SEASONS = ['Regular', 'Peak', 'N/A'];

async function fetchFacilityRecord(id) {
  const [rows] = await pool.query('SELECT * FROM facilities WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

/** Keep gallery JSON identical across uses of the same physical venue. */
async function syncVenueSiblingPreviewImages(facility, previewImages) {
  const payload = facilityPreviewImagesForMysql(previewImages);
  if (payload == null) {
    await pool.query(
      `UPDATE facilities SET preview_images = NULL
       WHERE name <=> ? AND room_code <=> ? AND facility_group <=> ?`,
      [facility.name, facility.room_code, facility.facility_group],
    );
    return;
  }
  await pool.query(
    `UPDATE facilities SET preview_images = CAST(? AS JSON)
     WHERE name <=> ? AND room_code <=> ? AND facility_group <=> ?`,
    [payload, facility.name, facility.room_code, facility.facility_group],
  );
}

async function venuePayloadForFacility(facilityId) {
  const venues = await listAdminVenues();
  return venues.find((v) => (v.functions || []).some((f) => Number(f.facility_id) === Number(facilityId))) || null;
}

/** Admin facilities page: venues, meals, and add-on services. */
export const getFacilitiesOverview = async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const [facilities, mealRows, extraRows, active_lodging_season] = await Promise.all([
      fetchFacilitiesWithRates(),
      fetchMealRateRows(),
      fetchExtraServiceRows(),
      resolveLodgingSeasonForDate(today),
    ]);

    const allServices = groupDefaultServiceRows(extraRows);
    const services = isAdminPortalRole(req.user?.role)
      ? allServices
      : filterGuestBookableServiceGroups(allServices);

    if (!isAdminPortalRole(req.user?.role)) {
      res.setHeader('Cache-Control', 'no-store');
    }

    res.status(200).json({
      venues: groupFacilitiesForOverview(facilities),
      facilities,
      meals: groupDefaultMealRows(mealRows),
      services,
      active_lodging_season,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** Venues only — guest browse and booking. */
export const getVenueFacilities = async (req, res) => {
  try {
    const facilities = await fetchFacilitiesWithRates();
    // Avoid stale guest cards after admin photo uploads (server cache is also busted).
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      venues: groupFacilitiesForOverview(facilities),
      facilities,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** Resolved venue rate for a bookable space on a specific date. */
export const getVenueRateQuote = async (req, res) => {
  try {
    const { category, item, date, facility_id, event_venue_id, room_code } = req.query;
    const catalogId = facility_id || event_venue_id;

    if (isEmpty(date)) {
      return res.status(400).json({ message: 'date is required' });
    }

    let row = null;
    if (!isEmpty(catalogId)) {
      row = await resolveVenueFacilityRowByFacilityId(Number(catalogId), date);
    } else if (!isEmpty(room_code)) {
      const facility = await getFacilityByRoomCode(room_code);
      if (facility) row = await resolveVenueFacilityRowByFacilityId(facility.id, date);
    } else if (!isEmpty(category) && !isEmpty(item)) {
      row = await resolveVenueFacilityRow(category, item, date);
    } else {
      return res.status(400).json({ message: 'facility_id, room_code, or category and item are required' });
    }

    if (!row) {
      return res.status(404).json({ message: 'Venue space not found' });
    }

    res.status(200).json({
      rate_id: row.rate_id,
      facility_id: row.facility_id,
      name: row.name,
      room_code: row.room_code,
      description: row.description,
      label: row.label,
      category: row.facility_group || row.category,
      item: row.room_code || row.item,
      rate: row.rate,
      season: row.season,
      calendar_season: row.calendar_season,
      capacity_min: row.capacity_min,
      capacity_max: row.capacity_max,
      inclusions: row.inclusions,
      policies: row.policies,
      ...venueRateMeta(row),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** Admin "Manage venues": grouped venues, each with its uses and prices. */
export const getAdminVenues = async (req, res) => {
  try {
    const venues = await listAdminVenues();
    res.status(200).json({ venues });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

/** Create or update a venue and its uses in one payload. */
export const saveVenue = async (req, res) => {
  try {
    const result = await saveAdminVenue(req.body);
    const venues = await listAdminVenues();
    res.status(200).json({ ...result, venues });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

/** Delete an entire venue (all of its uses). */
export const removeVenue = async (req, res) => {
  try {
    const ids = req.body?.function_ids || req.body?.facility_ids || [];
    const result = await deleteAdminVenue(ids);
    const venues = await listAdminVenues();
    res.status(200).json({ ...result, venues });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

/** Delete a single use of a venue. */
export const removeVenueFunction = async (req, res) => {
  try {
    const result = await deleteAdminVenueFunction(req.params.id);
    const venues = await listAdminVenues();
    res.status(200).json({ ...result, venues });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

export const getAllFacilities = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT f.*,
              rf.id AS rate_id, rf.season, rf.rate
       FROM facilities f
       LEFT JOIN rates_facilities rf ON rf.facility_id = f.id
       ORDER BY f.facility_group ASC, f.room_code ASC, rf.season ASC`
    );
    res.status(200).json({ facilities: rows });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getFacilityById = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM facilities WHERE id = ? LIMIT 1', [req.params.id]);
    if (!rows.length) {
      return res.status(404).json({ message: 'Facility not found' });
    }
    const [rates] = await pool.query(
      'SELECT * FROM rates_facilities WHERE facility_id = ? ORDER BY FIELD(season, \'Regular\', \'Peak\', \'N/A\')',
      [req.params.id]
    );
    res.status(200).json({ facility: rows[0], rates });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** Create or update a seasonal facility rate row. */
export const createFacility = async (req, res) => {
  try {
    let { facility_id, category, item, season, rate } = req.body;
    const variant = normalizeRateVariant(req.body, { billing_unit: DEFAULT_FACILITY_BILLING_UNIT });

    if (isEmpty(facility_id) && !isEmpty(category) && !isEmpty(item)) {
      const facility = await getFacilityByLegacyKeys(category, item);
      facility_id = facility?.id;
    }

    if (isEmpty(facility_id) || isEmpty(rate)) {
      return res.status(400).json({ message: 'facility_id and rate are required' });
    }

    const finalSeason = season || 'Regular';
    if (!VALID_SEASONS.includes(finalSeason)) {
      return res.status(400).json({ message: 'Invalid season value' });
    }

    if (Number(rate) <= 0) {
      return res.status(400).json({ message: 'rate must be greater than 0' });
    }

    const [facility] = await pool.query('SELECT id FROM facilities WHERE id = ? LIMIT 1', [facility_id]);
    if (!facility.length) {
      return res.status(404).json({ message: 'Facility not found' });
    }

    const [result] = await pool.query(
      `INSERT INTO rates_facilities (facility_id, season, rate, audience, age_band, currency, billing_unit, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [facility_id, finalSeason, rate, variant.audience, variant.age_band, variant.currency, variant.billing_unit, variant.notes]
    );

    const [rows] = await pool.query('SELECT * FROM rates_facilities WHERE id = ?', [result.insertId]);
    bustCatalogAndFacilities();
    res.status(201).json({ message: 'Facility rate created', rate: rows[0] });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'A rate already exists for this facility and season' });
    }
    res.status(500).json({ message: error.message });
  }
};

export const updateFacility = async (req, res) => {
  try {
    const [existing] = await pool.query('SELECT * FROM rates_facilities WHERE id = ? LIMIT 1', [req.params.id]);
    if (!existing.length) {
      return res.status(404).json({ message: 'Facility rate not found' });
    }

    const { season, rate } = req.body;
    const variant = normalizeRateVariant(req.body, { billing_unit: DEFAULT_FACILITY_BILLING_UNIT });

    if (!isEmpty(season) && !VALID_SEASONS.includes(season)) {
      return res.status(400).json({ message: 'Invalid season value' });
    }

    if (!isEmpty(rate) && Number(rate) <= 0) {
      return res.status(400).json({ message: 'rate must be greater than 0' });
    }

    await pool.query(
      `UPDATE rates_facilities SET
        season = COALESCE(?, season),
        rate = COALESCE(?, rate),
        audience = COALESCE(?, audience),
        age_band = COALESCE(?, age_band),
        currency = COALESCE(?, currency),
        billing_unit = COALESCE(?, billing_unit),
        notes = ?
       WHERE id = ?`,
      [season, rate, variant.audience, variant.age_band, variant.currency, variant.billing_unit, variant.notes, req.params.id]
    );

    const [rows] = await pool.query('SELECT * FROM rates_facilities WHERE id = ?', [req.params.id]);
    bustCatalogAndFacilities();
    res.status(200).json({ message: 'Facility rate updated', rate: rows[0] });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'A rate already exists for this facility and season' });
    }
    res.status(500).json({ message: error.message });
  }
};

export const deleteFacility = async (req, res) => {
  try {
    const [existing] = await pool.query('SELECT id FROM rates_facilities WHERE id = ? LIMIT 1', [req.params.id]);
    if (!existing.length) {
      return res.status(404).json({ message: 'Facility rate not found' });
    }

    await pool.query('DELETE FROM rates_facilities WHERE id = ?', [req.params.id]);
    bustCatalogAndFacilities();
    res.status(200).json({ message: 'Facility rate deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const uploadFacilityImagesHandler = async (req, res) => {
  const added = [];
  try {
    const facilityId = Number(req.params.id);
    if (!Number.isInteger(facilityId) || facilityId <= 0) {
      return res.status(400).json({ message: 'Invalid facility id.' });
    }

    const existing = await fetchFacilityRecord(facilityId);
    if (!existing) return res.status(404).json({ message: 'Facility not found' });

    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) return res.status(400).json({ message: 'Choose at least one JPG or PNG image.' });

    const current = parseFacilityPreviewImages(existing.preview_images);
    if (current.length + files.length > FACILITY_IMAGE_MAX_COUNT) {
      return res.status(400).json({
        message: `This venue can have up to ${FACILITY_IMAGE_MAX_COUNT} photos. Remove some before uploading more.`,
      });
    }

    for (const file of files) {
      added.push(await processFacilityImageUpload(file, facilityId));
    }

    const previewImages = [...current, ...added];
    await syncVenueSiblingPreviewImages(existing, previewImages);
    bustCatalogAndFacilities();

    const verifiedRow = await fetchFacilityRecord(facilityId);
    const verified = parseFacilityPreviewImages(verifiedRow?.preview_images);
    console.log(
      `[facilities] uploaded ${added.length} photo(s) facility_id=${facilityId} name=${existing.name} paths=${added.join(',')}`,
    );
    console.log(
      `[facilities] assigned preview_images facility_id=${facilityId} key=${existing.name} count=${verified.length} verified=${JSON.stringify(verified)}`,
    );

    const venue = await venuePayloadForFacility(facilityId);
    const images = verified.length ? verified : previewImages;
    if (venue) venue.preview_images = images;

    res.status(200).json({
      message: added.length === 1 ? 'Photo uploaded' : `${added.length} photos uploaded`,
      preview_images: images,
      venue,
      facility_id: facilityId,
    });
  } catch (error) {
    await Promise.all(added.map((p) => unlinkFacilityImagePath(p).catch(() => {})));
    console.error(`[facilities] upload failed facility=${req.params.id}:`, error.message);
    res.status(400).json({ message: error.message || 'Could not upload photos.' });
  }
};

export const replaceFacilityImageHandler = async (req, res) => {
  let newPath = null;
  try {
    const facilityId = Number(req.params.id);
    if (!Number.isInteger(facilityId) || facilityId <= 0) {
      return res.status(400).json({ message: 'Invalid facility id.' });
    }

    const existing = await fetchFacilityRecord(facilityId);
    if (!existing) return res.status(404).json({ message: 'Facility not found' });

    const file = req.file || (Array.isArray(req.files) ? req.files[0] : null);
    if (!file) return res.status(400).json({ message: 'Choose a JPG or PNG image to replace with.' });

    const safeOld = sanitizeFacilityImageFilename(req.params.filename);
    if (!safeOld) return res.status(400).json({ message: 'Invalid image filename.' });

    const oldPath = `/images/facilities/${facilityId}/${safeOld}`;
    const current = parseFacilityPreviewImages(existing.preview_images);
    if (!current.includes(oldPath)) {
      // Path may live under a sibling primary id — also accept any matching filename in the gallery.
      const byName = current.find((p) => p.endsWith(`/${safeOld}`));
      if (!byName) {
        return res.status(404).json({ message: 'That photo is not on this venue. Refresh and try again.' });
      }
    }

    const matchPath = current.includes(oldPath)
      ? oldPath
      : current.find((p) => p.endsWith(`/${safeOld}`));

    const written = await replaceFacilityImageFile(file, facilityId, safeOld);
    newPath = written.newPath;

    const previewImages = current.map((p) => (p === matchPath ? newPath : p));
    await syncVenueSiblingPreviewImages(existing, previewImages);
    bustCatalogAndFacilities();

    // Prefer deleting from the folder that actually held the old file.
    const oldIdMatch = String(matchPath || '').match(/\/images\/facilities\/(\d+)\//);
    const oldOwnerId = oldIdMatch ? Number(oldIdMatch[1]) : facilityId;
    await deleteFacilityImageFile(oldOwnerId, safeOld).catch((err) => {
      console.warn(`[facilities] old photo cleanup failed facility=${oldOwnerId}:`, err.message);
    });

    console.log(`[facilities] replaced photo facility=${facilityId} ${matchPath} -> ${newPath}`);

    const venue = await venuePayloadForFacility(facilityId);
    res.status(200).json({
      message: 'Photo updated',
      preview_images: previewImages,
      venue,
      facility_id: facilityId,
    });
  } catch (error) {
    if (newPath) await unlinkFacilityImagePath(newPath).catch(() => {});
    console.error(`[facilities] replace failed facility=${req.params.id}:`, error.message);
    res.status(400).json({ message: error.message || 'Could not update photo.' });
  }
};

export const deleteFacilityImageHandler = async (req, res) => {
  try {
    const facilityId = Number(req.params.id);
    if (!Number.isInteger(facilityId) || facilityId <= 0) {
      return res.status(400).json({ message: 'Invalid facility id.' });
    }

    const existing = await fetchFacilityRecord(facilityId);
    if (!existing) return res.status(404).json({ message: 'Facility not found' });

    const safeName = sanitizeFacilityImageFilename(req.params.filename);
    if (!safeName) return res.status(400).json({ message: 'Invalid image filename.' });

    const current = parseFacilityPreviewImages(existing.preview_images);
    const matchPath = current.find((p) => p.endsWith(`/${safeName}`));
    const nextImages = current.filter((p) => p !== matchPath);

    await syncVenueSiblingPreviewImages(existing, nextImages);
    bustCatalogAndFacilities();

    if (matchPath) {
      const ownerMatch = matchPath.match(/\/images\/facilities\/(\d+)\//);
      const ownerId = ownerMatch ? Number(ownerMatch[1]) : facilityId;
      await deleteFacilityImageFile(ownerId, safeName).catch((err) => {
        console.warn(`[facilities] file unlink after DB delete facility=${ownerId}:`, err.message);
      });
    }

    console.log(`[facilities] deleted photo facility=${facilityId} file=${safeName}`);

    const venue = await venuePayloadForFacility(facilityId);
    res.status(200).json({
      message: 'Photo removed',
      preview_images: nextImages,
      venue,
      facility_id: facilityId,
    });
  } catch (error) {
    console.error(`[facilities] delete photo failed facility=${req.params.id}:`, error.message);
    res.status(400).json({ message: error.message || 'Could not remove photo.' });
  }
};
