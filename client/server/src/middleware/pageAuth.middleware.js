import { extractToken, resolveAuthUser } from '../utils/authToken.js';
import { clearAuthCookie } from '../utils/cookies.js';

import { isAdminRole } from '../utils/constants.js';

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
      const user = await resolveAuthUser(token);
      if (!user) return redirectToLogin(res, 'session');

      const isAdmin = isAdminRole(user.role);
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
