import { Router } from 'express';
import {
  login,
  register,
  getProfile
} from '../controllers/auth.controller.js';

const router = Router();

router.post('/login', login);
router.post('/register', register);
router.get('/profile', getProfile);

export default router;