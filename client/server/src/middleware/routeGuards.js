import { requireAuth } from './auth.middleware.js';
import { requireAdmin, requireAdminPortal, requireGuestAccessAdmin } from './role.middleware.js';

/** Admin portal read access (Super Admin + View-Only Admin). */
export const adminRead = [requireAuth, requireAdminPortal];

/** Housing admin writes (Super Admin only). */
export const adminWrite = [requireAuth, requireAdmin];

/** Guest Access APIs (Super Admin only). */
export const guestAccess = [requireAuth, requireGuestAccessAdmin];
