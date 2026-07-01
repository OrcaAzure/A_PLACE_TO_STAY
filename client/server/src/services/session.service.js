import crypto from 'crypto';
import { pool } from '../config/db.js';
import { JWT_EXPIRES_IN } from '../config/env.js';

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

function sessionExpiresAt() {
  const raw = String(JWT_EXPIRES_IN || '7d').trim();
  const match = /^(\d+)\s*([dhms])?$/i.exec(raw);
  if (!match) return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const n = Number(match[1]);
  const unit = (match[2] || 'd').toLowerCase();
  const ms = { d: 86400000, h: 3600000, m: 60000, s: 1000 };
  return new Date(Date.now() + n * (ms[unit] || ms.d));
}

export async function checkLoginAllowed(email) {
  const normalized = email.trim().toLowerCase();
  const [rows] = await pool.query(
    'SELECT locked_until FROM login_attempts WHERE email = ? LIMIT 1',
    [normalized]
  );
  if (!rows.length) return;

  const { locked_until } = rows[0];
  if (locked_until && new Date(locked_until) > new Date()) {
    const mins = Math.max(1, Math.ceil((new Date(locked_until) - Date.now()) / 60000));
    throw new Error(`Too many failed attempts. Try again in ${mins} minute(s).`);
  }
}

export async function recordFailedLogin(email) {
  const normalized = email.trim().toLowerCase();

  await pool.query(
    `UPDATE login_attempts
     SET attempt_count = 0, locked_until = NULL
     WHERE email = ? AND locked_until IS NOT NULL AND locked_until < NOW()`,
    [normalized]
  );

  await pool.query(
    `INSERT INTO login_attempts (email, attempt_count, locked_until)
     VALUES (?, 1, NULL)
     ON DUPLICATE KEY UPDATE attempt_count = attempt_count + 1`,
    [normalized]
  );

  await pool.query(
    `UPDATE login_attempts
     SET locked_until = DATE_ADD(NOW(), INTERVAL ? MINUTE)
     WHERE email = ? AND attempt_count >= ? AND locked_until IS NULL`,
    [LOCKOUT_MINUTES, normalized, MAX_LOGIN_ATTEMPTS]
  );
}

export async function clearLoginAttempts(email) {
  await pool.query('DELETE FROM login_attempts WHERE email = ?', [email.trim().toLowerCase()]);
}

export async function rotateSession(userId) {
  const sid = crypto.randomBytes(32).toString('hex');
  const expiresAt = sessionExpiresAt();
  await pool.query(
    'UPDATE users SET session_id = ?, session_expires_at = ? WHERE id = ?',
    [sid, expiresAt, userId]
  );
  return sid;
}

export async function validateUserSession(userId, sid) {
  if (!sid) return false;
  const [rows] = await pool.query(
    'SELECT session_id, session_expires_at, status FROM users WHERE id = ? LIMIT 1',
    [userId]
  );
  if (!rows.length || rows[0].status === 'Inactive') return false;
  if (rows[0].session_id !== sid) return false;
  if (rows[0].session_expires_at && new Date(rows[0].session_expires_at) <= new Date()) {
    return false;
  }
  return true;
}

export async function invalidateSession(userId) {
  await pool.query(
    'UPDATE users SET session_id = NULL, session_expires_at = NULL WHERE id = ?',
    [userId]
  );
}
