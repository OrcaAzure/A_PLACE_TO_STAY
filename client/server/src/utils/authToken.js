import jwt from 'jsonwebtoken';
import { JWT_SECRET, JWT_EXPIRES_IN } from '../config/env.js';
import { pool } from '../config/db.js';
import { getCookie, AUTH_COOKIE } from './cookies.js';

export function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }
  return getCookie(req, AUTH_COOKIE);
}

export function signUserToken(user, sid) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, sid },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN || '7d' }
  );
}

export async function resolveAuthUser(token) {
  const payload = jwt.verify(token, JWT_SECRET);
  const [rows] = await pool.query(
    `SELECT role, status, session_id, session_expires_at
     FROM users WHERE id = ? LIMIT 1`,
    [payload.id]
  );
  if (!rows.length || rows[0].status === 'Inactive') return null;
  if (!rows[0].session_id || rows[0].session_id !== payload.sid) return null;
  if (rows[0].session_expires_at && new Date(rows[0].session_expires_at) <= new Date()) {
    return null;
  }
  return { ...payload, role: rows[0].role };
}
