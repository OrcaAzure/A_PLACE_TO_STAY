import {
  READ_ONLY_ROLES,
  ADMIN_ROLES,
  ADMIN_PORTAL_ROLES,
} from '../utils/constants.js';
import { logUnauthorizedAccess } from '../services/audit.service.js';

// Checks that the logged-in user has one of the allowed roles.
// Always use after requireAuth so req.user is already set.
export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      logUnauthorizedAccess(req, {
        reason: 'forbidden_role',
        requiredRoles: allowedRoles,
      }).catch(() => {});
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
      logUnauthorizedAccess(req, {
        reason: 'view_only_write_blocked',
        deniedRoles,
      }).catch(() => {});
      return res.status(403).json({ message: 'Forbidden: Your role has view-only access' });
    }
    next();
  };
};

// Convenience guard for admin write API endpoints (Super Admin only).
export const requireAdmin = requireRole(...ADMIN_ROLES);

// Guest Access (external visitor accounts) — Super Admin only.
export const requireGuestAccessAdmin = requireAdmin;

// Admin portal read access (Super Admin + view-only admin roles).
export const requireAdminPortal = requireRole(...ADMIN_PORTAL_ROLES);

// Convenience guard for write endpoints: blocks all view-only admin roles.
export const blockReadOnly = denyRole(...READ_ONLY_ROLES);
