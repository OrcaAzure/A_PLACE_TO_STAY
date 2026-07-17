import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireRole, requireAdmin, requireAdminPortal } from '../middleware/role.middleware.js';
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

router.get('/guest-access/activity', ...adminRead, getGuestAccessActivity);
router.get('/guest-access/requests', ...adminRead, getGuestAccessRequests);
router.get('/guest-access', ...adminRead, getGuestAccessOverview);
router.post('/guest-access/requests', ...adminWrite, postGuestAccessRequest);
router.post('/guest-access/requests/:id/approve', ...adminWrite, approveGuestAccessRequestHandler);
router.post('/guest-access/requests/:id/reject', ...adminWrite, rejectGuestAccessRequestHandler);
router.post('/guest-access/bulk-deactivate', ...adminWrite, bulkDeactivateGuestAccounts);
router.delete('/guest-access/:id', ...adminWrite, deleteGuestAccountHandler);

router.get('/', ...adminRead, getAllUsers);
router.post('/', ...adminWrite, createUser);
router.get('/:id', requireAuth, getUserById);
router.patch('/:id', ...adminWrite, updateUser);
router.delete('/:id', requireAuth, requireRole('Super Admin'), deleteUser);

export default router;
