// src/config/seed.js
// Runs automatically when the server starts.
// Creates default users only if they don't already exist — safe every boot.

import bcrypt from 'bcryptjs';
import { pool } from './db.js';

const SEED_USERS = [
  { full_name: 'System Administrator', email: 'admin@aptspace.com',          role: 'Super Admin',   status: 'Active' },
  { full_name: 'Admin User',           email: 'admin2@aptspace.com',         role: 'Admin',         status: 'Active' },
  { full_name: 'Maria Santos',         email: 'maria.santos@apts.edu.ph',    role: 'Faculty',       status: 'Active' },
  { full_name: 'James Reyes',          email: 'james.reyes@apts.edu.ph',     role: 'Student',       status: 'Active' },
  { full_name: 'Ruth Villanueva',      email: 'ruth.villanueva@apts.edu.ph', role: 'Staff',         status: 'Active' },
  { full_name: 'Paul Mendoza',         email: 'paul.mendoza@apts.edu.ph',    role: 'Missionary',    status: 'Active' },
  { full_name: 'Grace Tan',            email: 'grace.tan@apts.edu.ph',       role: 'GNC View Only', status: 'Active' },
];

export async function seedUsers() {
  const password = process.env.DEFAULT_PASSWORD || 'password';
  const hash = await bcrypt.hash(password, 10);

  for (const u of SEED_USERS) {
    const [existing] = await pool.execute(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [u.email]
    );

    if (existing.length > 0) continue;

    await pool.execute(
      `INSERT INTO users (full_name, email, password, role, status) VALUES (?, ?, ?, ?, ?)`,
      [u.full_name, u.email, hash, u.role, u.status]
    );

    console.log(`[seed] Created: ${u.email} [${u.role}]`);
  }
}