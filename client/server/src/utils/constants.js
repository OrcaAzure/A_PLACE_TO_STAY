export const ROLES = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  HOUSING_ADMIN: 'Housing Admin',
  FACULTY: 'Faculty',
  STAFF: 'Staff',
  MISSIONARY: 'Missionary',
};

// Roles with view-only access: they may read data but never create,
// modify, cancel, or delete anything through the API.
export const READ_ONLY_ROLES = [ROLES.GNC_VIEW_ONLY];

export const STATUS = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled'
};