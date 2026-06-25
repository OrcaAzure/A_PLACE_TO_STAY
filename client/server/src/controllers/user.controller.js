import { pool } from '../config/db.js';
import { safeUser } from '../utils/helpers.js';
import { ROLES } from '../utils/constants.js';
import { createGuestUser } from '../services/user.service.js';
import { getGuestAccessOverview as buildGuestAccessOverview } from '../services/guest-access.service.js';

export const getGuestAccessOverview = async (req, res) => {
  try {
    const overview = await buildGuestAccessOverview();
    res.status(200).json(overview);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const { role, status } = req.query;
    let sql = 'SELECT * FROM users WHERE 1=1';
    const params = [];

    if (role) {
      sql += ' AND role = ?';
      params.push(role);
    }
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY created_at DESC';

    const [rows] = await pool.query(sql, params);
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

export const createUser = async (req, res) => {
  try {
    const result = await createGuestUser(req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const updateUser = async (req, res) => {
  try {
    const [existing] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ message: 'User not found' });

    const target = existing[0];
    const { full_name, role, status } = req.body;

    if (Number(req.params.id) === req.user?.id && status === 'Inactive') {
      return res.status(400).json({ message: 'You cannot deactivate your own account' });
    }

    if (role && role !== ROLES.EXTERNAL_GUEST && target.role === ROLES.EXTERNAL_GUEST) {
      return res.status(400).json({ message: 'Use Settings or contact a Super Admin to change internal roles' });
    }

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
