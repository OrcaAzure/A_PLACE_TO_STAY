import { pool } from '../config/db.js';
import { isEmpty } from '../utils/helpers.js';
import {
  EXTRA_SERVICE_CATEGORIES,
  EXTRA_SERVICE_SEASONS,
  MEAL_TYPES,
  ACCOMMODATION_EXTRAS_CATEGORY,
  PER_PERSON_NIGHT_ITEM,
} from '../constants/ancillary.js';
import { ROOM_RATE_ITEMS, ROOM_RATE_SEASONS } from '../constants/rooms.js';
import {
  fetchExtraServiceRows,
  fetchMealRateRows,
  groupMealRows,
  groupServiceRows,
  getRoomRateGroups,
} from '../services/ancillary.service.js';
import { bustCatalogAndFacilities } from '../utils/cache.js';

export const getMealRatesCatalog = async (req, res) => {
  try {
    const rows = await fetchMealRateRows();
    res.status(200).json({ meals: groupMealRows(rows) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getExtraServicesCatalog = async (req, res) => {
  try {
    const rows = await fetchExtraServiceRows();
    res.status(200).json({ services: groupServiceRows(rows) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getRoomRatesCatalog = async (req, res) => {
  try {
    res.status(200).json({ room_rates: await getRoomRateGroups() });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** Bulk save the season x item price matrix for one room tier. */
export const saveRoomRates = async (req, res) => {
  try {
    const roomType = String(req.body.room_type || '').trim();
    const rates = Array.isArray(req.body.rates) ? req.body.rates : [];

    if (!roomType) return res.status(400).json({ message: 'A room type is required.' });
    if (roomType.length > 100) return res.status(400).json({ message: 'Room type name is too long.' });

    // Dorm is priced per-person-per-night in rates_extra_services (Accommodation Extras),
    // not in rates_rooms. Route its save there so both editors stay in sync.
    const isDorm = roomType === 'Dorm';
    const allowedItems = isDorm ? [PER_PERSON_NIGHT_ITEM] : ROOM_RATE_ITEMS;

    const normalized = [];
    for (const entry of rates) {
      const item = String(entry.item || '').trim();
      const season = String(entry.season || '').trim();
      if (!allowedItems.includes(item)) {
        return res.status(400).json({ message: `Invalid rate type: ${item || '(blank)'}` });
      }
      if (!ROOM_RATE_SEASONS.includes(season)) {
        return res.status(400).json({ message: `Invalid season: ${season || '(blank)'}` });
      }
      const hasRate = entry.rate != null && String(entry.rate).trim() !== '';
      const rate = Number(entry.rate);
      if (hasRate && (!Number.isFinite(rate) || rate <= 0)) {
        return res.status(400).json({ message: 'Prices must be greater than 0.' });
      }
      normalized.push({ item, season, rate: hasRate ? rate : null });
    }

    for (const { item, season, rate } of normalized) {
      if (isDorm) {
        if (rate != null) {
          await pool.query(
            `INSERT INTO rates_extra_services (category, item, season, rate)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE rate = VALUES(rate)`,
            [ACCOMMODATION_EXTRAS_CATEGORY, item, season, rate]
          );
        } else {
          await pool.query(
            'DELETE FROM rates_extra_services WHERE category = ? AND item = ? AND season = ?',
            [ACCOMMODATION_EXTRAS_CATEGORY, item, season]
          );
        }
        continue;
      }

      if (rate != null) {
        await pool.query(
          `INSERT INTO rates_rooms (room_type, item, season, rate)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE rate = VALUES(rate)`,
          [roomType, item, season, rate]
        );
      } else {
        await pool.query(
          'DELETE FROM rates_rooms WHERE room_type = ? AND item = ? AND season = ?',
          [roomType, item, season]
        );
      }
    }

    bustCatalogAndFacilities();
    res.status(200).json({ message: 'Room prices saved', room_rates: await getRoomRateGroups() });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createMealRate = async (req, res) => {
  try {
    const mealType = (req.body.item || req.body.meal_type || '').trim();
    const rate = Number(req.body.rate);

    if (!MEAL_TYPES.includes(mealType)) {
      return res.status(400).json({ message: 'Invalid meal type' });
    }
    if (!rate || rate <= 0) {
      return res.status(400).json({ message: 'rate must be greater than 0' });
    }

    const [result] = await pool.query(
      'INSERT INTO rates_meals (meal_type, rate) VALUES (?, ?)',
      [mealType, rate]
    );

    const [rows] = await pool.query('SELECT id, meal_type, rate FROM rates_meals WHERE id = ?', [result.insertId]);
    const row = rows[0];
    bustCatalogAndFacilities();
    res.status(201).json({
      message: 'Meal price created',
      meal: { id: row.id, item: row.meal_type, rate: Number(row.rate) },
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Meal price already exists for this type' });
    }
    res.status(500).json({ message: error.message });
  }
};

export const updateMealRate = async (req, res) => {
  try {
    const [existing] = await pool.query('SELECT * FROM rates_meals WHERE id = ? LIMIT 1', [req.params.id]);
    if (!existing.length) {
      return res.status(404).json({ message: 'Meal price not found' });
    }

    const mealType = req.body.item || req.body.meal_type;
    const rate = req.body.rate != null ? Number(req.body.rate) : null;

    if (!isEmpty(mealType) && !MEAL_TYPES.includes(mealType)) {
      return res.status(400).json({ message: 'Invalid meal type' });
    }
    if (rate != null && rate <= 0) {
      return res.status(400).json({ message: 'rate must be greater than 0' });
    }

    await pool.query(
      `UPDATE rates_meals SET
        meal_type = COALESCE(?, meal_type),
        rate = COALESCE(?, rate)
       WHERE id = ?`,
      [mealType || null, rate, req.params.id]
    );

    const [rows] = await pool.query('SELECT id, meal_type, rate FROM rates_meals WHERE id = ?', [req.params.id]);
    const row = rows[0];
    bustCatalogAndFacilities();
    res.status(200).json({
      message: 'Meal price updated',
      meal: { id: row.id, item: row.meal_type, rate: Number(row.rate) },
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Meal price already exists for this type' });
    }
    res.status(500).json({ message: error.message });
  }
};

export const deleteMealRate = async (req, res) => {
  try {
    const [existing] = await pool.query('SELECT id FROM rates_meals WHERE id = ? LIMIT 1', [req.params.id]);
    if (!existing.length) {
      return res.status(404).json({ message: 'Meal price not found' });
    }
    await pool.query('DELETE FROM rates_meals WHERE id = ?', [req.params.id]);
    bustCatalogAndFacilities();
    res.status(200).json({ message: 'Meal price deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createExtraService = async (req, res) => {
  try {
    const category = (req.body.category || '').trim();
    const item = (req.body.item || '').trim();
    const season = (req.body.season || 'N/A').trim();
    const rate = Number(req.body.rate);

    if (isEmpty(category) || isEmpty(item) || !rate || rate <= 0) {
      return res.status(400).json({ message: 'category, item, and rate are required' });
    }
    if (!EXTRA_SERVICE_CATEGORIES.includes(category)) {
      return res.status(400).json({ message: 'Invalid service category' });
    }
    if (!EXTRA_SERVICE_SEASONS.includes(season)) {
      return res.status(400).json({ message: 'Invalid season' });
    }

    const [result] = await pool.query(
      'INSERT INTO rates_extra_services (category, item, season, rate) VALUES (?, ?, ?, ?)',
      [category, item, season, rate]
    );

    const [rows] = await pool.query('SELECT * FROM rates_extra_services WHERE id = ?', [result.insertId]);
    bustCatalogAndFacilities();
    res.status(201).json({ message: 'Extra service created', service: rows[0] });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'This extra service already exists' });
    }
    res.status(500).json({ message: error.message });
  }
};

export const updateExtraService = async (req, res) => {
  try {
    const [existing] = await pool.query('SELECT * FROM rates_extra_services WHERE id = ? LIMIT 1', [req.params.id]);
    if (!existing.length) {
      return res.status(404).json({ message: 'Extra service not found' });
    }

    const { category, item, season, rate } = req.body;

    if (!isEmpty(category) && !EXTRA_SERVICE_CATEGORIES.includes(category)) {
      return res.status(400).json({ message: 'Invalid service category' });
    }
    if (!isEmpty(season) && !EXTRA_SERVICE_SEASONS.includes(String(season).trim())) {
      return res.status(400).json({ message: 'Invalid season' });
    }
    if (!isEmpty(rate) && Number(rate) <= 0) {
      return res.status(400).json({ message: 'rate must be greater than 0' });
    }

    await pool.query(
      `UPDATE rates_extra_services SET
        category = COALESCE(?, category),
        item = COALESCE(?, item),
        season = COALESCE(?, season),
        rate = COALESCE(?, rate)
       WHERE id = ?`,
      [category || null, item || null, season || null, rate ?? null, req.params.id]
    );

    const [rows] = await pool.query('SELECT * FROM rates_extra_services WHERE id = ?', [req.params.id]);
    bustCatalogAndFacilities();
    res.status(200).json({ message: 'Extra service updated', service: rows[0] });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'This extra service already exists' });
    }
    res.status(500).json({ message: error.message });
  }
};

export const deleteExtraService = async (req, res) => {
  try {
    const [existing] = await pool.query('SELECT id FROM rates_extra_services WHERE id = ? LIMIT 1', [req.params.id]);
    if (!existing.length) {
      return res.status(404).json({ message: 'Extra service not found' });
    }
    await pool.query('DELETE FROM rates_extra_services WHERE id = ?', [req.params.id]);
    bustCatalogAndFacilities();
    res.status(200).json({ message: 'Extra service deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
