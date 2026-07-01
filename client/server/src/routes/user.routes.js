import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/role.middleware.js';
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
const adminOnly = [requireAuth, requireRole('Super Admin', 'Admin')];

router.get('/guest-access/activity', ...adminOnly, getGuestAccessActivity);
router.get('/guest-access/requests', ...adminOnly, getGuestAccessRequests);
router.post('/guest-access/requests', ...adminOnly, postGuestAccessRequest);
router.post('/guest-access/requests/:id/approve', ...adminOnly, approveGuestAccessRequestHandler);
router.post('/guest-access/requests/:id/reject', ...adminOnly, rejectGuestAccessRequestHandler);
router.post('/guest-access/bulk-deactivate', ...adminOnly, bulkDeactivateGuestAccounts);
router.delete('/guest-access/:id', ...adminOnly, deleteGuestAccountHandler);
router.get('/guest-access', ...adminOnly, getGuestAccessOverview);

router.get('/', ...adminOnly, getAllUsers);
router.post('/', ...adminOnly, createUser);
router.get('/:id', requireAuth, getUserById);
router.patch('/:id', ...adminOnly, updateUser);
router.delete('/:id', requireAuth, requireRole('Super Admin'), deleteUser);

export default router;
