import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireRole, requireAdmin, requireAdminPortal, requireGuestAccessAdmin } from '../middleware/role.middleware.js';
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

const router = Router();
const adminRead = [requireAuth, requireAdminPortal];
const adminWrite = [requireAuth, requireAdmin];
const guestAccess = [requireAuth, requireGuestAccessAdmin];

router.get('/guest-access/activity', ...guestAccess, getGuestAccessActivity);
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
router.delete('/:id', requireAuth, requireRole('Super Admin'), deleteUser);

export default router;
