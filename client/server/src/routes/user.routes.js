import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/role.middleware.js';
import {
  getAllUsers,
  getUserById,
  getGuestAccessOverview,
  createUser,
  updateUser,
  deleteUser
} from '../controllers/user.controller.js';

const router = Router();

router.get('/guest-access', requireAuth, requireRole('Super Admin', 'Admin'), getGuestAccessOverview);
router.get('/',     requireAuth, requireRole('Super Admin', 'Admin'), getAllUsers);
router.post('/',    requireAuth, requireRole('Super Admin', 'Admin'), createUser);
router.get('/:id',  requireAuth, getUserById);
router.patch('/:id',  requireAuth, requireRole('Super Admin', 'Admin'), updateUser);
router.delete('/:id', requireAuth, requireRole('Super Admin'), deleteUser);

export default router;