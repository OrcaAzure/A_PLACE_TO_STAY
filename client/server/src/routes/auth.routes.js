import { Router } from 'express';
import { login, register, getProfile } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/login', login);
router.post('/register', register);
router.get('/me', requireAuth, getProfile);

export default router;