/** Mirror server role strings — keep in sync with client/server/src/utils/constants.js */

export const ROLES = {
  SUPER_ADMIN: 'Super Admin',
  VIEW_ONLY_ADMIN: 'View-Only Admin',
  GUEST: 'Guest',
};

export const ADMIN_ROLES = [ROLES.SUPER_ADMIN];

export const ADMIN_PORTAL_ROLES = [ROLES.SUPER_ADMIN, ROLES.VIEW_ONLY_ADMIN];

export const READ_ONLY_ROLES = [ROLES.VIEW_ONLY_ADMIN];

export const USER_ROLES = Object.values(ROLES);
