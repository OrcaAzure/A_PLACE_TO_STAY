import bcrypt from 'bcryptjs';
import { pool } from '../../config/db.js';

/** Production bootstrap accounts only — no demo/dummy guests. */
const SEED_USERS = [
  { full_name: 'System Administrator', email: 'admin@aptspace.com',       role: 'Super Admin', status: 'Active' },
  { full_name: 'Lyshael Bernal',       email: 'lyshael.bernal@apts.edu', role: 'Super Admin', status: 'Active' },
  { full_name: 'Guest Services',       email: 'guestservices@apts.edu',   role: 'Super Admin', status: 'Active' },
];

/** Demo/test guests — only when ENABLE_DEMO_DATA=true or test bootstrap. */
const DEMO_USERS = [
  { full_name: 'Maria Santos',         email: 'maria.santos@apts.edu.ph', role: 'Guest', status: 'Active' },
  { full_name: 'James Reyes',          email: 'james.reyes@apts.edu.ph',  role: 'Guest', status: 'Active' },
  { full_name: 'Rev. Samuel Park',     email: 'samuel.park@gracechurch.org', role: 'Guest', status: 'Active' },
  { full_name: 'Manila Bible Church',  email: 'mbc.retreat@example.org', role: 'Guest', status: 'Inactive' },
  { full_name: 'Pacific Outreach Group', email: 'outreach@example.org', role: 'Guest', status: 'Active' },
];

async function upsertUsers(users) {
  const password = process.env.DEFAULT_PASSWORD || 'password';
  const hash = await bcrypt.hash(password, 10);

  for (const u of users) {
    const [existing] = await pool.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [u.email]);
    if (existing.length > 0) continue;

    await pool.execute(
      'INSERT INTO users (full_name, email, password, role, status) VALUES (?, ?, ?, ?, ?)',
      [u.full_name, u.email, hash, u.role, u.status]
    );
    console.log(`[seed] Created user: ${u.email} [${u.role}]`);
  }
}

export async function seedUsers() {
  await upsertUsers(SEED_USERS);
}

export async function seedDemoUsers() {
  await upsertUsers(DEMO_USERS);
}
