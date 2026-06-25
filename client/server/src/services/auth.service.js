import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db.js';
import { JWT_SECRET, JWT_EXPIRES_IN } from '../config/env.js';
import { safeUser, isEmpty } from '../utils/helpers.js';
import { DEFAULT_BOOKING_GUEST_ROLE } from '../utils/constants.js';
import { sendWelcomeEmail, sendPasswordResetEmail } from './email.service.js';

export const login = async ({ email, password }) => {
  if (isEmpty(email) || isEmpty(password)) {
    throw new Error('Email and password are required');
  }

  const [rows] = await pool.query(
    'SELECT * FROM users WHERE email = ? LIMIT 1',
    [email]
  );

  if (rows.length === 0) {
    throw new Error('Invalid email or password');
  }

  const user = rows[0];

  if (user.status === 'Inactive') {
    throw new Error('Account is inactive. Please contact an administrator.');
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new Error('Invalid email or password');
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN || '7d' }
  );

  return {
    message: 'Login successful',
    token,
    user: safeUser(user)
  };
};

export const register = async ({ full_name, email, password, role }) => {
  if (isEmpty(full_name) || isEmpty(email) || isEmpty(password)) {
    throw new Error('Full name, email, and password are required');
  }

  const [existing] = await pool.query(
    'SELECT id FROM users WHERE email = ? LIMIT 1',
    [email]
  );

  if (existing.length > 0) {
    throw new Error('Email is already in use');
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const [result] = await pool.query(
    'INSERT INTO users (full_name, email, password, role) VALUES (?, ?, ?, ?)',
    [full_name, email, hashedPassword, role || DEFAULT_BOOKING_GUEST_ROLE]
  );

  const [newUser] = await pool.query(
    'SELECT * FROM users WHERE id = ? LIMIT 1',
    [result.insertId]
  );

  void sendWelcomeEmail(newUser[0]);

  return {
    message: 'Registration successful',
    user: safeUser(newUser[0])
  };
};

export const getMe = async (userId) => {
  const [rows] = await pool.query(
    'SELECT * FROM users WHERE id = ? LIMIT 1',
    [userId]
  );

  if (rows.length === 0) {
    throw new Error('User not found');
  }

  return safeUser(rows[0]);
};

export const updateMe = async (userId, { full_name }) => {
  if (isEmpty(full_name)) {
    throw new Error('Full name is required');
  }

  await pool.query('UPDATE users SET full_name = ? WHERE id = ?', [full_name.trim(), userId]);
  return getMe(userId);
};

export const changePassword = async (userId, { current_password, new_password }) => {
  if (isEmpty(current_password) || isEmpty(new_password)) {
    throw new Error('current_password and new_password are required');
  }
  if (new_password.length < 6) {
    throw new Error('New password must be at least 6 characters');
  }

  const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [userId]);
  if (!rows.length) throw new Error('User not found');

  const isMatch = await bcrypt.compare(current_password, rows[0].password);
  if (!isMatch) throw new Error('Current password is incorrect');

  const hashed = await bcrypt.hash(new_password, 10);
  await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashed, userId]);
  return { message: 'Password changed successfully' };
};

export const requestPasswordReset = async (email) => {
  if (isEmpty(email)) {
    throw new Error('Email is required');
  }

  const [rows] = await pool.query(
    'SELECT * FROM users WHERE email = ? LIMIT 1',
    [email.trim()]
  );

  if (rows.length > 0) {
    const user = rows[0];
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await pool.query(
      'DELETE FROM password_reset_tokens WHERE user_id = ?',
      [user.id]
    );

    await pool.query(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
      [user.id, token, expiresAt]
    );

    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const resetLink = `${appUrl}/reset-password.html?token=${token}`;
    void sendPasswordResetEmail(user, resetLink);
  }

  return {
    message: 'If an account with that email exists, a password reset link has been sent.',
  };
};

export const resetPassword = async (token, newPassword) => {
  if (isEmpty(token) || isEmpty(newPassword)) {
    throw new Error('Token and new password are required');
  }

  const [rows] = await pool.query(
    `SELECT prt.*, u.id AS uid
     FROM password_reset_tokens prt
     JOIN users u ON u.id = prt.user_id
     WHERE prt.token = ?
     LIMIT 1`,
    [token]
  );

  if (rows.length === 0) {
    throw new Error('Invalid or expired reset token');
  }

  const record = rows[0];
  if (new Date(record.expires_at) < new Date()) {
    await pool.query('DELETE FROM password_reset_tokens WHERE id = ?', [record.id]);
    throw new Error('Invalid or expired reset token');
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, record.user_id]);
  await pool.query('DELETE FROM password_reset_tokens WHERE user_id = ?', [record.user_id]);

  return { message: 'Password reset successful' };
};