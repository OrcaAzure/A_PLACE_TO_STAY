import { Router } from 'express';
import {
  getRecycleBin,
  restoreRecycleItem,
  purgeRecycleItem,
  softDeleteReservation,
} from '../controllers/recycle.controller.js';
import { adminWrite } from '../middleware/routeGuards.js';

const router = Router();

router.get('/', ...adminWrite, getRecycleBin);
router.post('/restore', ...adminWrite, restoreRecycleItem);
router.post('/purge', ...adminWrite, purgeRecycleItem);
router.post('/reservations', ...adminWrite, softDeleteReservation);

export default router;
