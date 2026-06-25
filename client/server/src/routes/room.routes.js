import { Router } from 'express';
import { getAllRooms, getAllBuildings, getRoomById, createRoom, updateRoom, deleteRoom, getRoomsOverview } from '../controllers/room.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/role.middleware.js';

const router = Router();

router.get('/',    requireAuth, getAllRooms);
router.get('/overview', requireAuth, getRoomsOverview);
router.get('/buildings/list', requireAuth, getAllBuildings);
router.get('/:id', requireAuth, getRoomById);
router.post('/',   requireAuth, requireRole('Super Admin', 'Admin'), createRoom);
router.patch('/:id', requireAuth, requireRole('Super Admin', 'Admin'), updateRoom);
router.delete('/:id', requireAuth, requireRole('Super Admin', 'Admin'), deleteRoom);

export default router;