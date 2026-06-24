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
import { requireRole } from '../middleware/role.middleware.js';

const router = Router();

router.get('/', requireAuth, getAllGroups);
router.get('/suggest-rooms', requireAuth, suggestRooms);
router.get('/:id', requireAuth, getGroup);
router.post('/', requireAuth, createGroup);
router.patch('/:id', requireAuth, updateGroup);
router.delete('/:id', requireAuth, requireRole('Super Admin', 'Admin'), deleteGroup);

export default router;
