import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireAdmin } from '../middleware/role.middleware.js';
import { adminRead, adminWrite, guestAccess } from '../middleware/routeGuards.js';
import {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
} from '../controllers/user.controller.js';
import {
  getGuestAccessOverview,
  getGuestAccessRequests,
  postGuestAccessRequest,
  approveGuestAccessRequestHandler,
  rejectGuestAccessRequestHandler,
  bulkDeactivateGuestAccounts,
  getGuestAccessActivity,
  deleteGuestAccountHandler,
} from '../controllers/guest-access.controller.js';
import {
  getPortalStaffOverview,
  createPortalStaffHandler,
  updatePortalStaffHandler,
  getPortalStaffActivity,
} from '../controllers/portal-staff.controller.js';

const router = Router();

router.get('/guest-access/activity', ...guestAccess, getGuestAccessActivity);
router.get('/portal-staff/activity', ...guestAccess, getPortalStaffActivity);
router.get('/portal-staff', ...guestAccess, getPortalStaffOverview);
router.post('/portal-staff', ...guestAccess, createPortalStaffHandler);
router.patch('/portal-staff/:id', ...guestAccess, updatePortalStaffHandler);
router.get('/guest-access/requests', ...guestAccess, getGuestAccessRequests);
router.get('/guest-access', ...guestAccess, getGuestAccessOverview);
router.post('/guest-access/requests', ...guestAccess, postGuestAccessRequest);
router.post('/guest-access/requests/:id/approve', ...guestAccess, approveGuestAccessRequestHandler);
router.post('/guest-access/requests/:id/reject', ...guestAccess, rejectGuestAccessRequestHandler);
router.post('/guest-access/bulk-deactivate', ...guestAccess, bulkDeactivateGuestAccounts);
router.delete('/guest-access/:id', ...guestAccess, deleteGuestAccountHandler);

router.get('/', ...adminRead, getAllUsers);
router.post('/', ...adminWrite, createUser);
router.get('/:id', requireAuth, getUserById);
router.patch('/:id', ...adminWrite, updateUser);
router.delete('/:id', ...adminWrite, deleteUser);

export default router;
