import { Router } from 'express';
import {
  getAllRooms,
  getAllBuildings,
  getRoomById,
  createRoom,
  updateRoom,
  deleteRoom,
  getRoomsOverview,
  uploadRoomImagesHandler,
  replaceRoomImageHandler,
  deleteRoomImageHandler,
} from '../controllers/room.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireAdmin } from '../middleware/role.middleware.js';
import { cacheResponse } from '../middleware/cache.middleware.js';
import {
  uploadRoomImages,
  uploadRoomImageReplace,
  handleRoomImageUploadError,
} from '../middleware/roomImageUpload.middleware.js';

const router = Router();

router.get('/',    requireAuth, getAllRooms);
router.get('/overview', requireAuth, getRoomsOverview);
router.get('/buildings/list', requireAuth, cacheResponse('buildings:list', 300), getAllBuildings);
router.post(
  '/:id/images',
  requireAuth,
  requireAdmin,
  (req, res, next) => {
    uploadRoomImages(req, res, (err) => {
      if (err) return handleRoomImageUploadError(err, req, res, next);
      next();
    });
  },
  uploadRoomImagesHandler,
);
// Replace one photo in-place (admin edit flow).
router.put(
  '/:id/images/:filename',
  requireAuth,
  requireAdmin,
  (req, res, next) => {
    uploadRoomImageReplace(req, res, (err) => {
      if (err) return handleRoomImageUploadError(err, req, res, next);
      next();
    });
  },
  replaceRoomImageHandler,
);
router.delete('/:id/images/:filename', requireAuth, requireAdmin, deleteRoomImageHandler);
router.get('/:id', requireAuth, getRoomById);
router.post('/',   requireAuth, requireAdmin, createRoom);
router.patch('/:id', requireAuth, requireAdmin, updateRoom);
router.delete('/:id', requireAuth, requireAdmin, deleteRoom);

export default router;
