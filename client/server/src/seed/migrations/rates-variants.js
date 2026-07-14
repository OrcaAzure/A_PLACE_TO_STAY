import { pool } from '../../config/db.js';
import { tableExists } from '../helpers.js';

const ensureRateVariantColumns = async (table, defaults = {}) => {
  const audienceDefault = defaults.audience || 'Guest';
  const ageBandDefault = defaults.age_band || 'Adult';
  const currencyDefault = defaults.currency || 'PHP';
  const billingDefault = defaults.billing_unit || 'per item';

  try { await pool.execute(`ALTER TABLE ${table} ADD COLUMN audience VARCHAR(80) NOT NULL DEFAULT '${audienceDefault}' AFTER rate`); } catch {}
  try { await pool.execute(`ALTER TABLE ${table} ADD COLUMN age_band VARCHAR(40) NOT NULL DEFAULT '${ageBandDefault}' AFTER audience`); } catch {}
  try { await pool.execute(`ALTER TABLE ${table} ADD COLUMN currency VARCHAR(8) NOT NULL DEFAULT '${currencyDefault}' AFTER age_band`); } catch {}
  try { await pool.execute(`ALTER TABLE ${table} ADD COLUMN billing_unit VARCHAR(40) NOT NULL DEFAULT '${billingDefault}' AFTER currency`); } catch {}
  try { await pool.execute(`ALTER TABLE ${table} ADD COLUMN notes VARCHAR(255) NULL DEFAULT NULL AFTER billing_unit`); } catch {}
};

const migrateRateVariantKey = async (table, { indexName, keyColumns }) => {
  if (!(await tableExists(table))) return;

  try { await pool.execute(`ALTER TABLE ${table} DROP INDEX ${indexName}`); } catch {}
  try {
    await pool.execute(`ALTER TABLE ${table} ADD UNIQUE KEY ${indexName} (${keyColumns})`);
  } catch (err) {
    if (!/Duplicate key name/i.test(err.message)) throw err;
  }
};

/** audience/age_band/currency/billing_unit helpers + unique-key rebuilds. */
export async function runRatesVariantsMigration() {
  try {
    await ensureRateVariantColumns('rates_rooms', { billing_unit: 'per night' });
    await migrateRateVariantKey('rates_rooms', {
      indexName: 'uq_room_rate',
      keyColumns: 'room_type(64), item(64), season, audience(32), age_band(16), currency(8), billing_unit(32)',
    });
  } catch (err) {
    console.warn('[schema] rates_rooms variant index migration skipped:', err.message);
  }

  try {
    await ensureRateVariantColumns('rates_meals', { billing_unit: 'per meal' });
    await pool.execute(`ALTER TABLE rates_meals DROP INDEX uq_meal_type`);
  } catch {}
  try {
    await pool.execute(`
      ALTER TABLE rates_meals
      ADD UNIQUE KEY uq_meal_type (meal_type, audience, age_band, currency, billing_unit)
    `);
  } catch (err) {
    console.warn('[schema] rates_meals variant index migration skipped:', err.message);
  }

  try {
    await ensureRateVariantColumns('rates_extra_services', { billing_unit: 'per item' });
    await migrateRateVariantKey('rates_extra_services', {
      indexName: 'uq_extra_service',
      keyColumns: 'category(32), item(64), season, audience(32), age_band(16), currency(8), billing_unit(32)',
    });
  } catch (err) {
    console.warn('[schema] rates_extra_services variant index migration skipped:', err.message);
  }
  try {
    await pool.execute(`
      UPDATE rates_extra_services
      SET billing_unit = 'per night'
      WHERE category = 'Accommodation Extras'
        AND (billing_unit IS NULL OR billing_unit = '' OR billing_unit = 'per item')
    `);
  } catch (err) {
    console.warn('[schema] rates_extra_services billing unit normalization skipped:', err.message);
  }

  try {
    await ensureRateVariantColumns('rates_facilities', { billing_unit: 'per segment' });
    await pool.execute(`ALTER TABLE rates_facilities DROP INDEX uq_facility_rate`);
  } catch {}
  try {
    await pool.execute(`
      ALTER TABLE rates_facilities
      ADD UNIQUE KEY uq_facility_rate (facility_id, season, audience, age_band, currency, billing_unit)
    `);
  } catch (err) {
    console.warn('[schema] rates_facilities variant index migration skipped:', err.message);
  }
}
