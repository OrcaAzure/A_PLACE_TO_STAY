import * as authService from '../services/auth.service.js';
import { setAuthCookie, clearAuthCookie } from '../utils/cookies.js';
import { extractToken } from '../utils/authToken.js';
import { invalidateSession } from '../services/session.service.js';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/env.js';

// POST /api/auth/login
export const login = async (req, res) => {
  try {
    const result = await authService.login(req.body);
    setAuthCookie(res, result.token);
    res.status(200).json({
      message: result.message,
      user: result.user,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// POST /api/auth/logout
export const logout = async (req, res) => {
  const token = extractToken(req);
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      if (payload?.id) await invalidateSession(payload.id);
    } catch {
      /* token may already be invalid */
    }
  }
  clearAuthCookie(res);
  res.status(200).json({ message: 'Logged out' });
};

// POST /api/auth/register
export const register = async (req, res) => {
  try {
    const result = await authService.register(req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// GET /api/auth/me  (protected)
export const getProfile = async (req, res) => {
  try {
    const user = await authService.getMe(req.user.id);
    const token = extractToken(req);
    if (token) setAuthCookie(res, token);
    res.status(200).json({ user });
  } catch (error) {
    res.status(404).json({ message: error.message });
  }
};

// PATCH /api/auth/me  (protected)
export const updateProfile = async (req, res) => {
  try {
    const user = await authService.updateMe(req.user.id, req.body);
    res.status(200).json({ message: 'Profile updated', user });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// POST /api/auth/forgot-password
export const forgotPassword = async (req, res) => {
  try {
    const result = await authService.requestPasswordReset(req.body.email);
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// PATCH /api/auth/me/password  (protected)
export const updatePassword = async (req, res) => {
  try {
    const result = await authService.changePassword(req.user.id, req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// POST /api/auth/reset-password
export const resetPassword = async (req, res) => {
  try {
    const { token, new_password, newPassword } = req.body;
    const result = await authService.resetPassword(token, new_password || newPassword);
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};