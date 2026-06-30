import jwt from 'jsonwebtoken';
import { JWT_SECRET, JWT_EXPIRES_IN } from '../config/env.js';
import { validateUserSession } from '../services/session.service.js';
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
  const valid = await validateUserSession(payload.id, payload.sid);
  if (!valid) return null;
  return payload;
}
