import { pool } from '../config/db.js';
import { isEmpty } from '../utils/helpers.js';
import { sendPaymentReceiptEmail } from '../services/email.service.js';

const ADMIN_ROLES = ['Super Admin', 'Admin'];

const paymentSelect = `
  SELECT p.*,
         b.user_id, b.check_in, b.check_out, b.status AS booking_status,
         u.full_name AS guest_name, u.email AS guest_email,
         r.room_number, r.room_type,
         bl.name AS building_name
  FROM payments p
  JOIN bookings b ON p.booking_id = b.id
  JOIN users u ON b.user_id = u.id
  JOIN rooms r ON b.room_id = r.id
  JOIN buildings bl ON r.building_id = bl.id
`;

export const getAllPayments = async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    let rows;
    if (ADMIN_ROLES.includes(role)) {
      [rows] = await pool.query(`${paymentSelect} ORDER BY p.created_at DESC`);
    } else {
      [rows] = await pool.query(
        `${paymentSelect} WHERE b.user_id = ? ORDER BY p.created_at DESC`,
        [userId]
      );
    }
    res.status(200).json({ payments: rows });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getPaymentById = async (req, res) => {
  try {
    const [rows] = await pool.query(`${paymentSelect} WHERE p.id = ? LIMIT 1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Payment not found' });
    if (!ADMIN_ROLES.includes(req.user.role) && rows[0].user_id !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    res.status(200).json({ payment: rows[0] });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createPayment = async (req, res) => {
  try {
    const { booking_id, amount, method } = req.body;
    if (isEmpty(booking_id) || isEmpty(amount) || isEmpty(method)) {
      return res.status(400).json({ message: 'booking_id, amount, and method are required' });
    }
    const [result] = await pool.query(
      `INSERT INTO payments (booking_id, amount, method, status) VALUES (?, ?, ?, 'Pending')`,
      [booking_id, amount, method]
    );
    const [rows] = await pool.query(`${paymentSelect} WHERE p.id = ?`, [result.insertId]);
    void sendPaymentReceiptEmail(
      { full_name: rows[0].guest_name, email: rows[0].guest_email },
      rows[0]
    );
    res.status(201).json({ message: 'Payment created', payment: rows[0] });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updatePayment = async (req, res) => {
  try {
    const { status } = req.body;
    const paid_at = status === 'Paid' ? new Date() : null;
    await pool.query(
      `UPDATE payments SET status = COALESCE(?, status), paid_at = COALESCE(?, paid_at) WHERE id = ?`,
      [status, paid_at, req.params.id]
    );
    const [rows] = await pool.query(`${paymentSelect} WHERE p.id = ?`, [req.params.id]);
    res.status(200).json({ message: 'Payment updated', payment: rows[0] });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};