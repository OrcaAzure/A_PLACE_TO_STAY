import { pool } from '../../config/db.js';
import { ensureInvoiceForBooking, ensureInvoiceForFacilityBooking } from '../../services/payment.service.js';
import { tableExists, columnExists } from '../helpers.js';

/** Early payments table create (must run before legacy renames). */
export async function runPaymentsTableCreate() {
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS payments (
       id         INT AUTO_INCREMENT PRIMARY KEY,
       booking_id INT NOT NULL,
       amount     DECIMAL(10,2) NOT NULL,
       method     ENUM('Cash', 'GCash', 'Bank Transfer', 'Waived') NULL DEFAULT NULL,
       status     ENUM('Pending', 'Paid', 'Failed') NOT NULL DEFAULT 'Pending',
       paid_at    TIMESTAMP NULL DEFAULT NULL,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       CONSTRAINT fk_payment_booking
         FOREIGN KEY (booking_id) REFERENCES bookings(id)
         ON DELETE RESTRICT
         ON UPDATE CASCADE,
       CONSTRAINT chk_amount CHECK (amount >= 0)
     )`
  );
}

/** Late payments evolution: subtotal, discounts, facility FK, transactions, deposit settings, invoice backfills. */
export async function runPaymentsEvolution() {
  if (!(await tableExists('payments'))) return;

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
  if (!(await columnExists('payments', 'subtotal_overridden'))) {
    try {
      await pool.execute(
        'ALTER TABLE payments ADD COLUMN subtotal_overridden TINYINT(1) NOT NULL DEFAULT 0 AFTER subtotal'
      );
    } catch (err) {
      console.warn('[schema] payments.subtotal_overridden skipped:', err.message);
    }
  }
  if (!(await columnExists('payments', 'discount_mode'))) {
    try {
      await pool.execute(
        `ALTER TABLE payments ADD COLUMN discount_mode ENUM('percent', 'fixed') NOT NULL DEFAULT 'percent' AFTER discount_amount`
      );
    } catch (err) {
      console.warn('[schema] payments.discount_mode skipped:', err.message);
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
      `ALTER TABLE payments MODIFY method ENUM('Cash', 'GCash', 'Bank Transfer', 'Waived') NULL DEFAULT NULL`
    );
  } catch {
    /* method may already be nullable */
  }

  try {
    await pool.execute('ALTER TABLE payments DROP CHECK chk_amount');
  } catch {
    /* check may not exist or may already allow zero */
  }
  try {
    await pool.execute('ALTER TABLE payments ADD CONSTRAINT chk_amount CHECK (amount >= 0)');
  } catch {
    /* constraint may already be correct */
  }

  try {
    const [indexes] = await pool.execute(
      `SELECT 1 FROM information_schema.statistics
       WHERE table_schema = DATABASE() AND table_name = 'payments'
         AND index_name = 'uq_payment_room' LIMIT 1`
    );
    if (!indexes.length) {
      await pool.execute('ALTER TABLE payments ADD UNIQUE KEY uq_payment_room (bookings_room_id)');
    }
  } catch (err) {
    console.warn('[schema] payments room uniqueness skipped:', err.message);
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
