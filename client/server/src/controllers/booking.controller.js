import { pool } from '../config/db.js';
import Booking from '../models/Booking.js';
import { isEmpty } from '../utils/helpers.js';

const bookingSelect = `
  SELECT bk.*,
         u.full_name AS guest_name,
         u.email AS guest_email,
         u.role AS guest_role,
         r.room_number,
         r.room_type,
         b.name AS building_name
  FROM bookings bk
  JOIN users u ON bk.user_id = u.id
  JOIN rooms r ON bk.room_id = r.id
  JOIN buildings b ON r.building_id = b.id
`;

export const getAllBookings = async (req, res) => {
  try {
    const [rows] = await pool.query(`${bookingSelect} ORDER BY bk.check_in ASC`);
    res.status(200).json({ bookings: rows.map((r) => new Booking(r)) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getBookingById = async (req, res) => {
  try {
    const [rows] = await pool.query(`${bookingSelect} WHERE bk.id = ? LIMIT 1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Booking not found' });
    res.status(200).json({ booking: new Booking(rows[0]) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createBooking = async (req, res) => {
  try {
    const { user_id, room_id, check_in, check_out, guest_count, season, occupancy_item, notes } = req.body;
    if (isEmpty(user_id) || isEmpty(room_id) || isEmpty(check_in) || isEmpty(check_out)) {
      return res.status(400).json({ message: 'user_id, room_id, check_in, and check_out are required' });
    }
    const [result] = await pool.query(
      `INSERT INTO bookings (user_id, room_id, check_in, check_out, guest_count, season, occupancy_item, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [user_id, room_id, check_in, check_out, guest_count || 1, season || 'Regular', occupancy_item || 'Single/Double Occupancy', notes || null]
    );
    const [rows] = await pool.query(`${bookingSelect} WHERE bk.id = ?`, [result.insertId]);
    res.status(201).json({ message: 'Booking created', booking: new Booking(rows[0]) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateBooking = async (req, res) => {
  try {
    const [existing] = await pool.query('SELECT id FROM bookings WHERE id = ?', [req.params.id]);
    if (!existing.length) return res.status(404).json({ message: 'Booking not found' });

    const { check_in, check_out, guest_count, status, season, notes, total_amount } = req.body;
    await pool.query(
      `UPDATE bookings SET
        check_in = COALESCE(?, check_in),
        check_out = COALESCE(?, check_out),
        guest_count = COALESCE(?, guest_count),
        status = COALESCE(?, status),
        season = COALESCE(?, season),
        notes = COALESCE(?, notes),
        total_amount = COALESCE(?, total_amount)
      WHERE id = ?`,
      [check_in, check_out, guest_count, status, season, notes, total_amount, req.params.id]
    );
    const [rows] = await pool.query(`${bookingSelect} WHERE bk.id = ?`, [req.params.id]);
    res.status(200).json({ message: 'Booking updated', booking: new Booking(rows[0]) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteBooking = async (req, res) => {
  try {
    const [existing] = await pool.query('SELECT id FROM bookings WHERE id = ?', [req.params.id]);
    if (!existing.length) return res.status(404).json({ message: 'Booking not found' });
    await pool.query('DELETE FROM bookings WHERE id = ?', [req.params.id]);
    res.status(200).json({ message: 'Booking deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
