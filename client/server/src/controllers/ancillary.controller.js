import { pool } from '../config/db.js';
import { isEmpty } from '../utils/helpers.js';
import {
  EXTRA_SERVICE_CATEGORIES,
  MEAL_TYPES,
} from '../constants/ancillary.js';
import {
  fetchExtraServiceRows,
  fetchMealRateRows,
  groupMealRows,
  groupServiceRows,
} from '../services/ancillary.service.js';

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
    res.status(200).json({ message: 'Meal price deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createExtraService = async (req, res) => {
  try {
    const category = (req.body.category || '').trim();
    const item = (req.body.item || '').trim();
    const rate = Number(req.body.rate);

    if (isEmpty(category) || isEmpty(item) || !rate || rate <= 0) {
      return res.status(400).json({ message: 'category, item, and rate are required' });
    }
    if (!EXTRA_SERVICE_CATEGORIES.includes(category)) {
      return res.status(400).json({ message: 'Invalid service category' });
    }

    const [result] = await pool.query(
      'INSERT INTO rates_extra_services (category, item, rate) VALUES (?, ?, ?)',
      [category, item, rate]
    );

    const [rows] = await pool.query('SELECT * FROM rates_extra_services WHERE id = ?', [result.insertId]);
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

    const { category, item, rate } = req.body;

    if (!isEmpty(category) && !EXTRA_SERVICE_CATEGORIES.includes(category)) {
      return res.status(400).json({ message: 'Invalid service category' });
    }
    if (!isEmpty(rate) && Number(rate) <= 0) {
      return res.status(400).json({ message: 'rate must be greater than 0' });
    }

    await pool.query(
      `UPDATE rates_extra_services SET
        category = COALESCE(?, category),
        item = COALESCE(?, item),
        rate = COALESCE(?, rate)
       WHERE id = ?`,
      [category || null, item || null, rate ?? null, req.params.id]
    );

    const [rows] = await pool.query('SELECT * FROM rates_extra_services WHERE id = ?', [req.params.id]);
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
    res.status(200).json({ message: 'Extra service deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
