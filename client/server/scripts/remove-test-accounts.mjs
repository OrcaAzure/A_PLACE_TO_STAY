/**
 * Remove integration-test walk-in accounts (flow-test-*, price-lock-*, role-test-*).
 * Does NOT remove seeded demo guests (samuel.park@gracechurch.org, etc.).
 */
import { pool } from '../src/config/db.js';

const TEST_EMAIL_PATTERNS = [
  'flow-test-%@example.com',
  'price-lock-%@example.com',
  'role-test-%@example.com',
  'role-test-debug@example.com',
];

async function findTestUsers() {
  const clauses = TEST_EMAIL_PATTERNS.map(() => 'email LIKE ?').join(' OR ');
  const [rows] = await pool.query(
    `SELECT id, full_name, email, role, status, created_at
     FROM users
     WHERE ${clauses}
     ORDER BY id`,
    TEST_EMAIL_PATTERNS,
  );
  return rows;
}

async function deleteUserCascade(userId) {
  const uid = Number(userId);

  const [roomBookings] = await pool.query('SELECT id FROM bookings_rooms WHERE user_id = ?', [uid]);
  const roomIds = roomBookings.map((r) => r.id);

  const [venueBookings] = await pool.query('SELECT id FROM bookings_facilities WHERE user_id = ?', [uid]);
  const venueIds = venueBookings.map((r) => r.id);

  if (roomIds.length) {
    const ph = roomIds.map(() => '?').join(',');
    const [payments] = await pool.query(
      `SELECT id FROM payments WHERE bookings_room_id IN (${ph})`,
      roomIds,
    );
    if (payments.length) {
      const payIds = payments.map((p) => p.id);
      const payPh = payIds.map(() => '?').join(',');
      await pool.query(`DELETE FROM payment_transactions WHERE payment_id IN (${payPh})`, payIds);
      await pool.query(`DELETE FROM payments WHERE id IN (${payPh})`, payIds);
    }
    await pool.query(`DELETE FROM bookings_rooms WHERE id IN (${ph})`, roomIds);
  }

  if (venueIds.length) {
    const ph = venueIds.map(() => '?').join(',');
    const [payments] = await pool.query(
      `SELECT id FROM payments WHERE bookings_facility_id IN (${ph})`,
      venueIds,
    );
    if (payments.length) {
      const payIds = payments.map((p) => p.id);
      const payPh = payIds.map(() => '?').join(',');
      await pool.query(`DELETE FROM payment_transactions WHERE payment_id IN (${payPh})`, payIds);
      await pool.query(`DELETE FROM payments WHERE id IN (${payPh})`, payIds);
    }
    await pool.query(`DELETE FROM bookings_facilities WHERE id IN (${ph})`, venueIds);
  }

  await pool.query('DELETE FROM reservation_groups WHERE user_id = ?', [uid]);
  await pool.query('DELETE FROM guest_access_requests WHERE user_id = ?', [uid]);

  const [[userRow]] = await pool.query('SELECT email FROM users WHERE id = ?', [uid]);
  if (userRow?.email) {
    await pool.query('DELETE FROM login_attempts WHERE email = ?', [userRow.email]);
  }

  const [result] = await pool.query('DELETE FROM users WHERE id = ?', [uid]);
  return result.affectedRows;
}

const dryRun = process.argv.includes('--dry-run');

const testUsers = await findTestUsers();
if (!testUsers.length) {
  console.log('No integration test accounts found.');
  await pool.end();
  process.exit(0);
}

console.log(`${dryRun ? '[dry-run] ' : ''}Found ${testUsers.length} test account(s):`);
for (const u of testUsers) {
  console.log(`  #${u.id} ${u.full_name} <${u.email}>`);
}

if (dryRun) {
  await pool.end();
  process.exit(0);
}

let removed = 0;
for (const u of testUsers) {
  try {
    const n = await deleteUserCascade(u.id);
    if (n) {
      removed += 1;
      console.log(`Removed #${u.id} ${u.email}`);
    }
  } catch (err) {
    console.error(`Failed to remove #${u.id} ${u.email}:`, err.message);
  }
}

console.log(`Done. Removed ${removed} test account(s).`);
await pool.end();
