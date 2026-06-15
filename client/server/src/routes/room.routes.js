import { Router } from 'express';
import { getAllRooms, getRoomById, createRoom, updateRoom, deleteRoom } from '../controllers/room.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/role.middleware.js';

const router = Router();

router.get('/',    requireAuth, getAllRooms);
router.get('/:id', requireAuth, getRoomById);
router.post('/',   requireAuth, requireRole('Super Admin', 'Admin'), createRoom);
router.patch('/:id', requireAuth, requireRole('Super Admin', 'Admin'), updateRoom);
router.delete('/:id', requireAuth, requireRole('Super Admin', 'Admin'), deleteRoom);

export default router;