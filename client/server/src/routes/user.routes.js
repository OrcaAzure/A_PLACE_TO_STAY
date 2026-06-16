import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/role.middleware.js';
import {
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser
} from '../controllers/user.controller.js';

const router = Router();

router.get('/',     requireAuth, requireRole('Super Admin', 'Admin'), getAllUsers);
router.get('/:id',  requireAuth, getUserById);
router.patch('/:id',  requireAuth, requireRole('Super Admin', 'Admin'), updateUser);
router.delete('/:id', requireAuth, requireRole('Super Admin'), deleteUser);

export default router;