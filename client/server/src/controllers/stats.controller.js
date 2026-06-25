import { pool } from '../config/db.js';
import Booking from '../models/Booking.js';

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
  LEFT JOIN rooms r ON bk.room_id = r.id
  LEFT JOIN buildings b ON r.building_id = b.id
`;

export const getAdminSummary = async (req, res) => {
  try {
    if (!ADMIN_ROLES.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const today = new Date().toISOString().slice(0, 10);

    const [
      [bookingCounts],
      [roomRows],
      [revenueRows],
      [buildingUsage],
      [recentRows],
      [usersByRole],
    ] = await Promise.all([
      pool.query(`
        SELECT
          SUM(status = 'Pending')  AS pending,
          SUM(status = 'Approved') AS approved,
          SUM(status = 'Rejected') AS rejected,
          SUM(status = 'Cancelled') AS cancelled,
          COUNT(*) AS total
        FROM bookings
      `),
      pool.query(`
        SELECT
          COUNT(*) AS total,
          SUM(status = 'Available') AS available,
          SUM(status = 'Occupied') AS occupied,
          SUM(status = 'Maintenance') AS maintenance
        FROM rooms
      `),
      pool.query(`
        SELECT COALESCE(SUM(amount), 0) AS paid_revenue
        FROM payments WHERE status = 'Paid'
      `),
      pool.query(`
        SELECT b.name AS building_name,
               COUNT(bk.id) AS booking_count
        FROM buildings b
        LEFT JOIN rooms r ON r.building_id = b.id
        LEFT JOIN bookings bk ON bk.room_id = r.id
          AND bk.status = 'Approved'
          AND bk.check_in >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        GROUP BY b.id, b.name
        ORDER BY b.name
      `),
      pool.query(`${bookingSelect} ORDER BY bk.updated_at DESC LIMIT 10`),
      pool.query(`
        SELECT role, COUNT(*) AS count
        FROM users
        GROUP BY role
        ORDER BY role
      `),
    ]);

    const counts = bookingCounts[0];
    const roomStats = roomRows[0];
    const [upcomingRows] = await pool.query(
      `SELECT COUNT(*) AS count FROM bookings WHERE status = 'Approved' AND check_in >= ?`,
      [today]
    );

    const approvalRate = counts.total
      ? Math.round((Number(counts.approved) / Number(counts.total)) * 100)
      : 0;

    const occupancyPct = roomStats.total
      ? Math.round((Number(roomStats.occupied) / Number(roomStats.total)) * 100)
      : 0;

    res.status(200).json({
      kpis: {
        upcoming: Number(upcomingRows[0].count),
        pending: Number(counts.pending),
        approved: Number(counts.approved),
        rejected: Number(counts.rejected),
        cancelled: Number(counts.cancelled),
        totalBookings: Number(counts.total),
        approvalRate,
        totalRooms: Number(roomStats.total),
        availableRooms: Number(roomStats.available),
        occupiedRooms: Number(roomStats.occupied),
        maintenanceRooms: Number(roomStats.maintenance),
        occupancyPct,
        paidRevenue: Number(revenueRows[0].paid_revenue),
      },
      buildingUsage,
      recentActivity: recentRows.map((r) => new Booking(r)),
      usersByRole,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
