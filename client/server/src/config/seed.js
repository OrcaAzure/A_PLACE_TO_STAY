import bcrypt from 'bcryptjs';
import { pool } from './db.js';
import { FISCAL_YEAR_DEFAULTS } from '../utils/constants.js';

const SEED_USERS = [
  { full_name: 'System Administrator', email: 'admin@aptspace.com',          role: 'Super Admin',   status: 'Active' },
  { full_name: 'Admin User',           email: 'admin2@aptspace.com',         role: 'Admin',         status: 'Active' },
  { full_name: 'Maria Santos',         email: 'maria.santos@apts.edu.ph',    role: 'Faculty',       status: 'Active' },
  { full_name: 'James Reyes',          email: 'james.reyes@apts.edu.ph',     role: 'Faculty',       status: 'Active' },
  { full_name: 'Ruth Villanueva',      email: 'ruth.villanueva@apts.edu.ph', role: 'Staff',         status: 'Active' },
  { full_name: 'Paul Mendoza',         email: 'paul.mendoza@apts.edu.ph',    role: 'Missionary',       status: 'Active' },
  { full_name: 'Grace Tan',            email: 'grace.tan@apts.edu.ph',       role: 'Supervisory User', status: 'Active' },
  { full_name: 'David Cho',            email: 'david.cho@apts.edu.ph',       role: 'GMC',              status: 'Active' },
  { full_name: 'Rev. Samuel Park',     email: 'samuel.park@gracechurch.org', role: 'External Guest',   status: 'Active' },
  { full_name: 'Manila Bible Church',  email: 'mbc.retreat@example.org',   role: 'External Guest',   status: 'Inactive' },
  { full_name: 'Pacific Outreach Group', email: 'outreach@example.org',    role: 'External Guest',   status: 'Active' },
];

const DEMO_BOOKINGS = [
  { email: 'maria.santos@apts.edu.ph',    building: 'PCALM',      room: '201', check_in: '2026-07-01', check_out: '2026-07-05', guests: 2, season: 'Regular', item: 'Single/Double Occupancy', total: 10000, status: 'Approved', notes: 'Conference attendance' },
  { email: 'james.reyes@apts.edu.ph',     building: 'Thesda',     room: 'BG1', check_in: '2026-07-10', check_out: '2026-07-12', guests: 1, season: 'Regular', item: 'Single/Double Occupancy', total: 4500,  status: 'Pending',  notes: 'Short study visit' },
  { email: 'ruth.villanueva@apts.edu.ph', building: 'House',      room: 'A',   check_in: '2026-06-20', check_out: '2026-06-25', guests: 3, season: 'Regular', item: 'Daily Maximum',           total: 15250, status: 'Approved', notes: 'Staff retreat' },
  { email: 'paul.mendoza@apts.edu.ph',    building: 'Sampaguita', room: '101', check_in: '2026-08-01', check_out: '2026-08-07', guests: 2, season: 'Regular', item: 'Single/Double Occupancy', total: 15000, status: 'Pending',  notes: 'Mission partner visit' },
  { email: 'maria.santos@apts.edu.ph',    building: 'PCALM',      room: '401', check_in: '2026-07-15', check_out: '2026-07-20', guests: 4, season: 'Regular', item: 'Daily Maximum',           total: 22750, status: 'Rejected', notes: 'Family retreat — rejected due to room conflict' },
  { email: 'james.reyes@apts.edu.ph',     building: 'Thesda',     room: '101', check_in: '2026-09-05', check_out: '2026-09-10', guests: 1, season: 'Regular', item: 'Single/Double Occupancy', total: 11250, status: 'Approved', notes: 'Academic conference' },
  { email: 'paul.mendoza@apts.edu.ph',    building: 'PCALM',      room: '501', check_in: '2026-10-01', check_out: '2026-10-03', guests: 6, season: 'Regular', item: 'Daily Maximum',           total: 8700,  status: 'Pending',  notes: 'Mission team accommodation' },
  { email: 'ruth.villanueva@apts.edu.ph', building: 'Sampaguita', room: '202', check_in: '2026-07-22', check_out: '2026-07-24', guests: 2, season: 'Regular', item: 'Single/Double Occupancy', total: 5000,  status: 'Cancelled', notes: 'Cancelled — travel plans changed' },
];

const ROOM_STATUS_UPDATES = [
  { building: 'PCALM',      room: '201', status: 'Occupied',    occupancy: 2 },
  { building: 'House',      room: 'A',   status: 'Occupied',    occupancy: 3 },
  { building: 'Thesda',     room: '101', status: 'Occupied',    occupancy: 1 },
  { building: 'Sampaguita', room: '101', status: 'Occupied',    occupancy: 2 },
  { building: 'PCALM',      room: '302', status: 'Occupied',    occupancy: 4 },
  { building: 'Thesda',     room: '104', status: 'Occupied',    occupancy: 2 },
  { building: 'House',      room: 'B',   status: 'Occupied',    occupancy: 1 },
  { building: 'PCALM',      room: '303', status: 'Maintenance', occupancy: 0 },
  { building: 'Thesda',     room: 'BG3', status: 'Maintenance', occupancy: 0 },
  { building: 'Sampaguita', room: '204', status: 'Maintenance', occupancy: 0 },
  { building: 'Peranza',    room: '203', status: 'Maintenance', occupancy: 0 },
  { building: 'PCALM',      room: '410', status: 'Maintenance', occupancy: 0 },
];

async function getUserId(email) {
  const [rows] = await pool.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
  return rows[0]?.id || null;
}

async function getRoomId(building, roomNumber) {
  const [rows] = await pool.execute(
    `SELECT r.id FROM rooms r
     JOIN buildings b ON b.id = r.building_id
     WHERE b.name = ? AND r.room_number = ? LIMIT 1`,
    [building, roomNumber]
  );
  return rows[0]?.id || null;
}

export async function seedUsers() {
  const password = process.env.DEFAULT_PASSWORD || 'password';
  const hash = await bcrypt.hash(password, 10);

  for (const u of SEED_USERS) {
    const [existing] = await pool.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [u.email]);
    if (existing.length > 0) continue;

    await pool.execute(
      'INSERT INTO users (full_name, email, password, role, status) VALUES (?, ?, ?, ?, ?)',
      [u.full_name, u.email, hash, u.role, u.status]
    );
    console.log(`[seed] Created user: ${u.email} [${u.role}]`);
  }
}

export async function seedDemoData() {
  const [existing] = await pool.execute('SELECT id FROM bookings LIMIT 1');
  if (existing.length > 0) return;

  console.log('[seed] Inserting demo bookings...');

  for (const b of DEMO_BOOKINGS) {
    const userId = await getUserId(b.email);
    const roomId = await getRoomId(b.building, b.room);
    if (!userId || !roomId) continue;

    await pool.execute(
      `INSERT INTO bookings (user_id, room_id, check_in, check_out, guest_count, season, occupancy_item, total_amount, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, roomId, b.check_in, b.check_out, b.guests, b.season, b.item, b.total, b.status, b.notes]
    );
  }

  const paymentSeeds = [
    { email: 'maria.santos@apts.edu.ph',    check_in: '2026-07-01', amount: 10000, method: 'GCash',         status: 'Paid',    paid_at: '2026-07-01 10:00:00' },
    { email: 'ruth.villanueva@apts.edu.ph', check_in: '2026-06-20', amount: 15250, method: 'Bank Transfer', status: 'Paid',    paid_at: '2026-06-20 09:00:00' },
    { email: 'james.reyes@apts.edu.ph',     check_in: '2026-09-05', amount: 11250, method: 'Cash',          status: 'Paid',    paid_at: '2026-09-05 08:30:00' },
    { email: 'paul.mendoza@apts.edu.ph',    check_in: '2026-08-01', amount: 15000, method: 'GCash',         status: 'Pending', paid_at: null },
  ];

  for (const p of paymentSeeds) {
    const [bookings] = await pool.execute(
      `SELECT b.id FROM bookings b
       JOIN users u ON u.id = b.user_id
       WHERE u.email = ? AND b.check_in = ? LIMIT 1`,
      [p.email, p.check_in]
    );
    if (!bookings.length) continue;

    await pool.execute(
      'INSERT INTO payments (booking_id, amount, method, status, paid_at) VALUES (?, ?, ?, ?, ?)',
      [bookings[0].id, p.amount, p.method, p.status, p.paid_at]
    );
  }

  for (const r of ROOM_STATUS_UPDATES) {
    await pool.execute(
      `UPDATE rooms SET status = ?, occupancy = ?
       WHERE room_number = ? AND building_id = (SELECT id FROM buildings WHERE name = ? LIMIT 1)`,
      [r.status, r.occupancy, r.room, r.building]
    );
  }

  console.log('[seed] Demo bookings, payments, and room statuses ready.');
}

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
      `ALTER TABLE booking_meals
       MODIFY meal_type ENUM('Breakfast', 'Lunch', 'Dinner', 'Snack') NOT NULL`
    );
  } catch {
    /* column may already include Snack */
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
      `CREATE TABLE IF NOT EXISTS facility_bookings (
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
    console.warn('[schema] facility_bookings patch skipped:', err.message);
  }

  try {
    await pool.execute(
      `CREATE TABLE IF NOT EXISTS system_settings (
         setting_key   VARCHAR(64) PRIMARY KEY,
         setting_value VARCHAR(255) NOT NULL,
         updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
       )`
    );
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
}

export async function seedGuestStayExamples() {
  const samuelId = await getUserId('samuel.park@gracechurch.org');
  const mbcId = await getUserId('mbc.retreat@example.org');
  const roomId = await getRoomId('PCALM', '301');
  if (!roomId) return;

  const today = new Date();
  const iso = (offset) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  };

  if (samuelId) {
    const [exists] = await pool.execute('SELECT id FROM bookings WHERE user_id = ? LIMIT 1', [samuelId]);
    if (!exists.length) {
      await pool.execute(
        `INSERT INTO bookings (user_id, room_id, check_in, check_out, guest_count, season, occupancy_item, total_amount, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [samuelId, roomId, iso(-2), iso(4), 2, 'Regular', 'Single/Double Occupancy', 8500, 'Approved', 'External guest — ministry retreat']
      );
      console.log('[seed] Demo in-stay booking for external guest');
    }
  }

  if (mbcId) {
    const [exists] = await pool.execute('SELECT id FROM bookings WHERE user_id = ? LIMIT 1', [mbcId]);
    if (!exists.length) {
      await pool.execute(
        `INSERT INTO bookings (user_id, room_id, check_in, check_out, guest_count, season, occupancy_item, total_amount, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [mbcId, roomId, iso(-20), iso(-14), 8, 'Regular', 'Daily Maximum', 42000, 'Approved', 'Past group retreat — access review']
      );
      console.log('[seed] Demo ended-stay booking for external guest');
    }
  }

  const outreachId = await getUserId('outreach@example.org');
  if (outreachId) {
    const [exists] = await pool.execute('SELECT id FROM bookings WHERE user_id = ? LIMIT 1', [outreachId]);
    if (!exists.length) {
      await pool.execute(
        `INSERT INTO bookings (user_id, room_id, check_in, check_out, guest_count, season, occupancy_item, total_amount, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [outreachId, roomId, iso(-14), iso(-10), 5, 'Regular', 'Daily Maximum', 18000, 'Approved', 'Completed outreach — deactivate access']
      );
      console.log('[seed] Demo review-access booking for external guest');
    }
  }
}

export async function runSeed() {
  await runSchemaPatches();
  await seedUsers();
  await seedDemoData();
  await seedGuestStayExamples();
}
