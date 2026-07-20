/**
 * Wipe transactional data and remove dummy/test accounts for deployment.
 *
 * Keeps real staff / registered accounts (see KEEP_EMAILS).
 * Catalog data (rooms, facilities, rates, buildings) is preserved.
 *
 * Usage:
 *   node scripts/prep-deployment-cleanup.mjs --dry-run
 *   node scripts/prep-deployment-cleanup.mjs --confirm
 */
import { pool } from '../src/config/db.js';

const KEEP_EMAILS = new Set(
  [
    'admin@aptspace.com',
    'lyshael.bernal@apts.edu',
    'guestservices@apts.edu',
    'lanceroxas131@gmail.com',
    'lyshael05@gmail.com',
    'francis@gmail.com',
    '2244609@slu.edu.ph',
    ...(process.env.HOUSING_SUPER_ADMIN_EMAILS || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  ].map((e) => e.toLowerCase()),
);

const DUMMY_EMAIL_PATTERNS = [
  'flow-test-%@example.com',
  'flow-group-%@example.com',
  'price-lock-%@example.com',
  'role-test-%@example.com',
  '%@example.org',
  '%@example.com',
];

const DUMMY_EMAILS = [
  'maria.santos@apts.edu.ph',
  'james.reyes@apts.edu.ph',
  'ruth.villanueva@apts.edu.ph',
  'paul.mendoza@apts.edu.ph',
  'samuel.park@gracechurch.org',
  'mbc.retreat@example.org',
  'outreach@example.org',
  'retreat@gcc.org',
];

async function tableExists(name) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
    [name],
  );
  return rows.length > 0;
}

async function safeDelete(sql, params = []) {
  try {
    const [result] = await pool.query(sql, params);
    return result.affectedRows ?? 0;
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE') return 0;
    throw err;
  }
}

async function count(table) {
  if (!(await tableExists(table))) return 0;
  const [[{ c }]] = await pool.query(`SELECT COUNT(*) AS c FROM \`${table}\``);
  return Number(c);
}

async function findDummyUsers() {
  const clauses = [
    ...DUMMY_EMAILS.map(() => 'LOWER(email) = ?'),
    ...DUMMY_EMAIL_PATTERNS.map(() => 'email LIKE ?'),
  ];
  const params = [
    ...DUMMY_EMAILS.map((e) => e.toLowerCase()),
    ...DUMMY_EMAIL_PATTERNS,
  ];

  const [rows] = await pool.query(
    `SELECT id, full_name, email, role, status
     FROM users
     WHERE ${clauses.join(' OR ')}
     ORDER BY id`,
    params,
  );

  return rows.filter((u) => !KEEP_EMAILS.has(String(u.email).toLowerCase()));
}

async function wipeTransactionalData() {
  const summary = {};

  // Hard-delete all transactional rows (including soft-deleted recycle-bin items).
  // Child tables first
  summary.payment_transactions = await safeDelete('DELETE FROM payment_transactions');
  summary.payments = await safeDelete('DELETE FROM payments');
  summary.bookings_meals = await safeDelete('DELETE FROM bookings_meals');
  summary.bookings_extra_services = await safeDelete('DELETE FROM bookings_extra_services');
  summary.bookings_rooms = await safeDelete('DELETE FROM bookings_rooms');
  summary.bookings_facilities = await safeDelete('DELETE FROM bookings_facilities');
  summary.reservation_groups = await safeDelete('DELETE FROM reservation_groups');
  summary.guest_access_requests = await safeDelete('DELETE FROM guest_access_requests');
  summary.password_reset_tokens = await safeDelete('DELETE FROM password_reset_tokens');
  summary.login_attempts = await safeDelete('DELETE FROM login_attempts');
  summary.audit_logs = await safeDelete('DELETE FROM audit_logs');

  if (await tableExists('rooms')) {
    const [result] = await pool.query(
      `UPDATE rooms
       SET occupancy = 0,
           status = CASE
             WHEN status IN ('Occupied', 'Reserved', 'Dirty') THEN 'Available'
             ELSE status
           END`,
    );
    summary.rooms_reset = result.affectedRows ?? 0;
  }

  return summary;
}

async function deleteUserCascade(userId) {
  const uid = Number(userId);

  const [roomBookings] = await pool.query('SELECT id FROM bookings_rooms WHERE user_id = ?', [uid]);
  const roomIds = roomBookings.map((r) => r.id);
  const [venueBookings] = await pool.query('SELECT id FROM bookings_facilities WHERE user_id = ?', [uid]);
  const venueIds = venueBookings.map((r) => r.id);

  if (roomIds.length) {
    const ph = roomIds.map(() => '?').join(',');
    await pool.query(`DELETE FROM bookings_meals WHERE bookings_room_id IN (${ph})`, roomIds);
    await pool.query(`DELETE FROM bookings_extra_services WHERE bookings_room_id IN (${ph})`, roomIds);
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
    await pool.query('DELETE FROM guest_access_requests WHERE email = ?', [userRow.email]);
  }

  const [result] = await pool.query('DELETE FROM users WHERE id = ?', [uid]);
  return result.affectedRows;
}

const dryRun = process.argv.includes('--dry-run');
const confirm = process.argv.includes('--confirm');

if (!dryRun && !confirm) {
  console.error('Refusing to run without --dry-run or --confirm');
  process.exit(1);
}

const before = {
  users: await count('users'),
  bookings_rooms: await count('bookings_rooms'),
  bookings_facilities: await count('bookings_facilities'),
  payments: await count('payments'),
  payment_transactions: await count('payment_transactions'),
  reservation_groups: await count('reservation_groups'),
  guest_access_requests: await count('guest_access_requests'),
  audit_logs: await count('audit_logs'),
  login_attempts: await count('login_attempts'),
};

const dummyUsers = await findDummyUsers();
const [allUsers] = await pool.query(
  'SELECT id, full_name, email, role, status FROM users ORDER BY id',
);

console.log(`${dryRun ? '[dry-run] ' : ''}Prep-deployment cleanup`);
console.log('\nCurrent counts:', before);
console.log('\nAccounts to KEEP:');
for (const u of allUsers.filter((u) => KEEP_EMAILS.has(String(u.email).toLowerCase()))) {
  console.log(`  #${u.id} ${u.full_name} <${u.email}> [${u.role}]`);
}
console.log(`\nDummy/test accounts to REMOVE (${dummyUsers.length}):`);
for (const u of dummyUsers) {
  console.log(`  #${u.id} ${u.full_name} <${u.email}> [${u.role}]`);
}

const orphanGuests = allUsers.filter(
  (u) =>
    !KEEP_EMAILS.has(String(u.email).toLowerCase()) &&
    !dummyUsers.some((d) => d.id === u.id),
);
if (orphanGuests.length) {
  console.log('\nOther accounts (kept — not matched as dummy):');
  for (const u of orphanGuests) {
    console.log(`  #${u.id} ${u.full_name} <${u.email}> [${u.role}]`);
  }
}

if (dryRun) {
  console.log('\nDry run only. Re-run with --confirm to apply.');
  await pool.end();
  process.exit(0);
}

console.log('\nWiping transactional data...');
const wiped = await wipeTransactionalData();
console.log(wiped);

console.log('\nRemoving dummy accounts...');
let removed = 0;
for (const u of dummyUsers) {
  try {
    const n = await deleteUserCascade(u.id);
    if (n) {
      removed += 1;
      console.log(`Removed #${u.id} ${u.email}`);
    }
  } catch (err) {
    console.error(`Failed #${u.id} ${u.email}:`, err.message);
  }
}

// Orphan pending access requests with demo emails
await safeDelete(
  `DELETE FROM guest_access_requests WHERE LOWER(email) IN (?, ?, ?, ?)`,
  ['retreat@gcc.org', 'mbc.retreat@example.org', 'outreach@example.org', 'samuel.park@gracechurch.org'],
);

const afterUsers = await pool.query(
  'SELECT id, full_name, email, role, status FROM users ORDER BY id',
);
const after = {
  users: await count('users'),
  bookings_rooms: await count('bookings_rooms'),
  bookings_facilities: await count('bookings_facilities'),
  payments: await count('payments'),
  payment_transactions: await count('payment_transactions'),
  reservation_groups: await count('reservation_groups'),
  guest_access_requests: await count('guest_access_requests'),
  audit_logs: await count('audit_logs'),
  login_attempts: await count('login_attempts'),
};

console.log(`\nDone. Removed ${removed} dummy account(s).`);
console.log('Remaining users:');
for (const u of afterUsers[0]) {
  console.log(`  #${u.id} ${u.full_name} <${u.email}> [${u.role}]`);
}
console.log('\nFinal counts:', after);

await pool.end();
