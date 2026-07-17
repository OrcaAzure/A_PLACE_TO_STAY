import { pool } from '../config/db.js';
import { isEmpty } from '../utils/helpers.js';

function normalizeCatalogLabel(value, { max, label }) {
  const name = String(value ?? '').trim();
  if (!name) {
    const err = new Error(`${label} is required.`);
    err.status = 400;
    throw err;
  }
  if (name.length > max) {
    const err = new Error(`${label} must be ${max} characters or fewer.`);
    err.status = 400;
    throw err;
  }
  return name;
}
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

    if (isDorm) {
      const dormRow = rowDefs[0] || {
        item: PER_PERSON_NIGHT_ITEM,
        rates: [],
        ...normalizeRateVariant({}, { billing_unit: 'per night' }),
      };
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

    const audiencesToReplace = [...new Set(normalizedRows.map((row) => row.audience))];

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
    const mealType = normalizeCatalogLabel(
      req.body.item || req.body.meal_type,
      { max: 100, label: 'Meal type' }
    );
    const rate = Number(req.body.rate);
    const variant = normalizeRateVariant(req.body, { billing_unit: DEFAULT_MEAL_BILLING_UNIT });

    if (!rate || rate <= 0) {
      return res.status(400).json({ message: 'rate must be greater than 0' });
    }

    const [result] = await pool.query(
      `INSERT INTO rates_meals (meal_type, rate, audience, age_band, currency, billing_unit, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [mealType, rate, variant.audience, variant.age_band, variant.currency, variant.billing_unit, variant.notes]
    );

    const [rows] = await pool.query(
      `SELECT id, meal_type AS item, meal_type, rate, audience, age_band, currency, billing_unit, notes
       FROM rates_meals WHERE id = ?`,
      [result.insertId]
    );
    const row = rows[0];
    const storedType = String(row?.meal_type ?? '').trim();
    if (!storedType || storedType !== mealType) {
      await pool.query('DELETE FROM rates_meals WHERE id = ?', [result.insertId]);
      return res.status(500).json({
        message:
          'Meal type could not be saved. Restart the server so database migrations can finish, then try again.',
      });
    }
    bustCatalogAndFacilities();
    res.status(201).json({
      message: 'Meal price created',
      meal: row,
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Meal price already exists for this type' });
    }
    res.status(error.status || 500).json({ message: error.message });
  }
};

export const updateMealRate = async (req, res) => {
  try {
    const [existing] = await pool.query('SELECT * FROM rates_meals WHERE id = ? LIMIT 1', [req.params.id]);
    if (!existing.length) {
      return res.status(404).json({ message: 'Meal price not found' });
    }

    const mealType = !isEmpty(req.body.item || req.body.meal_type)
      ? normalizeCatalogLabel(req.body.item || req.body.meal_type, { max: 100, label: 'Meal type' })
      : null;
    const rate = req.body.rate != null ? Number(req.body.rate) : null;
    const variant = normalizeRateVariant(req.body, { billing_unit: DEFAULT_MEAL_BILLING_UNIT });

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

    const [rows] = await pool.query(
      `SELECT id, meal_type AS item, meal_type, rate, audience, age_band, currency, billing_unit, notes
       FROM rates_meals WHERE id = ?`,
      [req.params.id]
    );
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
    res.status(error.status || 500).json({ message: error.message });
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
    const category = normalizeCatalogLabel(req.body.category, { max: 50, label: 'Service type' });
    const item = normalizeCatalogLabel(req.body.item, { max: 100, label: 'Item name' });
    const season = (req.body.season || 'N/A').trim();
    const rate = Number(req.body.rate);
    const variant = normalizeRateVariant(req.body, {
      billing_unit: category === ACCOMMODATION_EXTRAS_CATEGORY ? 'per night' : DEFAULT_EXTRA_BILLING_UNIT,
    });
    const guestVisible = req.body.guest_visible === false || req.body.guest_visible === 0 ? 0 : 1;

    if (!rate || rate <= 0) {
      return res.status(400).json({ message: 'category, item, and rate are required' });
    }
    if (!EXTRA_SERVICE_SEASONS.includes(season)) {
      return res.status(400).json({ message: 'Invalid season' });
    }

    const [result] = await pool.query(
      `INSERT INTO rates_extra_services
         (category, item, season, rate, audience, age_band, currency, billing_unit, notes, guest_visible)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [category, item, season, rate, variant.audience, variant.age_band, variant.currency, variant.billing_unit, variant.notes, guestVisible]
    );

    const [rows] = await pool.query('SELECT * FROM rates_extra_services WHERE id = ?', [result.insertId]);
    bustCatalogAndFacilities();
    res.status(201).json({ message: 'Extra service created', service: rows[0] });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'This extra service already exists' });
    }
    res.status(error.status || 500).json({ message: error.message });
  }
};

export const updateExtraService = async (req, res) => {
  try {
    const [existing] = await pool.query('SELECT * FROM rates_extra_services WHERE id = ? LIMIT 1', [req.params.id]);
    if (!existing.length) {
      return res.status(404).json({ message: 'Extra service not found' });
    }

    const { category, item, season, rate } = req.body;
    const nextCategory = !isEmpty(category)
      ? normalizeCatalogLabel(category, { max: 50, label: 'Service type' })
      : null;
    const nextItem = !isEmpty(item)
      ? normalizeCatalogLabel(item, { max: 100, label: 'Item name' })
      : null;
    const hasVariantFields = ['audience', 'age_band', 'currency', 'billing_unit', 'notes'].some(
      (key) => req.body[key] !== undefined
    );
    const variant = hasVariantFields
      ? normalizeRateVariant(req.body, {
        billing_unit: (nextCategory || existing[0].category) === ACCOMMODATION_EXTRAS_CATEGORY ? 'per night' : DEFAULT_EXTRA_BILLING_UNIT,
      })
      : null;
    const guestVisible = req.body.guest_visible != null
      ? (req.body.guest_visible === false || req.body.guest_visible === 0 ? 0 : 1)
      : null;

    if (guestVisible != null && !nextCategory && !nextItem && rate == null && isEmpty(season) && !hasVariantFields) {
      await pool.query(
        'UPDATE rates_extra_services SET guest_visible = ? WHERE id = ?',
        [guestVisible, req.params.id]
      );
      const [rows] = await pool.query('SELECT * FROM rates_extra_services WHERE id = ?', [req.params.id]);
      bustCatalogAndFacilities();
      return res.status(200).json({ message: 'Extra service updated', service: rows[0] });
    }

    const resolvedVariant = variant || normalizeRateVariant({}, {
      billing_unit: (nextCategory || existing[0].category) === ACCOMMODATION_EXTRAS_CATEGORY ? 'per night' : DEFAULT_EXTRA_BILLING_UNIT,
    });

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
        notes = COALESCE(?, notes),
        guest_visible = COALESCE(?, guest_visible)
       WHERE id = ?`,
      [
        nextCategory,
        nextItem,
        season || null,
        rate ?? null,
        hasVariantFields ? resolvedVariant.audience : null,
        hasVariantFields ? resolvedVariant.age_band : null,
        hasVariantFields ? resolvedVariant.currency : null,
        hasVariantFields ? resolvedVariant.billing_unit : null,
        hasVariantFields ? resolvedVariant.notes : null,
        guestVisible,
        req.params.id,
      ]
    );

    const [rows] = await pool.query('SELECT * FROM rates_extra_services WHERE id = ?', [req.params.id]);
    bustCatalogAndFacilities();
    res.status(200).json({ message: 'Extra service updated', service: rows[0] });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'This extra service already exists' });
    }
    res.status(error.status || 500).json({ message: error.message });
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
