import { pool } from '../config/db.js';
import { isEmpty } from '../utils/helpers.js';
import { resolveSeason } from '../services/booking.service.js';

const ADMIN_ROLES = ['Super Admin', 'Admin'];

const bookingSelect = `
  SELECT fb.*,
         u.full_name AS guest_name,
         u.email     AS guest_email,
         f.category  AS facility_category,
         f.item      AS facility_name,
         f.rate      AS facility_rate
  FROM facility_bookings fb
  JOIN users u ON fb.user_id = u.id
  JOIN facilities f ON fb.facility_id = f.id
`;

export const getAllFacilityBookings = async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    let rows;
    if (ADMIN_ROLES.includes(role)) {
      [rows] = await pool.query(`${bookingSelect} ORDER BY fb.event_date ASC`);
    } else {
      [rows] = await pool.query(
        `${bookingSelect} WHERE fb.user_id = ? ORDER BY fb.event_date ASC`,
        [userId]
      );
    }
    res.status(200).json({ bookings: rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getFacilityBookingById = async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    const [rows] = await pool.query(`${bookingSelect} WHERE fb.id = ? LIMIT 1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Booking not found' });
    if (!ADMIN_ROLES.includes(role) && rows[0].user_id !== userId) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    res.status(200).json({ booking: rows[0] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const createFacilityBooking = async (req, res) => {
  try {
    const { id: userId, role } = req.user;
    const { facility_id, event_date, start_time, end_time, guest_count, notes } = req.body;

    if (isEmpty(facility_id) || isEmpty(event_date) || isEmpty(start_time) || isEmpty(end_time)) {
      return res.status(400).json({ message: 'facility_id, event_date, start_time, and end_time are required' });
    }

    const [overlap] = await pool.query(
      `SELECT id FROM facility_bookings
       WHERE facility_id = ? AND event_date = ?
         AND status IN ('Pending', 'Approved')
         AND start_time < ? AND end_time > ?
       LIMIT 1`,
      [facility_id, event_date, end_time, start_time]
    );
    if (overlap.length) {
      return res.status(409).json({ message: 'This venue is already booked for the selected time slot.' });
    }

    const season   = await resolveSeason(event_date);
    const [fRows]  = await pool.query(
      `SELECT rate FROM facilities WHERE id = ? LIMIT 1`,
      [facility_id]
    );
    const rate         = fRows.length ? Number(fRows[0].rate) : 0;
    const [sh, sm]     = start_time.split(':').map(Number);
    const [eh, em]     = end_time.split(':').map(Number);
    const hours        = ((eh * 60 + em) - (sh * 60 + sm)) / 60;
    const total_amount = Math.round(rate * Math.max(hours, 1) * 100) / 100;

    const bookingStatus = ADMIN_ROLES.includes(role) ? 'Approved' : 'Pending';

    const [result] = await pool.query(
      `INSERT INTO facility_bookings
         (user_id, facility_id, event_date, start_time, end_time, guest_count, season, total_amount, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, facility_id, event_date, start_time, end_time, guest_count || 1,
       season, total_amount, bookingStatus, notes || null]
    );

    const [rows] = await pool.query(`${bookingSelect} WHERE fb.id = ?`, [result.insertId]);
    res.status(201).json({ message: 'Venue booking created', booking: rows[0] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const updateFacilityBooking = async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    const [existing] = await pool.query('SELECT * FROM facility_bookings WHERE id = ? LIMIT 1', [req.params.id]);
    if (!existing.length) return res.status(404).json({ message: 'Booking not found' });

    if (!ADMIN_ROLES.includes(role)) {
      const { status } = req.body;
      if (status !== 'Cancelled' || existing[0].status !== 'Pending') {
        return res.status(403).json({ message: 'You can only cancel your own pending bookings' });
      }
      await pool.query('UPDATE facility_bookings SET status = ? WHERE id = ?', ['Cancelled', req.params.id]);
    } else {
      const { status, notes } = req.body;
      await pool.query(
        `UPDATE facility_bookings SET
           status = COALESCE(?, status),
           notes  = COALESCE(?, notes)
         WHERE id = ?`,
        [status, notes, req.params.id]
      );
    }

    const [rows] = await pool.query(`${bookingSelect} WHERE fb.id = ?`, [req.params.id]);
    res.status(200).json({ message: 'Booking updated', booking: rows[0] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const deleteFacilityBooking = async (req, res) => {
  try {
    const [existing] = await pool.query('SELECT id FROM facility_bookings WHERE id = ? LIMIT 1', [req.params.id]);
    if (!existing.length) return res.status(404).json({ message: 'Booking not found' });
    await pool.query('DELETE FROM facility_bookings WHERE id = ?', [req.params.id]);
    res.status(200).json({ message: 'Venue booking deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
