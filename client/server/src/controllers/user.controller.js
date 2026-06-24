import { pool } from '../config/db.js';
import { safeUser } from '../utils/helpers.js';

export const getAllUsers = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
    res.status(200).json({ users: rows.map(safeUser) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getUserById = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'User not found' });
    res.status(200).json({ user: safeUser(rows[0]) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateUser = async (req, res) => {
  try {
    const [existing] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ message: 'User not found' });

    const { full_name, role, status } = req.body;
    await pool.query(
      `UPDATE users SET
        full_name = COALESCE(?, full_name),
        role      = COALESCE(?, role),
        status    = COALESCE(?, status)
      WHERE id = ?`,
      [full_name, role, status, req.params.id]
    );
    const [updated] = await pool.query('SELECT * FROM users WHERE id = ?', [req.params.id]);
    res.status(200).json({ message: 'User updated', user: safeUser(updated[0]) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const [existing] = await pool.query('SELECT id FROM users WHERE id = ? LIMIT 1', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ message: 'User not found' });
    await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.status(200).json({ message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};