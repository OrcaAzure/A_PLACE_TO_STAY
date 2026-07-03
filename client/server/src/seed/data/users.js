import bcrypt from 'bcryptjs';
import { pool } from '../../config/db.js';

const SEED_USERS = [
  { full_name: 'System Administrator', email: 'admin@aptspace.com',          role: 'Super Admin',   status: 'Active' },
  { full_name: 'Admin User',           email: 'admin2@aptspace.com',         role: 'Admin',         status: 'Active' },
  { full_name: 'Lyshael Bernal',       email: 'lyshael.bernal@apts.edu',     role: 'Admin',         status: 'Active' },
  { full_name: 'Maria Santos',         email: 'maria.santos@apts.edu.ph',    role: 'Faculty',       status: 'Active' },
  { full_name: 'James Reyes',          email: 'james.reyes@apts.edu.ph',     role: 'Faculty',       status: 'Active' },
  { full_name: 'Ruth Villanueva',      email: 'ruth.villanueva@apts.edu.ph', role: 'Staff',         status: 'Active' },
  { full_name: 'Paul Mendoza',         email: 'paul.mendoza@apts.edu.ph',    role: 'Missionary',       status: 'Active' },
  { full_name: 'Grace Tan',            email: 'grace.tan@apts.edu.ph',       role: 'Staff', status: 'Active' },
  { full_name: 'David Cho',            email: 'david.cho@apts.edu.ph',       role: 'GMC',              status: 'Active' },
  { full_name: 'Rev. Samuel Park',     email: 'samuel.park@gracechurch.org', role: 'External Guest',   status: 'Active' },
  { full_name: 'Manila Bible Church',  email: 'mbc.retreat@example.org',   role: 'External Guest',   status: 'Inactive' },
  { full_name: 'Pacific Outreach Group', email: 'outreach@example.org',    role: 'External Guest',   status: 'Active' },
];

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
