import { pool } from '../config/db.js';
import { isEmpty } from '../utils/helpers.js';
import {
  EXTRA_SERVICE_CATEGORIES,
  EXTRA_SERVICE_SEASONS,
  MEAL_TYPES,
  ACCOMMODATION_EXTRAS_CATEGORY,
  PER_PERSON_NIGHT_ITEM,
} from '../constants/ancillary.js';
import {
  ROOM_RATE_SEASONS,
  normalizeRoomRateItemName,
  ROOM_RATE_ITEM_MAX_LENGTH,
} from '../constants/rooms.js';
import {
  DEFAULT_EXTRA_BILLING_UNIT,
  DEFAULT_MEAL_BILLING_UNIT,
  DEFAULT_ROOM_BILLING_UNIT,
  normalizeRateVariant,
  DEFAULT_FACILITY_BILLING_UNIT,
} from '../constants/rateVariants.js';
import {
  fetchExtraServiceRows,
  fetchMealRateRows,
  groupDefaultMealRows,
  groupDefaultServiceRows,
  groupMealRows,
  groupServiceRows,
  getRoomRateGroups,
} from '../services/ancillary.service.js';
import { bustCatalogAndFacilities } from '../utils/cache.js';

export const getMealRatesCatalog = async (req, res) => {
  try {
    const rows = await fetchMealRateRows();
    res.status(200).json({ meals: groupDefaultMealRows(rows) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getExtraServicesCatalog = async (req, res) => {
  try {
    const rows = await fetchExtraServiceRows();
    res.status(200).json({ services: groupDefaultServiceRows(rows) });
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

function parseRoomRateRows(body = {}) {
  if (Array.isArray(body.rows) && body.rows.length) {
    return body.rows.map((row) => ({
      item: normalizeRoomRateItemName(row.item),
      rates: Array.isArray(row.rates) ? row.rates : [],
      ...normalizeRateVariant(row, { billing_unit: DEFAULT_ROOM_BILLING_UNIT }),
    }));
  }

  if (!Array.isArray(body.rates)) return [];

  const grouped = new Map();
  for (const entry of body.rates) {
    const item = normalizeRoomRateItemName(entry.item);
    const season = String(entry.season || '').trim();
    if (!item || !season) continue;
    if (!grouped.has(item)) grouped.set(item, []);
    grouped.get(item).push({ season, rate: entry.rate });
  }

  return [...grouped.entries()].map(([item, rates]) => ({
    item,
    rates,
    ...normalizeRateVariant({}, { billing_unit: DEFAULT_ROOM_BILLING_UNIT }),
  }));
}

/** Bulk save the season x item price matrix for one room tier. */
export const saveRoomRates = async (req, res) => {
  try {
    const roomType = String(req.body.room_type || '').trim();
    const rowDefs = parseRoomRateRows(req.body);

    if (!roomType) return res.status(400).json({ message: 'A room type is required.' });
    if (roomType.length > 100) return res.status(400).json({ message: 'Room type name is too long.' });

    const isDorm = roomType === 'Dorm';
    const audienceScope = String(req.body.audience || '').trim() || null;

    if (isDorm) {
      const dormRow = rowDefs[0] || {
        item: PER_PERSON_NIGHT_ITEM,
        rates: [],
        audience: audienceScope || 'Guest',
        age_band: 'Adult',
        currency: 'PHP',
        billing_unit: 'per night',
        notes: null,
      };
      if (audienceScope) dormRow.audience = audienceScope;
      if (normalizeRoomRateItemName(dormRow.item) !== PER_PERSON_NIGHT_ITEM) {
        return res.status(400).json({ message: `Dorm pricing must use "${PER_PERSON_NIGHT_ITEM}".` });
      }

      for (const season of ROOM_RATE_SEASONS) {
        const entry = dormRow.rates.find((r) => String(r.season || '').trim() === season) || { rate: null };
        const hasRate = entry.rate != null && String(entry.rate).trim() !== '';
        const rate = Number(entry.rate);
        if (hasRate && (!Number.isFinite(rate) || rate <= 0)) {
          return res.status(400).json({ message: 'Prices must be greater than 0.' });
        }

        if (hasRate) {
          await pool.query(
            `INSERT INTO rates_extra_services (category, item, season, rate, audience, age_band, currency, billing_unit, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               rate = VALUES(rate),
               audience = VALUES(audience),
               age_band = VALUES(age_band),
               currency = VALUES(currency),
               billing_unit = VALUES(billing_unit),
               notes = VALUES(notes)`,
            [
              ACCOMMODATION_EXTRAS_CATEGORY,
              PER_PERSON_NIGHT_ITEM,
              season,
              rate,
              dormRow.audience,
              dormRow.age_band,
              dormRow.currency,
              dormRow.billing_unit,
              dormRow.notes,
            ]
          );
        } else {
          await pool.query(
            `DELETE FROM rates_extra_services
             WHERE category = ? AND item = ? AND season = ? AND audience = ?`,
            [ACCOMMODATION_EXTRAS_CATEGORY, PER_PERSON_NIGHT_ITEM, season, dormRow.audience]
          );
        }
      }

      bustCatalogAndFacilities();
      return res.status(200).json({ message: 'Room prices saved', room_rates: await getRoomRateGroups() });
    }

    if (!rowDefs.length) {
      if (audienceScope) {
        await pool.query('DELETE FROM rates_rooms WHERE room_type = ? AND audience = ?', [roomType, audienceScope]);
        bustCatalogAndFacilities();
        return res.status(200).json({ message: 'Room prices saved', room_rates: await getRoomRateGroups() });
      }
      return res.status(400).json({ message: 'Add at least one price row.' });
    }

    const seenItems = new Set();
    const normalizedRows = [];

    for (const row of rowDefs) {
      const item = normalizeRoomRateItemName(row.item);
      if (!item) {
        return res.status(400).json({ message: 'Every price row needs a name.' });
      }
      if (item.length > ROOM_RATE_ITEM_MAX_LENGTH) {
        return res.status(400).json({ message: `Price row names must be ${ROOM_RATE_ITEM_MAX_LENGTH} characters or fewer.` });
      }
      const variantKey = [item, row.audience, row.age_band, row.currency, row.billing_unit].join('\x1f');
      if (seenItems.has(variantKey)) {
        return res.status(400).json({ message: `Duplicate price row: "${item}" with the same variant details.` });
      }
      seenItems.add(variantKey);

      const cells = [];
      for (const season of ROOM_RATE_SEASONS) {
        const entry = row.rates.find((r) => String(r.season || '').trim() === season) || { rate: null };
        const hasRate = entry.rate != null && String(entry.rate).trim() !== '';
        const rate = Number(entry.rate);
        if (hasRate && (!Number.isFinite(rate) || rate <= 0)) {
          return res.status(400).json({ message: 'Prices must be greater than 0 (leave blank to skip).' });
        }
        cells.push({ season, rate: hasRate ? rate : null });
      }

      if (!cells.some((cell) => cell.rate != null)) {
        return res.status(400).json({ message: `Add at least one price for "${item}", or remove the row.` });
      }

      normalizedRows.push({
        item,
        cells,
        audience: row.audience,
        age_band: row.age_band,
        currency: row.currency,
        billing_unit: row.billing_unit,
        notes: row.notes,
      });
    }

    const audiencesToReplace = audienceScope
      ? [audienceScope]
      : [...new Set(normalizedRows.map((row) => row.audience))];

    for (const aud of audiencesToReplace) {
      await pool.query('DELETE FROM rates_rooms WHERE room_type = ? AND audience = ?', [roomType, aud]);
    }

    for (const row of normalizedRows) {
      for (const { season, rate } of row.cells) {
        if (rate == null) continue;
        await pool.query(
          `INSERT INTO rates_rooms (room_type, item, season, rate, audience, age_band, currency, billing_unit, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             rate = VALUES(rate),
             audience = VALUES(audience),
             age_band = VALUES(age_band),
             currency = VALUES(currency),
             billing_unit = VALUES(billing_unit),
             notes = VALUES(notes)`,
          [roomType, row.item, season, rate, row.audience, row.age_band, row.currency, row.billing_unit, row.notes]
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
    const variant = normalizeRateVariant(req.body, { billing_unit: DEFAULT_MEAL_BILLING_UNIT });

    if (!MEAL_TYPES.includes(mealType)) {
      return res.status(400).json({ message: 'Invalid meal type' });
    }
    if (!rate || rate <= 0) {
      return res.status(400).json({ message: 'rate must be greater than 0' });
    }

    const [result] = await pool.query(
      `INSERT INTO rates_meals (meal_type, rate, audience, age_band, currency, billing_unit, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [mealType, rate, variant.audience, variant.age_band, variant.currency, variant.billing_unit, variant.notes]
    );

    const [rows] = await pool.query('SELECT * FROM rates_meals WHERE id = ?', [result.insertId]);
    const row = rows[0];
    bustCatalogAndFacilities();
    res.status(201).json({
      message: 'Meal price created',
      meal: row,
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
    const variant = normalizeRateVariant(req.body, { billing_unit: DEFAULT_MEAL_BILLING_UNIT });

    if (!isEmpty(mealType) && !MEAL_TYPES.includes(mealType)) {
      return res.status(400).json({ message: 'Invalid meal type' });
    }
    if (rate != null && rate <= 0) {
      return res.status(400).json({ message: 'rate must be greater than 0' });
    }

    await pool.query(
      `UPDATE rates_meals SET
        meal_type = COALESCE(?, meal_type),
        rate = COALESCE(?, rate),
        audience = COALESCE(?, audience),
        age_band = COALESCE(?, age_band),
        currency = COALESCE(?, currency),
        billing_unit = COALESCE(?, billing_unit),
        notes = ?
       WHERE id = ?`,
      [mealType || null, rate, variant.audience, variant.age_band, variant.currency, variant.billing_unit, variant.notes, req.params.id]
    );

    const [rows] = await pool.query('SELECT * FROM rates_meals WHERE id = ?', [req.params.id]);
    const row = rows[0];
    bustCatalogAndFacilities();
    res.status(200).json({
      message: 'Meal price updated',
      meal: row,
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
    const variant = normalizeRateVariant(req.body, {
      billing_unit: category === ACCOMMODATION_EXTRAS_CATEGORY ? 'per night' : DEFAULT_EXTRA_BILLING_UNIT,
    });

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
      `INSERT INTO rates_extra_services
         (category, item, season, rate, audience, age_band, currency, billing_unit, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [category, item, season, rate, variant.audience, variant.age_band, variant.currency, variant.billing_unit, variant.notes]
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
    const variant = normalizeRateVariant(req.body, {
      billing_unit: req.body.category === ACCOMMODATION_EXTRAS_CATEGORY ? 'per night' : DEFAULT_EXTRA_BILLING_UNIT,
    });

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
        rate = COALESCE(?, rate),
        audience = COALESCE(?, audience),
        age_band = COALESCE(?, age_band),
        currency = COALESCE(?, currency),
        billing_unit = COALESCE(?, billing_unit),
        notes = ?
       WHERE id = ?`,
      [category || null, item || null, season || null, rate ?? null, variant.audience, variant.age_band, variant.currency, variant.billing_unit, variant.notes, req.params.id]
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
