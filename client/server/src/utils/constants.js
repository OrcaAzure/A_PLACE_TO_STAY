export const ROLES = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  SUPERVISORY_USER: 'Supervisory User',
  GMC: 'GMC',
  FACULTY: 'Faculty',
  STAFF: 'Staff',
  MISSIONARY: 'Missionary',
};

/** Default role when admin creates a booking for someone not yet in the system. */
export const DEFAULT_BOOKING_GUEST_ROLE = ROLES.FACULTY;

export const USER_ROLES = Object.values(ROLES);

// Supervisory User may view reservations and reports but cannot book or modify.
export const READ_ONLY_ROLES = [ROLES.SUPERVISORY_USER];

export const STATUS = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled'
};