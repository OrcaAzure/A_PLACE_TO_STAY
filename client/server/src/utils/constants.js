export const ROLES = {
  SUPER_ADMIN: 'Super Admin',
  VIEW_ONLY_ADMIN: 'View-Only Admin',
  GUEST: 'Guest',
};

/** Roles that may perform housing admin write actions (approve, edit catalog, billing). */
export const ADMIN_ROLES = [ROLES.SUPER_ADMIN];

/** Roles that may open the admin portal and view housing operations. */
export const ADMIN_PORTAL_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.VIEW_ONLY_ADMIN,
];

/** Admin portal roles that may view data but cannot mutate records or settings. */
export const READ_ONLY_ROLES = [ROLES.VIEW_ONLY_ADMIN];

export function isAdminRole(role) {
  return ADMIN_ROLES.includes(role);
}

export function isAdminPortalRole(role) {
  return ADMIN_PORTAL_ROLES.includes(role);
}

export function isReadOnlyAdminRole(role) {
  return READ_ONLY_ROLES.includes(role);
}

/** Roles that may manage external guest accounts (Guest Access page and APIs). */
export const GUEST_ACCESS_ROLES = [ROLES.SUPER_ADMIN];

export function canAccessGuestAccess(role) {
  return GUEST_ACCESS_ROLES.includes(role);
}

/** Default role when admin creates a booking for someone not yet in the system. */
export const DEFAULT_BOOKING_GUEST_ROLE = ROLES.GUEST;

export const USER_ROLES = Object.values(ROLES);

export const STATUS = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

/** Default fiscal year: July 1 start, 12-month advance booking window. */
export const FISCAL_YEAR_DEFAULTS = {
  fiscal_year_start_month: 7,
  fiscal_year_start_day: 1,
  booking_advance_months: 12,
  guest_cancellation_cutoff_hours: 24,
  active_lodging_season: 'Regular',
};
