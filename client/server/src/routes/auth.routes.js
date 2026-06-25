import { Router } from 'express';
import { login, register, getProfile, updateProfile, forgotPassword, resetPassword, updatePassword } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { blockReadOnly } from '../middleware/role.middleware.js';

const router = Router();

router.post('/login',          login);
router.post('/register',       register);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password',  resetPassword);
router.get('/me',              requireAuth, getProfile);
router.patch('/me',            requireAuth, blockReadOnly, updateProfile);
router.patch('/me/password',   requireAuth, updatePassword);

export default router;