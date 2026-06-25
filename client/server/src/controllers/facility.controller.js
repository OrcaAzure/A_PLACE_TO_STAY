import { pool } from '../config/db.js';
import Facility from '../models/Facility.js';
import { isEmpty } from '../utils/helpers.js';

const VALID_SEASONS = ['Regular', 'Peak', 'N/A'];

const MEAL_CATEGORY = 'Food Service';

const SERVICE_CATEGORIES = new Set([
  MEAL_CATEGORY,
  'Laundry',
  'Laundry-Iron',
  'Corkage Fee',
  'Maid Service',
  'Accommodation Extras',
]);

const CATEGORY_ICONS = {
  Garden: 'park',
  'GMC Chapel': 'church',
  'Burdine Commons': 'groups',
  GMC: 'school',
  'Prayer Mountain': 'landscape',
  'Prayer Tower': 'water_lux',
  'Basketball Court': 'sports_basketball',
  'Childrens Playground': 'child_care',
  'Rec Center': 'fitness_center',
};

const SERVICE_ICONS = {
  Laundry: 'local_laundry_service',
  'Laundry-Iron': 'iron',
  'Corkage Fee': 'restaurant',
  'Maid Service': 'cleaning_services',
  'Accommodation Extras': 'bed',
};

const MEAL_ICONS = {
  Breakfast: 'free_breakfast',
  Lunch: 'lunch_dining',
  Dinner: 'dinner_dining',
  Snack: 'cookie',
};

function groupVenueRows(rows) {
  const byCategory = new Map();

  for (const row of rows) {
    if (SERVICE_CATEGORIES.has(row.category)) continue;

    if (!byCategory.has(row.category)) {
      byCategory.set(row.category, {
        category: row.category,
        icon: CATEGORY_ICONS[row.category] || 'place',
        items: new Map(),
      });
    }

    const group = byCategory.get(row.category);
    const key = row.item;
    if (!group.items.has(key)) {
      group.items.set(key, {
        id: row.id,
        item: row.item,
        capacity_min: row.capacity_min,
        capacity_max: row.capacity_max,
        rates: [],
      });
    }
    group.items.get(key).rates.push({
      id: row.id,
      season: row.season,
      rate: Number(row.rate),
    });
  }

  return [...byCategory.values()].map((venue) => ({
    category: venue.category,
    icon: venue.icon,
    items: [...venue.items.values()],
  }));
}

function groupMealRows(rows) {
  const byItem = new Map();

  for (const row of rows) {
    if (!byItem.has(row.item)) {
      byItem.set(row.item, {
        id: row.id,
        item: row.item,
        icon: MEAL_ICONS[row.item] || 'restaurant',
        rate: Number(row.rate),
      });
    }
  }

  const order = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
  return order.filter((name) => byItem.has(name)).map((name) => byItem.get(name));
}

function groupServiceRows(rows) {
  const byCategory = new Map();

  for (const row of rows) {
    if (row.category === MEAL_CATEGORY) continue;
    if (!SERVICE_CATEGORIES.has(row.category)) continue;

    if (!byCategory.has(row.category)) {
      byCategory.set(row.category, {
        category: row.category,
        icon: SERVICE_ICONS[row.category] || 'add_circle',
        items: [],
      });
    }
    byCategory.get(row.category).items.push({
      id: row.id,
      item: row.item,
      season: row.season,
      rate: Number(row.rate),
    });
  }

  return [...byCategory.values()].map((g) => ({
    category: g.category,
    icon: g.icon,
    items: g.items,
  }));
}

/** Admin facilities page: venues, meals, and add-on services grouped for display. */
export const getFacilitiesOverview = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, category, item, season, rate, capacity_min, capacity_max
       FROM facilities
       ORDER BY category ASC, item ASC,
         FIELD(season, 'Regular', 'Peak', 'N/A') ASC`
    );

    const mealRows = rows.filter((r) => r.category === MEAL_CATEGORY);

    res.status(200).json({
      venues: groupVenueRows(rows),
      meals: groupMealRows(mealRows),
      services: groupServiceRows(rows),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** Backward-compatible — venues only. */
export const getVenueFacilities = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, category, item, season, rate, capacity_min, capacity_max
       FROM facilities
       ORDER BY category ASC, item ASC,
         FIELD(season, 'Regular', 'Peak', 'N/A') ASC`
    );
    res.status(200).json({ venues: groupVenueRows(rows) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getAllFacilities = async (req, res) => {
  try {
    const { category, season } = req.query;

    const conditions = [];
    const params = [];

    if (!isEmpty(category)) {
      conditions.push('category = ?');
      params.push(category);
    }

    if (!isEmpty(season)) {
      conditions.push('season = ?');
      params.push(season);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows] = await pool.query(
      `SELECT * FROM facilities ${whereClause} ORDER BY category ASC, item ASC, season ASC`,
      params
    );

    res.status(200).json({ facilities: rows.map((row) => new Facility(row)) });
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

    res.status(200).json({ facility: new Facility(rows[0]) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createFacility = async (req, res) => {
  try {
    const { category, item, season, rate, capacity_min, capacity_max } = req.body;

    if (isEmpty(category) || isEmpty(item) || isEmpty(rate)) {
      return res.status(400).json({ message: 'category, item, and rate are required' });
    }

    const finalSeason = season || 'N/A';
    if (!VALID_SEASONS.includes(finalSeason)) {
      return res.status(400).json({ message: 'Invalid season value' });
    }

    if (Number(rate) <= 0) {
      return res.status(400).json({ message: 'rate must be greater than 0' });
    }

    if (!isEmpty(capacity_min) && !isEmpty(capacity_max) && Number(capacity_max) < Number(capacity_min)) {
      return res.status(400).json({ message: 'capacity_max must be greater than or equal to capacity_min' });
    }

    const [result] = await pool.query(
      `INSERT INTO facilities (category, item, season, rate, capacity_min, capacity_max)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        category,
        item,
        finalSeason,
        rate,
        isEmpty(capacity_min) ? null : capacity_min,
        isEmpty(capacity_max) ? null : capacity_max,
      ]
    );

    const [rows] = await pool.query('SELECT * FROM facilities WHERE id = ?', [result.insertId]);
    res.status(201).json({ message: 'Facility created', facility: new Facility(rows[0]) });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Facility rate already exists for this category, item, and season' });
    }
    res.status(500).json({ message: error.message });
  }
};

export const updateFacility = async (req, res) => {
  try {
    const [existing] = await pool.query('SELECT * FROM facilities WHERE id = ? LIMIT 1', [req.params.id]);

    if (!existing.length) {
      return res.status(404).json({ message: 'Facility not found' });
    }

    const { category, item, season, rate, capacity_min, capacity_max } = req.body;

    if (!isEmpty(season) && !VALID_SEASONS.includes(season)) {
      return res.status(400).json({ message: 'Invalid season value' });
    }

    if (!isEmpty(rate) && Number(rate) <= 0) {
      return res.status(400).json({ message: 'rate must be greater than 0' });
    }

    if (!isEmpty(capacity_min) && !isEmpty(capacity_max) && Number(capacity_max) < Number(capacity_min)) {
      return res.status(400).json({ message: 'capacity_max must be greater than or equal to capacity_min' });
    }

    await pool.query(
      `UPDATE facilities SET
        category = COALESCE(?, category),
        item = COALESCE(?, item),
        season = COALESCE(?, season),
        rate = COALESCE(?, rate),
        capacity_min = ?,
        capacity_max = ?
       WHERE id = ?`,
      [
        category,
        item,
        season,
        rate,
        Object.prototype.hasOwnProperty.call(req.body, 'capacity_min') ? capacity_min || null : existing[0].capacity_min,
        Object.prototype.hasOwnProperty.call(req.body, 'capacity_max') ? capacity_max || null : existing[0].capacity_max,
        req.params.id,
      ]
    );

    const [rows] = await pool.query('SELECT * FROM facilities WHERE id = ?', [req.params.id]);
    res.status(200).json({ message: 'Facility updated', facility: new Facility(rows[0]) });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Facility rate already exists for this category, item, and season' });
    }
    res.status(500).json({ message: error.message });
  }
};

export const deleteFacility = async (req, res) => {
  try {
    const [existing] = await pool.query('SELECT id FROM facilities WHERE id = ? LIMIT 1', [req.params.id]);

    if (!existing.length) {
      return res.status(404).json({ message: 'Facility not found' });
    }

    await pool.query('DELETE FROM facilities WHERE id = ?', [req.params.id]);
    res.status(200).json({ message: 'Facility deleted' });
  } catch (error) {
    if (error.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ message: 'Cannot delete facility because it has existing bookings' });
    }
    res.status(500).json({ message: error.message });
  }
};