import { READ_ONLY_ROLES, ADMIN_ROLES } from '../utils/constants.js';

// Checks that the logged-in user has one of the allowed roles.
// Always use after requireAuth so req.user is already set.
export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden: Insufficient permissions' });
    }
    next();
  };
};

// Rejects the request if the logged-in user has one of the denied roles.
// Always use after requireAuth so req.user is already set.
export const denyRole = (...deniedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    if (deniedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden: Your role has view-only access' });
    }
    next();
  };
};

// Convenience guard for admin-only API endpoints.
export const requireAdmin = requireRole(...ADMIN_ROLES);

// Convenience guard for write endpoints: blocks all view-only roles.
export const blockReadOnly = denyRole(...READ_ONLY_ROLES);