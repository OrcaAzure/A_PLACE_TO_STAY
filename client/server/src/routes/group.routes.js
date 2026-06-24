import { Router } from 'express';
import {
  getAllGroups,
  getGroup,
  createGroup,
  updateGroup,
  deleteGroup,
  suggestRooms,
} from '../controllers/group.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireRole, blockReadOnly } from '../middleware/role.middleware.js';

const router = Router();

router.get('/', requireAuth, getAllGroups);
router.get('/suggest-rooms', requireAuth, suggestRooms);
router.get('/:id', requireAuth, getGroup);
router.post('/', requireAuth, blockReadOnly, createGroup);
router.patch('/:id', requireAuth, blockReadOnly, updateGroup);
router.delete('/:id', requireAuth, requireRole('Super Admin', 'Admin'), deleteGroup);

export default router;
