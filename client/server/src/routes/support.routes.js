import { Router } from 'express';
import { getSupportContact, sendSupportMessage } from '../controllers/support.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/contact', requireAuth, getSupportContact);
router.post('/message', requireAuth, sendSupportMessage);

export default router;
