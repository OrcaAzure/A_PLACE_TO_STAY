import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/env.js';
import { extractToken } from '../utils/authToken.js';
import { validateUserSession } from '../services/session.service.js';
import { clearAuthCookie } from '../utils/cookies.js';

const ADMIN_ROLES = ['Super Admin', 'Admin'];

function redirectToLogin(res, reason) {
  clearAuthCookie(res);
  const qs = reason ? `?reason=${encodeURIComponent(reason)}` : '';
  return res.redirect(`/login.html${qs}`);
}

export function requirePortalPage(portal) {
  return async (req, res, next) => {
    const token = extractToken(req);
    if (!token) return redirectToLogin(res, 'auth');

    try {
      const payload = jwt.verify(token, JWT_SECRET);
      const valid = await validateUserSession(payload.id, payload.sid);
      if (!valid) return redirectToLogin(res, 'session');

      const isAdmin = ADMIN_ROLES.includes(payload.role);
      if (portal === 'admin' && !isAdmin) {
        return res.redirect('/guest/dashboard.html');
      }
      if (portal === 'guest' && isAdmin) {
        return res.redirect('/admin/dashboard.html');
      }

      return next();
    } catch {
      return redirectToLogin(res, 'auth');
    }
  };
}
