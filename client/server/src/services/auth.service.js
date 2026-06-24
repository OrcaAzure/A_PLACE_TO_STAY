import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db.js';
import { JWT_SECRET, JWT_EXPIRES_IN } from '../config/env.js';
import { safeUser, isEmpty } from '../utils/helpers.js';
import { DEFAULT_BOOKING_GUEST_ROLE } from '../utils/constants.js';

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