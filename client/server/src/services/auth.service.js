import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { pool } from '../config/db.js';
import { isProduction } from '../config/env.js';
import { safeUser, isEmpty } from '../utils/helpers.js';
import { sendPasswordResetEmail } from './email.service.js';
import { signUserToken } from '../utils/authToken.js';
import { ROLES } from '../utils/constants.js';
import { isHousingSuperAdminEmail } from '../config/housing.js';
import {
  checkLoginAllowed,
  recordFailedLogin,
  clearLoginAttempts,
  rotateSession,
  invalidateSession,
} from './session.service.js';

const MIN_PASSWORD_LENGTH = isProduction ? 8 : 6;

function assertPasswordStrength(password) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
}

async function applyHousingRoleAllowlist(user) {
  if (!isHousingSuperAdminEmail(user.email)) return user;
  if (user.role === ROLES.SUPER_ADMIN) return user;

  await pool.query('UPDATE users SET role = ? WHERE id = ?', [ROLES.SUPER_ADMIN, user.id]);
  user.role = ROLES.SUPER_ADMIN;
  return user;
}

export const login = async ({ email, password }) => {
  if (isEmpty(email) || isEmpty(password)) {
    throw new Error('Email and password are required');
  }

  await checkLoginAllowed(email);

  const normalizedEmail = email.trim().toLowerCase();
  const [rows] = await pool.query(
    'SELECT * FROM users WHERE LOWER(email) = ? LIMIT 1',
    [normalizedEmail]
  );

  if (rows.length === 0) {
    await recordFailedLogin(normalizedEmail);
    throw new Error('Invalid email or password');
  }

  const user = rows[0];

  if (user.status === 'Inactive') {
    throw new Error('Account is inactive. Please contact an administrator.');
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    await recordFailedLogin(normalizedEmail);
    throw new Error('Invalid email or password');
  }

  await clearLoginAttempts(normalizedEmail);
  const promoted = await applyHousingRoleAllowlist(user);
  const sid = await rotateSession(promoted.id);
  const token = signUserToken(promoted, sid);

  return {
    message: 'Login successful',
    token,
    user: safeUser(promoted)
  };
};

export const register = async ({ full_name, email, password }) => {
  void full_name;
  void email;
  void password;
  throw new Error(
    'Self-registration is not available. Please contact the APTS Housing Department for guest access.'
  );
};

export const getMe = async (userId) => {
  const [rows] = await pool.query(
    'SELECT * FROM users WHERE id = ? LIMIT 1',
    [userId]
  );

  if (rows.length === 0) {
    throw new Error('User not found');
  }

  return normalizeUserProfile(safeUser(rows[0]));
};

function normalizeUserProfile(user) {
  if (!user) return user;
  return {
    ...user,
    contact_phone: user.contact_phone || null,
  };
}

export const updateMe = async (userId, body = {}) => {
  const {
    full_name,
    contact_phone,
    email,
  } = body;

  if (email !== undefined) {
    throw new Error('Email address cannot be changed from account settings');
  }

  const [existing] = await pool.query('SELECT full_name FROM users WHERE id = ? LIMIT 1', [userId]);
  if (!existing.length) throw new Error('User not found');

  const sets = [];
  const params = [];

  if (full_name !== undefined) {
    if (isEmpty(full_name)) throw new Error('Name is required');
    sets.push('full_name = ?');
    params.push(full_name.trim());
  }

  if (contact_phone !== undefined) {
    const phone = contact_phone === null || contact_phone === ''
      ? null
      : String(contact_phone).trim();
    if (phone && phone.length > 30) {
      throw new Error('Contact number must be 30 characters or fewer');
    }
    sets.push('contact_phone = ?');
    params.push(phone);
  }

  if (!sets.length) {
    throw new Error('No profile fields to update');
  }

  params.push(userId);
  await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);
  return getMe(userId);
};

export const changePassword = async (userId, { current_password, new_password }) => {
  if (isEmpty(current_password) || isEmpty(new_password)) {
    throw new Error('current_password and new_password are required');
  }
  assertPasswordStrength(new_password);

  const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [userId]);
  if (!rows.length) throw new Error('User not found');

  const isMatch = await bcrypt.compare(current_password, rows[0].password);
  if (!isMatch) throw new Error('Current password is incorrect');

  const hashed = await bcrypt.hash(new_password, 10);
  await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashed, userId]);
  await invalidateSession(userId);
  return { message: 'Password changed successfully. Please sign in again.' };
};

export const requestPasswordReset = async (email) => {
  if (isEmpty(email)) {
    throw new Error('Email is required');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const [rows] = await pool.query(
    'SELECT * FROM users WHERE LOWER(email) = ? LIMIT 1',
    [normalizedEmail]
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

  assertPasswordStrength(newPassword);

  const record = rows[0];
  if (new Date(record.expires_at) < new Date()) {
    await pool.query('DELETE FROM password_reset_tokens WHERE id = ?', [record.id]);
    throw new Error('Invalid or expired reset token');
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, record.user_id]);
  await pool.query('DELETE FROM password_reset_tokens WHERE user_id = ?', [record.user_id]);
  await invalidateSession(record.user_id);

  return { message: 'Password reset successful' };
};