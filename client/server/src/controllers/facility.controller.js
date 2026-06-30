import { pool } from '../config/db.js';
import { isEmpty } from '../utils/helpers.js';
import {
  fetchExtraServiceRows,
  fetchMealRateRows,
  groupMealRows,
  groupServiceRows,
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
import { resolveLodgingSeasonForDate } from '../services/season.service.js';

const VALID_SEASONS = ['Regular', 'Peak', 'N/A'];

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

    res.status(200).json({
      venues: groupFacilitiesForOverview(facilities),
      facilities,
      meals: groupMealRows(mealRows),
      services: groupServiceRows(extraRows),
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

    const packageLabel = row.package_name || row.item;
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
      ...venueRateMeta(packageLabel, row.rate),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
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
      `INSERT INTO rates_facilities (facility_id, season, rate)
       VALUES (?, ?, ?)`,
      [facility_id, finalSeason, rate]
    );

    const [rows] = await pool.query('SELECT * FROM rates_facilities WHERE id = ?', [result.insertId]);
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

    if (!isEmpty(season) && !VALID_SEASONS.includes(season)) {
      return res.status(400).json({ message: 'Invalid season value' });
    }

    if (!isEmpty(rate) && Number(rate) <= 0) {
      return res.status(400).json({ message: 'rate must be greater than 0' });
    }

    await pool.query(
      `UPDATE rates_facilities SET
        season = COALESCE(?, season),
        rate = COALESCE(?, rate)
       WHERE id = ?`,
      [season, rate, req.params.id]
    );

    const [rows] = await pool.query('SELECT * FROM rates_facilities WHERE id = ?', [req.params.id]);
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
    res.status(200).json({ message: 'Facility rate deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
