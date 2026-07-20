import { pool } from '../../config/db.js';
import { tableExists, columnExists } from '../helpers.js';

async function addColumn(table, column, ddl) {
  if (!(await tableExists(table))) return false;
  if (await columnExists(table, column)) return false;
  await pool.execute(`ALTER TABLE \`${table}\` ${ddl}`);
  console.log(`[schema] Added ${table}.${column}`);
  return true;
}

/** Extra fee quantity, expected arrival, and soft-delete recycle columns. */
export async function runBookingUxRecycleMigration() {
  await addColumn(
    'bookings_extra_services',
    'quantity',
    'ADD COLUMN quantity INT NOT NULL DEFAULT 1 AFTER amount'
  );

  await addColumn(
    'bookings_rooms',
    'expected_arrival_time',
    'ADD COLUMN expected_arrival_time TIME NULL DEFAULT NULL AFTER meal_allergen_notes'
  );

  await addColumn(
    'reservation_groups',
    'expected_arrival_time',
    'ADD COLUMN expected_arrival_time TIME NULL DEFAULT NULL AFTER notes'
  );

  for (const table of ['payments', 'bookings_rooms', 'bookings_facilities', 'reservation_groups']) {
    await addColumn(
      table,
      'deleted_at',
      'ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL'
    );
    await addColumn(
      table,
      'deleted_by',
      'ADD COLUMN deleted_by INT NULL DEFAULT NULL AFTER deleted_at'
    );
  }

  // Indexes for active-list filters
  for (const [table, indexName] of [
    ['payments', 'idx_payments_deleted_at'],
    ['bookings_rooms', 'idx_bookings_rooms_deleted_at'],
    ['bookings_facilities', 'idx_bookings_facilities_deleted_at'],
    ['reservation_groups', 'idx_reservation_groups_deleted_at'],
  ]) {
    if (!(await tableExists(table))) continue;
    try {
      await pool.execute(`CREATE INDEX \`${indexName}\` ON \`${table}\` (deleted_at)`);
    } catch (err) {
      if (!/Duplicate key name/i.test(err.message)) {
        console.warn(`[schema] ${indexName} skipped:`, err.message);
      }
    }
  }
}
