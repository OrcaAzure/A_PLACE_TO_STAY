import { pool } from '../config/db.js';
import { isEmpty } from '../utils/helpers.js';
import { resolveSeason, resolveGuestUser } from '../services/booking.service.js';

const ADMIN_ROLES = ['Super Admin', 'Admin'];

/** Ensure TIME values work with MySQL (HH:MM or HH:MM:SS). */
function normalizeTime(value) {
  if (!value) return value;
  const raw = String(value).trim();
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(raw)) return raw;
  if (/^\d{1,2}:\d{2}$/.test(raw)) return `${raw}:00`;
  return raw;
}

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
    const {
      facility_id, event_date, start_time, end_time, guest_count, notes,
      user_id, guest_name, email, status,
    } = req.body;

    if (isEmpty(facility_id) || isEmpty(event_date) || isEmpty(start_time) || isEmpty(end_time)) {
      return res.status(400).json({ message: 'facility_id, event_date, start_time, and end_time are required' });
    }

    const isAdmin = ADMIN_ROLES.includes(role);
    const effectiveUserId = isAdmin
      ? await resolveGuestUser({ userId: user_id, guestName: guest_name, email })
      : userId;

    const startTime = normalizeTime(start_time);
    const endTime = normalizeTime(end_time);

    const [overlap] = await pool.query(
      `SELECT id FROM facility_bookings
       WHERE facility_id = ? AND event_date = ?
         AND status IN ('Pending', 'Approved')
         AND start_time < ? AND end_time > ?
       LIMIT 1`,
      [facility_id, event_date, endTime, startTime]
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
    const [sh, sm]     = startTime.split(':').map(Number);
    const [eh, em]     = endTime.split(':').map(Number);
    const hours        = ((eh * 60 + em) - (sh * 60 + sm)) / 60;
    const total_amount = Math.round(rate * Math.max(hours, 1) * 100) / 100;

    const bookingStatus = isAdmin ? (status || 'Approved') : 'Pending';

    const [result] = await pool.query(
      `INSERT INTO facility_bookings
         (user_id, facility_id, event_date, start_time, end_time, guest_count, season, total_amount, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [effectiveUserId, facility_id, event_date, startTime, endTime, guest_count || 1,
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
    if (!existing.length) return res.status(404).json({ message: 'Venue booking not found' });
    await pool.query('DELETE FROM facility_bookings WHERE id = ?', [req.params.id]);
    res.status(200).json({ message: 'Venue booking deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const NON_VENUE_CATEGORIES = [
  'Food Service',
  'Laundry',
  'Laundry-Iron',
  'Corkage Fee',
  'Maid Service',
  'Accommodation Extras',
];

const VENUE_CATEGORY_ICONS = {
  Garden: 'park',
  'GMC Chapel': 'church',
  'Burdine Commons': 'groups',
  GMC: 'school',
  'Prayer Mountain': 'landscape',
  'Prayer Tower': 'water_lux',
  'Basketball Court': 'sports_basketball',
  'Childrens Playground': 'child_care',
  'Rec Center': 'fitness_center',
};

function formatTime(t) {
  if (!t) return '';
  const raw = String(t);
  const [h, m] = raw.slice(0, 5).split(':').map(Number);
  const d = new Date(2000, 0, 1, h, m);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** Admin venue schedule — grouped bookable spaces with bookings for one date. */
export const getVenueScheduleOverview = async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const placeholders = NON_VENUE_CATEGORIES.map(() => '?').join(',');

    const [facilityRows] = await pool.query(
      `SELECT id, category, item, season, rate
       FROM facilities
       WHERE category NOT IN (${placeholders})
       ORDER BY category ASC, item ASC, season ASC`,
      NON_VENUE_CATEGORIES
    );

    const [bookingRows] = await pool.query(
      `${bookingSelect}
       WHERE fb.event_date = ? AND fb.status IN ('Pending', 'Approved')
       ORDER BY fb.start_time ASC`,
      [date]
    );

    const bookingsByFacility = new Map();
    for (const row of bookingRows) {
      if (!bookingsByFacility.has(row.facility_id)) bookingsByFacility.set(row.facility_id, []);
      bookingsByFacility.get(row.facility_id).push({
        id: row.id,
        status: row.status,
        start_time: row.start_time,
        end_time: row.end_time,
        start_label: formatTime(row.start_time),
        end_label: formatTime(row.end_time),
        guest_name: row.guest_name,
        guest_count: row.guest_count,
        notes: row.notes,
      });
    }

    const byCategory = new Map();
    for (const f of facilityRows) {
      if (!byCategory.has(f.category)) {
        byCategory.set(f.category, {
          category: f.category,
          icon: VENUE_CATEGORY_ICONS[f.category] || 'place',
          facilities: [],
        });
      }
      const bookings = bookingsByFacility.get(f.id) || [];
      byCategory.get(f.category).facilities.push({
        id: f.id,
        item: f.item,
        season: f.season,
        rate: Number(f.rate),
        bookings,
        is_free: bookings.length === 0,
        has_pending: bookings.some((b) => b.status === 'Pending'),
      });
    }

    const venues = [...byCategory.values()];
    const pendingCount = bookingRows.filter((b) => b.status === 'Pending').length;
    const bookedCount = bookingRows.filter((b) => b.status === 'Approved').length;
    const freeCount = facilityRows.filter((f) => !(bookingsByFacility.get(f.id)?.length)).length;

    res.status(200).json({
      date,
      summary: {
        totalSpaces: facilityRows.length,
        freeToday: freeCount,
        bookedToday: bookedCount,
        pendingRequests: pendingCount,
      },
      venues,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
