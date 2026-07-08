import { pool } from '../../config/db.js';
import { FISCAL_YEAR_DEFAULTS } from '../../utils/constants.js';
import { ensureInvoiceForBooking, ensureInvoiceForFacilityBooking } from '../../services/payment.service.js';
import { tableExists, columnExists } from '../helpers.js';
import { runTableRenameMigration } from './legacy-renames.js';
import {
  runDeluxeRoomTypeMigration,
  runDormCapacityMigration,
  runSuperiorGuestRoomCapacityMigration,
  runVipRoomMigration,
  runSeasonSettingsMigration,
  runLodgingExtrasMigration,
} from './rooms.js';
import {
  runFacilitiesCatalogMigration,
  runGmcAblockMigration,
  runVenueFieldsMigration,
} from './facilities.js';

export async function runSchemaPatches() {
  try {
    await pool.execute(
      `ALTER TABLE rooms
       MODIFY status ENUM('Available', 'Occupied', 'Dirty', 'Maintenance') NOT NULL DEFAULT 'Available'`
    );
  } catch {
    /* enum may already include Dirty */
  }

  try {
    await pool.execute(
      `CREATE TABLE IF NOT EXISTS payments (
         id         INT AUTO_INCREMENT PRIMARY KEY,
         booking_id INT NOT NULL,
         amount     DECIMAL(10,2) NOT NULL,
         method     ENUM('Cash', 'GCash', 'Bank Transfer') NOT NULL,
         status     ENUM('Pending', 'Paid', 'Failed') NOT NULL DEFAULT 'Pending',
         paid_at    TIMESTAMP NULL DEFAULT NULL,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
         CONSTRAINT fk_payment_booking
           FOREIGN KEY (booking_id) REFERENCES bookings(id)
           ON DELETE RESTRICT
           ON UPDATE CASCADE,
         CONSTRAINT chk_amount CHECK (amount > 0)
       )`
    );
  } catch {
    /* bookings table may not exist yet if schema was not imported */
  }

  try {
    await pool.execute(
      `ALTER TABLE bookings_meals
       MODIFY meal_type ENUM('Breakfast', 'Lunch', 'Dinner', 'Snack') NOT NULL`
    );
  } catch {
    try {
      await pool.execute(
        `ALTER TABLE booking_meals
         MODIFY meal_type ENUM('Breakfast', 'Lunch', 'Dinner', 'Snack') NOT NULL`
      );
    } catch {
      /* column may already include Snack */
    }
  }

  try {
    await pool.execute(
      `ALTER TABLE bookings_rooms
       ADD COLUMN meal_allergen_notes TEXT DEFAULT NULL AFTER contact_phone`
    );
  } catch {
    /* column may already exist */
  }

  try {
    await pool.execute(
      `ALTER TABLE users
       MODIFY role ENUM(
         'Super Admin',
         'Admin',
         'GNC View Only',
         'Supervisory User',
         'GMC',
         'Faculty',
         'Staff',
         'Missionary'
       ) NOT NULL DEFAULT 'Faculty'`
    );
  } catch {
    /* enum may already include new values */
  }

  try {
    await pool.execute(
      `UPDATE users SET role = 'Supervisory User' WHERE role = 'GNC View Only'`
    );
  } catch {
    /* legacy role may not exist */
  }

  try {
    await pool.execute(
      `ALTER TABLE users
       MODIFY role ENUM(
         'Super Admin',
         'Admin',
         'Supervisory User',
         'GMC',
         'Faculty',
         'Staff',
         'Missionary',
         'External Guest'
       ) NOT NULL DEFAULT 'Faculty'`
    );
  } catch {
    /* enum may already be up to date */
  }

  try {
    await pool.execute(
      `UPDATE users SET role = 'External Guest' WHERE email LIKE '%@aptspace.local'`
    );
  } catch {
    /* walk-in guests may not exist */
  }

  try {
    await pool.execute(
      `UPDATE users SET role = 'External Guest'
       WHERE role IN ('Guest', 'guest', 'External guest')`
    );
  } catch {
    /* legacy role labels may not exist */
  }

  try {
    await pool.execute(
      `UPDATE users u
       INNER JOIN bookings_rooms b ON b.user_id = u.id
       SET u.role = 'External Guest'
       WHERE u.role NOT IN (
         'Super Admin', 'Admin', 'Supervisory User', 'GMC',
         'Faculty', 'Staff', 'Missionary', 'External Guest'
       )
         AND LOWER(u.email) NOT LIKE '%@apts.edu%'
         AND LOWER(u.email) NOT LIKE '%@apts.edu.ph%'`
    );
  } catch {
    /* lodging guests may not need role repair */
  }

  try {
    await pool.execute(
      `CREATE TABLE IF NOT EXISTS bookings_facilities (
         id           INT AUTO_INCREMENT PRIMARY KEY,
         user_id      INT NOT NULL,
         facility_id  INT NOT NULL,
         event_date   DATE NOT NULL,
         start_time   TIME NOT NULL,
         end_time     TIME NOT NULL,
         guest_count  INT NOT NULL DEFAULT 1,
         season       ENUM('Regular', 'Peak', 'N/A') NOT NULL DEFAULT 'Regular',
         total_amount DECIMAL(10,2) DEFAULT NULL,
         status       ENUM('Pending', 'Approved', 'Rejected', 'Cancelled') NOT NULL DEFAULT 'Pending',
         notes        TEXT DEFAULT NULL,
         created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
         CONSTRAINT fk_fbooking_user
           FOREIGN KEY (user_id) REFERENCES users(id)
           ON DELETE RESTRICT ON UPDATE CASCADE,
         CONSTRAINT fk_fbooking_facility
           FOREIGN KEY (facility_id) REFERENCES facilities(id)
           ON DELETE RESTRICT ON UPDATE CASCADE,
         CONSTRAINT chk_fb_times  CHECK (end_time > start_time),
         CONSTRAINT chk_fb_guests CHECK (guest_count >= 1),
         CONSTRAINT chk_fb_total  CHECK (total_amount IS NULL OR total_amount > 0)
       )`
    );
  } catch (err) {
    console.warn('[schema] bookings_facilities patch skipped:', err.message);
  }

  try {
    await pool.execute(
      `CREATE TABLE IF NOT EXISTS system_settings (
         setting_key   VARCHAR(64) PRIMARY KEY,
         setting_value TEXT NOT NULL,
         updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
       )`
    );
    try {
      await pool.execute(
        `ALTER TABLE system_settings MODIFY setting_value TEXT NOT NULL`
      );
    } catch (err) {
      console.warn('[schema] system_settings.setting_value TEXT patch skipped:', err.message);
    }
    for (const [key, value] of Object.entries(FISCAL_YEAR_DEFAULTS)) {
      await pool.execute(
        `INSERT INTO system_settings (setting_key, setting_value)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_key = setting_key`,
        [key, String(value)]
      );
    }
  } catch {
    /* settings table may not be available yet */
  }

  try {
    const [hourRows] = await pool.query(
      `SELECT setting_value FROM system_settings WHERE setting_key = 'guest_cancellation_cutoff_hours' LIMIT 1`
    );
    if (!hourRows.length) {
      const [dayRows] = await pool.query(
        `SELECT setting_value FROM system_settings WHERE setting_key = 'guest_cancellation_cutoff_days' LIMIT 1`
      );
      const legacyDays = dayRows.length ? Number(dayRows[0].setting_value) : 1;
      const hours = Number.isFinite(legacyDays) ? legacyDays * 24 : 24;
      await pool.execute(
        `INSERT INTO system_settings (setting_key, setting_value)
         VALUES ('guest_cancellation_cutoff_hours', ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [String(hours)]
      );
    }
  } catch {
    /* migration optional */
  }

  try {
    await pool.execute(
      `CREATE TABLE IF NOT EXISTS guest_access_requests (
         id            INT AUTO_INCREMENT PRIMARY KEY,
         full_name     VARCHAR(150) NOT NULL,
         email         VARCHAR(150) NOT NULL,
         organization  VARCHAR(150) DEFAULT NULL,
         notes         TEXT DEFAULT NULL,
         status        ENUM('Pending', 'Approved', 'Rejected') NOT NULL DEFAULT 'Pending',
         user_id       INT DEFAULT NULL,
         reviewed_by   INT DEFAULT NULL,
         review_notes  TEXT DEFAULT NULL,
         reviewed_at   TIMESTAMP NULL DEFAULT NULL,
         created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
         CONSTRAINT fk_guest_request_user
           FOREIGN KEY (user_id) REFERENCES users(id)
           ON DELETE SET NULL ON UPDATE CASCADE,
         CONSTRAINT fk_guest_request_reviewer
           FOREIGN KEY (reviewed_by) REFERENCES users(id)
           ON DELETE SET NULL ON UPDATE CASCADE
       )`
    );
  } catch (err) {
    console.warn('[schema] guest_access_requests patch skipped:', err.message);
  }

  try {
    await pool.execute(
      `CREATE TABLE IF NOT EXISTS audit_logs (
         id            INT AUTO_INCREMENT PRIMARY KEY,
         actor_user_id INT DEFAULT NULL,
         action        VARCHAR(64) NOT NULL,
         entity_type   VARCHAR(32) NOT NULL,
         entity_id     INT DEFAULT NULL,
         details       JSON DEFAULT NULL,
         created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         CONSTRAINT fk_audit_actor
           FOREIGN KEY (actor_user_id) REFERENCES users(id)
           ON DELETE SET NULL ON UPDATE CASCADE,
         INDEX idx_audit_action (action),
         INDEX idx_audit_created (created_at)
       )`
    );
  } catch (err) {
    console.warn('[schema] audit_logs patch skipped:', err.message);
  }

  try {
    await pool.execute(
      `UPDATE buildings
       SET name = 'Global Missions Center',
           description = 'Main Global Missions Center building'
       WHERE name = 'PCALM'`
    );
    await pool.execute(
      `DELETE p FROM payments p
       JOIN bookings_rooms bk ON bk.id = p.bookings_room_id
       JOIN rooms r ON r.id = bk.room_id
       JOIN buildings b ON b.id = r.building_id
       WHERE b.name IN ('Thesda', 'Sampaguita', 'Peranza', 'House')`
    );
    await pool.execute(
      `DELETE bk FROM bookings_rooms bk
       JOIN rooms r ON r.id = bk.room_id
       JOIN buildings b ON b.id = r.building_id
       WHERE b.name IN ('Thesda', 'Sampaguita', 'Peranza', 'House')`
    );
    await pool.execute(
      `DELETE r FROM rooms r
       JOIN buildings b ON b.id = r.building_id
       WHERE b.name IN ('Thesda', 'Sampaguita', 'Peranza', 'House')`
    );
    await pool.execute(
      `DELETE FROM buildings WHERE name IN ('Thesda', 'Sampaguita', 'Peranza', 'House')`
    );
  } catch (err) {
    console.warn('[schema] building rename/removal patch skipped:', err.message);
  }

  try {
    await pool.execute(
      `CREATE TABLE IF NOT EXISTS rates_meals (
         id         INT AUTO_INCREMENT PRIMARY KEY,
         meal_type  ENUM('Breakfast', 'Lunch', 'Dinner', 'Snack') NOT NULL,
         rate       DECIMAL(10,2) NOT NULL,
         UNIQUE KEY uq_meal_type (meal_type),
         CONSTRAINT chk_meal_rate CHECK (rate > 0),
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
       )`
    );
    await pool.execute(
      `CREATE TABLE IF NOT EXISTS rates_extra_services (
         id       INT AUTO_INCREMENT PRIMARY KEY,
         category VARCHAR(50)  NOT NULL,
         item     VARCHAR(100) NOT NULL,
         season   ENUM('Regular', 'Peak', 'Super Peak', 'N/A') NOT NULL DEFAULT 'N/A',
         rate     DECIMAL(10,2) NOT NULL,
         UNIQUE KEY uq_extra_service (category, item, season),
         CONSTRAINT chk_extra_service_rate CHECK (rate > 0),
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
       )`
    );

    if (await columnExists('facilities', 'season')) {
      await pool.execute(
        `INSERT INTO rates_meals (meal_type, rate)
         SELECT item, rate FROM facilities
         WHERE category = 'Food Service' AND season = 'N/A'
         ON DUPLICATE KEY UPDATE rate = VALUES(rate)`
      );

      await pool.execute(
        `INSERT INTO rates_extra_services (category, item, season, rate)
         SELECT category, item, 'N/A', rate FROM facilities
         WHERE category IN ('Laundry', 'Laundry-Iron', 'Corkage Fee', 'Maid Service', 'Accommodation Extras')
         ON DUPLICATE KEY UPDATE rate = VALUES(rate)`
      );

      await pool.execute(
        `DELETE FROM facilities
         WHERE category IN (
           'Food Service', 'Laundry', 'Laundry-Iron',
           'Corkage Fee', 'Maid Service', 'Accommodation Extras'
         )`
      );
    }
  } catch (err) {
    console.warn('[schema] ancillary rates migration skipped:', err.message);
  }

  try {
    await runTableRenameMigration();
  } catch (err) {
    console.warn('[schema] table rename migration skipped:', err.message);
  }

  try {
    await runGmcAblockMigration();
  } catch (err) {
    console.warn('[schema] GMC A-block migration skipped:', err.message);
  }

  try {
    await runFacilitiesCatalogMigration();
  } catch (err) {
    console.warn('[schema] facilities catalog migration skipped:', err.message);
  }

  try {
    await runVenueFieldsMigration();
  } catch (err) {
    console.warn('[schema] venue fields migration skipped:', err.message);
  }

  try {
    await runDeluxeRoomTypeMigration();
  } catch (err) {
    console.warn('[schema] deluxe room type migration skipped:', err.message);
  }

  try {
    await runDormCapacityMigration();
  } catch (err) {
    console.warn('[schema] dorm capacity migration skipped:', err.message);
  }

  try {
    await runSuperiorGuestRoomCapacityMigration();
  } catch (err) {
    console.warn('[schema] superior guest room capacity migration skipped:', err.message);
  }

  try {
    await runVipRoomMigration();
  } catch (err) {
    console.warn('[schema] VIP room migration skipped:', err.message);
  }

  try {
    await runSeasonSettingsMigration();
  } catch (err) {
    console.warn('[schema] season settings migration skipped:', err.message);
  }

  try {
    await runLodgingExtrasMigration();
  } catch (err) {
    console.warn('[schema] lodging extras migration skipped:', err.message);
  }

  try {
    await pool.execute(`DELETE FROM rates_rooms WHERE room_type = 'Uncategorized'`);
    // rooms.room_type and rates_rooms.room_type are free-form so admins can add
    // new room categories and set their prices at any time. Built-in tiers still
    // work by matching the same string (Superior Guest Room, Deluxe 2 BR, etc.).
    await pool.execute(`ALTER TABLE rooms MODIFY room_type VARCHAR(100) NOT NULL`);
    await pool.execute(`ALTER TABLE rates_rooms MODIFY room_type VARCHAR(100) NOT NULL`);
    await pool.execute(`ALTER TABLE rates_rooms MODIFY item VARCHAR(120) NOT NULL`);
  } catch (err) {
    console.warn('[schema] room type column migration skipped:', err.message);
  }

  try {
    if (await tableExists('bookings_rooms')) {
      await pool.execute(`ALTER TABLE bookings_rooms MODIFY occupancy_item VARCHAR(120) NOT NULL DEFAULT 'Single/Double Occupancy'`);
    }
  } catch (err) {
    console.warn('[schema] bookings_rooms.occupancy_item migration skipped:', err.message);
  }

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

  const migrateRateVariantKey = async (table, { indexName, hashExpr }) => {
    if (!(await tableExists(table))) return;

    if (!(await columnExists(table, 'variant_key'))) {
      await pool.execute(`
        ALTER TABLE ${table}
        ADD COLUMN variant_key CHAR(64) GENERATED ALWAYS AS (${hashExpr}) STORED NOT NULL
        AFTER notes
      `);
    }

    try { await pool.execute(`ALTER TABLE ${table} DROP INDEX ${indexName}`); } catch {}
    try {
      await pool.execute(`ALTER TABLE ${table} ADD UNIQUE KEY ${indexName} (variant_key)`);
    } catch (err) {
      if (!/Duplicate key name/i.test(err.message)) throw err;
    }
  };

  try {
    await ensureRateVariantColumns('rates_rooms', { billing_unit: 'per night' });
    await migrateRateVariantKey('rates_rooms', {
      indexName: 'uq_room_rate',
      hashExpr: `SHA2(CONCAT_WS(CHAR(31), room_type, item, season, audience, age_band, currency, billing_unit), 256)`,
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
      hashExpr: `SHA2(CONCAT_WS(CHAR(31), category, item, season, audience, age_band, currency, billing_unit), 256)`,
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

  if (await tableExists('payments')) {
    if (!(await columnExists('payments', 'subtotal'))) {
      try {
        await pool.execute('ALTER TABLE payments ADD COLUMN subtotal DECIMAL(10,2) NULL AFTER bookings_room_id');
        await pool.execute('UPDATE payments SET subtotal = amount WHERE subtotal IS NULL');
      } catch (err) {
        console.warn('[schema] payments.subtotal skipped:', err.message);
      }
    }
    if (!(await columnExists('payments', 'discount_amount'))) {
      try {
        await pool.execute('ALTER TABLE payments ADD COLUMN discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER subtotal');
      } catch (err) {
        console.warn('[schema] payments.discount_amount skipped:', err.message);
      }
    }
    if (!(await columnExists('payments', 'discount_note'))) {
      try {
        await pool.execute('ALTER TABLE payments ADD COLUMN discount_note VARCHAR(255) NULL AFTER discount_amount');
      } catch (err) {
        console.warn('[schema] payments.discount_note skipped:', err.message);
      }
    }
    if (!(await columnExists('payments', 'invoice_sent_at'))) {
      try {
        await pool.execute('ALTER TABLE payments ADD COLUMN invoice_sent_at TIMESTAMP NULL DEFAULT NULL AFTER paid_at');
      } catch (err) {
        console.warn('[schema] payments.invoice_sent_at skipped:', err.message);
      }
    }
    if (!(await columnExists('payments', 'billing_invoice_sent_at'))) {
      try {
        await pool.execute('ALTER TABLE payments ADD COLUMN billing_invoice_sent_at TIMESTAMP NULL DEFAULT NULL AFTER invoice_sent_at');
      } catch (err) {
        console.warn('[schema] payments.billing_invoice_sent_at skipped:', err.message);
      }
    }
    try {
      await pool.execute(
        `ALTER TABLE payments MODIFY method ENUM('Cash', 'GCash', 'Bank Transfer') NULL DEFAULT NULL`
      );
    } catch {
      /* method may already be nullable */
    }

    try {
      const [missing] = await pool.execute(
        `SELECT b.id FROM bookings_rooms b
         LEFT JOIN payments p ON p.bookings_room_id = b.id
         WHERE b.status = 'Approved' AND b.total_amount > 0 AND p.id IS NULL`
      );
      for (const row of missing) {
        await ensureInvoiceForBooking(row.id);
      }
    } catch (err) {
      console.warn('[schema] invoice backfill skipped:', err.message);
    }

    if (!(await columnExists('payments', 'bookings_facility_id'))) {
      try {
        await pool.execute('ALTER TABLE payments MODIFY bookings_room_id INT NULL');
        await pool.execute(
          'ALTER TABLE payments ADD COLUMN bookings_facility_id INT NULL AFTER bookings_room_id'
        );
        await pool.execute(
          `ALTER TABLE payments
           ADD CONSTRAINT fk_payments_bookings_facility
           FOREIGN KEY (bookings_facility_id) REFERENCES bookings_facilities(id)
           ON DELETE RESTRICT ON UPDATE CASCADE`
        );
      } catch (err) {
        console.warn('[schema] payments.bookings_facility_id skipped:', err.message);
      }
    }

    try {
      const [missingVenue] = await pool.execute(
        `SELECT fb.id FROM bookings_facilities fb
         LEFT JOIN payments p ON p.bookings_facility_id = fb.id
         WHERE fb.status = 'Approved' AND fb.total_amount > 0 AND p.id IS NULL`
      );
      for (const row of missingVenue) {
        await ensureInvoiceForFacilityBooking(row.id);
      }
    } catch (err) {
      console.warn('[schema] venue invoice backfill skipped:', err.message);
    }

    try {
      await pool.execute(
        `ALTER TABLE payments MODIFY status ENUM(
           'Pending', 'Partially Paid', 'Paid', 'Failed', 'Refunded'
         ) NOT NULL DEFAULT 'Pending'`
      );
    } catch (err) {
      console.warn('[schema] payments.status enum skipped:', err.message);
    }

    if (!(await tableExists('payment_transactions'))) {
      try {
        await pool.execute(
          `CREATE TABLE payment_transactions (
             id          INT AUTO_INCREMENT PRIMARY KEY,
             payment_id  INT NOT NULL,
             type        ENUM('Deposit', 'Advance', 'Settlement', 'Refund', 'Adjustment') NOT NULL,
             amount      DECIMAL(10,2) NOT NULL,
             method      ENUM('Cash', 'GCash', 'Bank Transfer', 'Waived') NOT NULL,
             notes       VARCHAR(255) DEFAULT NULL,
             recorded_by INT DEFAULT NULL,
             recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
             CONSTRAINT fk_pt_payment FOREIGN KEY (payment_id) REFERENCES payments(id)
               ON DELETE RESTRICT ON UPDATE CASCADE,
             CONSTRAINT fk_pt_recorded_by FOREIGN KEY (recorded_by) REFERENCES users(id)
               ON DELETE SET NULL ON UPDATE CASCADE,
             CONSTRAINT chk_pt_amount CHECK (amount > 0),
             INDEX idx_pt_payment (payment_id),
             INDEX idx_pt_recorded (recorded_at)
           )`
        );
        console.log('[schema] payment_transactions table ready');
      } catch (err) {
        console.warn('[schema] payment_transactions skipped:', err.message);
      }
    }

    try {
      await pool.execute(
        `INSERT INTO system_settings (setting_key, setting_value) VALUES
           ('deposit_required', '0'),
           ('deposit_mode', 'percent'),
           ('deposit_value', '50')
         ON DUPLICATE KEY UPDATE setting_key = setting_key`
      );
    } catch (err) {
      console.warn('[schema] deposit settings skipped:', err.message);
    }
  }

  try {
    await pool.execute(
      `CREATE TABLE IF NOT EXISTS login_attempts (
         email VARCHAR(150) PRIMARY KEY,
         attempt_count INT NOT NULL DEFAULT 0,
         locked_until TIMESTAMP NULL,
         updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
       )`
    );
  } catch (err) {
    console.warn('[schema] login_attempts table skipped:', err.message);
  }

  if (await tableExists('users') && !(await columnExists('users', 'session_id'))) {
    try {
      await pool.execute('ALTER TABLE users ADD COLUMN session_id VARCHAR(64) NULL AFTER status');
      console.log('[schema] Added users.session_id for single-session auth');
    } catch (err) {
      console.warn('[schema] users.session_id skipped:', err.message);
    }
  }

  if (await tableExists('users') && !(await columnExists('users', 'session_expires_at'))) {
    try {
      await pool.execute(
        'ALTER TABLE users ADD COLUMN session_expires_at TIMESTAMP NULL AFTER session_id'
      );
      console.log('[schema] Added users.session_expires_at for session expiry');
    } catch (err) {
      console.warn('[schema] users.session_expires_at skipped:', err.message);
    }
  }
}
