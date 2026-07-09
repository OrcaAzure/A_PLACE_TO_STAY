import { pool } from '../config/db.js';

import { isAdminRole } from '../utils/constants.js';

const bookingSelect = `
  SELECT bk.*,
         u.full_name AS guest_name,
         u.email AS guest_email,
         u.role AS guest_role,
         r.room_number,
         r.room_type,
         b.name AS building_name
  FROM bookings_rooms bk
  JOIN users u ON bk.user_id = u.id
  LEFT JOIN rooms r ON bk.room_id = r.id
  LEFT JOIN buildings b ON r.building_id = b.id
`;

const venueBookingSelect = `
  SELECT fb.*,
         u.full_name AS guest_name,
         u.email AS guest_email,
         u.role AS guest_role,
         f.facility_group AS facility_category,
         COALESCE(
           CONCAT(f.room_code, ' — ', f.name),
           CONCAT(f.name, ' (', f.package_name, ')'),
           f.name
         ) AS facility_name
  FROM bookings_facilities fb
  JOIN users u ON fb.user_id = u.id
  JOIN facilities f ON fb.facility_id = f.id
`;

export const getAdminSummary = async (req, res) => {
  try {
    if (!isAdminRole(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const today = new Date().toISOString().slice(0, 10);

    const [
      [bookingCounts],
      [groupCounts],
      [roomRows],
      [revenueRows],
      [facilityUsageRows],
      [roomUsageRows],
      [recentRoomRows],
      [recentVenueRows],
      [usersByRole],
    ] = await Promise.all([
      pool.query(`
        SELECT
          SUM(status = 'Pending')  AS pending,
          SUM(status = 'Approved') AS approved,
          SUM(status = 'Rejected') AS rejected,
          SUM(status = 'Cancelled') AS cancelled,
          COUNT(*) AS total
        FROM bookings_rooms
      `),
      pool.query(`
        SELECT
          SUM(status = 'Pending')  AS pending,
          SUM(status = 'Approved') AS approved
        FROM reservation_groups
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
        SELECT COALESCE(NULLIF(f.facility_group, ''), f.name) AS label,
               COUNT(fb.id) AS booking_count
        FROM bookings_facilities fb
        JOIN facilities f ON f.id = fb.facility_id
        WHERE fb.status = 'Approved'
          AND fb.event_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        GROUP BY COALESCE(NULLIF(f.facility_group, ''), f.name)
      `),
      pool.query(`
        SELECT b.name AS label,
               COUNT(bk.id) AS booking_count
        FROM bookings_rooms bk
        JOIN rooms r ON bk.room_id = r.id
        JOIN buildings b ON r.building_id = b.id
        WHERE bk.status = 'Approved'
          AND bk.check_in >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        GROUP BY b.id, b.name
      `),
      pool.query(`${bookingSelect} ORDER BY bk.updated_at DESC LIMIT 12`),
      pool.query(`${venueBookingSelect} ORDER BY fb.updated_at DESC LIMIT 12`),
      pool.query(`
        SELECT role, COUNT(*) AS count
        FROM users
        GROUP BY role
        ORDER BY role
      `),
    ]);

    const counts = bookingCounts[0];
    const groupStats = groupCounts[0] || { pending: 0, approved: 0 };
    const roomStats = roomRows[0];
    const [upcomingRows] = await pool.query(
      `SELECT COUNT(*) AS count FROM bookings_rooms WHERE status = 'Approved' AND check_in >= ?`,
      [today]
    );

    const approvalRate = counts.total
      ? Math.round((Number(counts.approved) / Number(counts.total)) * 100)
      : 0;

    const occupancyPct = roomStats.total
      ? Math.round((Number(roomStats.occupied) / Number(roomStats.total)) * 100)
      : 0;

    const recentActivity = [
      ...recentRoomRows.map((r) => ({ ...r, kind: 'room' })),
      ...recentVenueRows.map((r) => ({ ...r, kind: 'venue' })),
    ]
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      .slice(0, 10);

    const bookingUsage = [
      ...roomUsageRows.map((row) => ({
        label: row.label,
        booking_count: Number(row.booking_count),
        kind: 'room',
      })),
      ...facilityUsageRows.map((row) => ({
        label: row.label,
        booking_count: Number(row.booking_count),
        kind: 'venue',
      })),
    ]
      .filter((row) => row.booking_count > 0)
      .sort((a, b) => b.booking_count - a.booking_count || a.label.localeCompare(b.label))
      .slice(0, 10);

    res.status(200).json({
      kpis: {
        upcoming: Number(upcomingRows[0].count),
        pending: Number(counts.pending) + Number(groupStats.pending || 0),
        approved: Number(counts.approved) + Number(groupStats.approved || 0),
        pendingSingles: Number(counts.pending),
        pendingGroups: Number(groupStats.pending || 0),
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
      bookingUsage,
      recentActivity,
      usersByRole,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
