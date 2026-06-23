import { pool } from '../config/db.js';
import Booking from '../models/Booking.js';
import { isEmpty } from '../utils/helpers.js';
import { prepareBookingInsert, validateBookingUpdate } from '../services/booking.service.js';

const ADMIN_ROLES = ['Super Admin', 'Admin'];

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
    const { role, id: userId } = req.user;
    let rows;
    if (ADMIN_ROLES.includes(role)) {
      [rows] = await pool.query(`${bookingSelect} ORDER BY bk.check_in ASC`);
    } else {
      [rows] = await pool.query(
        `${bookingSelect} WHERE bk.user_id = ? ORDER BY bk.check_in ASC`,
        [userId]
      );
    }
    res.status(200).json({ bookings: rows.map((r) => new Booking(r)) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getBookingById = async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    const [rows] = await pool.query(`${bookingSelect} WHERE bk.id = ? LIMIT 1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Booking not found' });

    if (!ADMIN_ROLES.includes(role) && rows[0].user_id !== userId) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    res.status(200).json({ booking: new Booking(rows[0]) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createBooking = async (req, res) => {
  try {
    const { role, id: requesterId } = req.user;
    const { user_id, room_id, check_in, check_out, guest_count, season, occupancy_item, notes } = req.body;

    const effectiveUserId = ADMIN_ROLES.includes(role) ? (user_id || requesterId) : requesterId;

    if (isEmpty(room_id) || isEmpty(check_in) || isEmpty(check_out)) {
      return res.status(400).json({ message: 'room_id, check_in, and check_out are required' });
    }

    const prepared = await prepareBookingInsert({
      roomId: room_id,
      checkIn: check_in,
      checkOut: check_out,
      guestCount: guest_count || 1,
      season,
      occupancyItem: occupancy_item,
    });

    const [result] = await pool.query(
      `INSERT INTO bookings (user_id, room_id, check_in, check_out, guest_count, season, occupancy_item, total_amount, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        effectiveUserId,
        room_id,
        check_in,
        check_out,
        guest_count || 1,
        prepared.season,
        prepared.occupancy_item,
        prepared.total_amount,
        notes || null,
      ]
    );

    const [rows] = await pool.query(`${bookingSelect} WHERE bk.id = ?`, [result.insertId]);
    res.status(201).json({ message: 'Booking created', booking: new Booking(rows[0]) });
  } catch (error) {
    const status = error.message.includes('not available') || error.message.includes('Maximum') || error.message.includes('Minimum') || error.message.includes('maintenance')
      ? 409
      : 400;
    res.status(status).json({ message: error.message });
  }
};

export const updateBooking = async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    const isAdmin = ADMIN_ROLES.includes(role);

    const [existingRows] = await pool.query('SELECT * FROM bookings WHERE id = ?', [req.params.id]);
    if (!existingRows.length) return res.status(404).json({ message: 'Booking not found' });

    const existing = existingRows[0];
    if (!isAdmin && existing.user_id !== userId) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    if (!isAdmin) {
      const { status } = req.body;
      if (status !== 'Cancelled' || existing.status !== 'Pending') {
        return res.status(403).json({ message: 'You can only cancel your own pending bookings' });
      }

      await pool.query('UPDATE bookings SET status = ? WHERE id = ?', ['Cancelled', req.params.id]);
      const [rows] = await pool.query(`${bookingSelect} WHERE bk.id = ?`, [req.params.id]);
      return res.status(200).json({ message: 'Booking cancelled', booking: new Booking(rows[0]) });
    }

    const validated = await validateBookingUpdate(existing, req.body, true);
    const { check_in, check_out, guest_count, status, season, notes, total_amount } = req.body;

    await pool.query(
      `UPDATE bookings SET
        check_in = COALESCE(?, check_in),
        check_out = COALESCE(?, check_out),
        guest_count = COALESCE(?, guest_count),
        status = COALESCE(?, status),
        season = ?,
        occupancy_item = ?,
        notes = COALESCE(?, notes),
        total_amount = ?
      WHERE id = ?`,
      [
        check_in,
        check_out,
        guest_count,
        status,
        validated.season,
        validated.occupancyItem,
        notes,
        validated.totalAmount,
        req.params.id,
      ]
    );

    const [rows] = await pool.query(`${bookingSelect} WHERE bk.id = ?`, [req.params.id]);
    res.status(200).json({ message: 'Booking updated', booking: new Booking(rows[0]) });
  } catch (error) {
    const status = error.message.includes('not available') || error.message.includes('Maximum') || error.message.includes('Minimum')
      ? 409
      : 400;
    res.status(status).json({ message: error.message });
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
