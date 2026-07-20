import { Router } from 'express';
import {
  getRecycleBin,
  restoreRecycleItem,
  purgeRecycleItem,
  softDeleteReservation,
} from '../controllers/recycle.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireAdmin } from '../middleware/role.middleware.js';

const router = Router();

router.get('/', requireAuth, requireAdmin, getRecycleBin);
router.post('/restore', requireAuth, requireAdmin, restoreRecycleItem);
router.post('/purge', requireAuth, requireAdmin, purgeRecycleItem);
router.post('/reservations', requireAuth, requireAdmin, softDeleteReservation);

export default router;
