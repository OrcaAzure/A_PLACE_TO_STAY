import { pool } from '../src/config/db.js';
import { listAllPaymentRows, ensureInvoiceForFacilityBooking } from '../src/services/payment.service.js';

async function hasColumn(name) {
  const [rows] = await pool.query('SHOW COLUMNS FROM payments LIKE ?', [name]);
  return rows.length > 0;
}

if (!(await hasColumn('bookings_facility_id'))) {
  await pool.query('ALTER TABLE payments MODIFY bookings_room_id INT NULL');
  await pool.query(
    'ALTER TABLE payments ADD COLUMN bookings_facility_id INT NULL AFTER bookings_room_id'
  );
  try {
    await pool.query(
      `ALTER TABLE payments
       ADD CONSTRAINT fk_payments_bookings_facility
       FOREIGN KEY (bookings_facility_id) REFERENCES bookings_facilities(id)
       ON DELETE RESTRICT ON UPDATE CASCADE`
    );
  } catch (err) {
    console.warn('FK skipped:', err.message);
  }
  console.log('Added bookings_facility_id column');
} else {
  console.log('bookings_facility_id already exists');
}

const [venues] = await pool.query(
  `SELECT fb.id FROM bookings_facilities fb
   LEFT JOIN payments p ON p.bookings_facility_id = fb.id
   WHERE fb.status = 'Approved' AND fb.total_amount > 0 AND p.id IS NULL`
);
for (const row of venues) {
  await ensureInvoiceForFacilityBooking(row.id);
  console.log('Created invoice for venue booking', row.id);
}

const rows = await listAllPaymentRows({});
console.log('Total invoices:', rows.length);
console.log('Room:', rows.filter((r) => r.invoice_kind === 'room').length);
console.log('Venue:', rows.filter((r) => r.invoice_kind === 'venue').length);

await pool.end();
