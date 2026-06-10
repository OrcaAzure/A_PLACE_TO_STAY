import { pool } from '../config/db.js';

export const login = async ({ email, password }) => {
  // starter placeholder
  const [rows] = await pool.query(
    'SELECT * FROM users WHERE email = ? LIMIT 1',
    [email]
  );

  if (rows.length === 0) {
    throw new Error('User not found');
  }

  return {
    message: 'Login logic not yet finished',
    user: rows[0]
  };
};

export const register = async (data) => {
  return {
    message: 'Register logic not yet finished',
    data
  };
};