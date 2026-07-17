import bcrypt from 'bcryptjs';
import { pool } from '../../config/db.js';

/* Essential accounts — required so someone can log in and administer the system. */
const CORE_USERS = [
  { full_name: 'System Administrator', email: 'admin@aptspace.com',       role: 'Super Admin', status: 'Active' },
  { full_name: 'Lyshael Bernal',       email: 'lyshael.bernal@apts.edu', role: 'Super Admin', status: 'Active' },
];

/* Test accounts used by the integration suite — only created alongside demo data. */
const DEMO_USERS = [
  { full_name: 'Audit Viewer',         email: 'viewer@aptspace.com',     role: 'View-Only Admin', status: 'Active' },
  { full_name: 'Maria Santos',         email: 'maria.santos@apts.edu.ph', role: 'Guest',       status: 'Active' },
  { full_name: 'Rev. Samuel Park',     email: 'samuel.park@gracechurch.org', role: 'Guest',    status: 'Active' },
];

async function upsertUsers(users, hash) {
  for (const u of users) {
    const [existing] = await pool.execute('SELECT id, role FROM users WHERE email = ? LIMIT 1', [u.email]);
    if (existing.length > 0) {
      if (existing[0].role !== u.role) {
        await pool.execute('UPDATE users SET role = ? WHERE id = ?', [u.role, existing[0].id]);
        console.log(`[seed] Updated role for ${u.email}: ${existing[0].role} → ${u.role}`);
      }
      continue;
    }

    await pool.execute(
      'INSERT INTO users (full_name, email, password, role, status) VALUES (?, ?, ?, ?, ?)',
      [u.full_name, u.email, hash, u.role, u.status]
    );
    console.log(`[seed] Created user: ${u.email} [${u.role}]`);
  }
}

export async function seedUsers({ includeDemo = false } = {}) {
  const password = process.env.DEFAULT_PASSWORD || 'password';
  const hash = await bcrypt.hash(password, 10);

  await upsertUsers(CORE_USERS, hash);
  if (includeDemo) await upsertUsers(DEMO_USERS, hash);
}
