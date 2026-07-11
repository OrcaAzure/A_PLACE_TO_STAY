import { pool } from '../config/db.js';
import { isAdminPortalRole } from '../utils/constants.js';

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

function dateOnly(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function formatTimeLabel(value) {
  if (!value) return '';
  const raw = String(value).slice(0, 5);
  const [h, m] = raw.split(':').map(Number);
  if (!Number.isFinite(h)) return raw;
  const d = new Date(2000, 0, 1, h, m || 0);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export const getAdminSummary = async (req, res) => {
  try {
    if (!isAdminPortalRole(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const today = new Date().toISOString().slice(0, 10);

    const [
      [bookingCounts],
      [groupCounts],
      [venueCounts],
      [roomRows],
      [arrivingRows],
      [departingRows],
      [venueTodayRows],
      [pendingRoomRows],
      [pendingGroupRows],
      [pendingVenueRows],
      [recentRoomRows],
      [recentVenueRows],
      [weekRoomRows],
      [weekVenueRows],
      [unpaidRows],
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
          SUM(status = 'Pending')  AS pending,
          SUM(status = 'Approved') AS approved
        FROM bookings_facilities
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
        ${bookingSelect}
        WHERE bk.status = 'Approved' AND bk.check_in = ?
        ORDER BY b.name ASC, r.room_number ASC
        LIMIT 20
      `, [today]),
      pool.query(`
        ${bookingSelect}
        WHERE bk.status = 'Approved' AND bk.check_out = ?
        ORDER BY b.name ASC, r.room_number ASC
        LIMIT 20
      `, [today]),
      pool.query(`
        ${venueBookingSelect}
        WHERE fb.status = 'Approved' AND fb.event_date = ?
        ORDER BY fb.start_time ASC
        LIMIT 20
      `, [today]),
      pool.query(`
        ${bookingSelect}
        WHERE bk.status = 'Pending' AND bk.group_id IS NULL
        ORDER BY bk.created_at ASC
        LIMIT 12
      `),
      pool.query(`
        SELECT rg.*,
               u.full_name AS contact_user_name,
               u.email AS contact_email
        FROM reservation_groups rg
        LEFT JOIN users u ON u.id = rg.user_id
        WHERE rg.status = 'Pending'
        ORDER BY rg.created_at ASC
        LIMIT 8
      `),
      pool.query(`
        ${venueBookingSelect}
        WHERE fb.status = 'Pending'
        ORDER BY fb.created_at ASC
        LIMIT 12
      `),
      pool.query(`${bookingSelect} ORDER BY bk.updated_at DESC LIMIT 8`),
      pool.query(`${venueBookingSelect} ORDER BY fb.updated_at DESC LIMIT 8`),
      pool.query(`
        SELECT check_in, check_out
        FROM bookings_rooms
        WHERE status = 'Approved'
          AND check_in < DATE_ADD(CURDATE(), INTERVAL 7 DAY)
          AND check_out > DATE_SUB(CURDATE(), INTERVAL 1 DAY)
      `),
      pool.query(`
        SELECT event_date, COUNT(*) AS event_count
        FROM bookings_facilities
        WHERE status = 'Approved'
          AND event_date >= CURDATE()
          AND event_date < DATE_ADD(CURDATE(), INTERVAL 7 DAY)
        GROUP BY event_date
      `),
      pool.query(`
        SELECT COUNT(*) AS unpaid_count,
               COALESCE(SUM(amount), 0) AS unpaid_total
        FROM payments
        WHERE status = 'Pending'
      `),
    ]);

    const counts = bookingCounts[0] || {};
    const groupStats = groupCounts[0] || { pending: 0, approved: 0 };
    const venueStats = venueCounts[0] || { pending: 0, approved: 0 };
    const roomStats = roomRows[0] || {};
    const unpaid = unpaidRows[0] || { unpaid_count: 0, unpaid_total: 0 };

    const pendingRooms = Number(counts.pending || 0);
    const pendingGroups = Number(groupStats.pending || 0);
    const pendingVenues = Number(venueStats.pending || 0);
    const pendingTotal = pendingRooms + pendingGroups + pendingVenues;

    const venueByDate = new Map(
      weekVenueRows.map((row) => [dateOnly(row.event_date), Number(row.event_count) || 0])
    );

    const weekOutlook = [];
    let turnoverWeek = 0;
    let venuesWeek = 0;
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(`${today}T12:00:00`);
      d.setDate(d.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      const arrivals = weekRoomRows.filter((b) => dateOnly(b.check_in) === iso).length;
      const departures = weekRoomRows.filter((b) => dateOnly(b.check_out) === iso).length;
      const roomStays = weekRoomRows.filter((b) => {
        const start = dateOnly(b.check_in);
        const end = dateOnly(b.check_out);
        return start <= iso && end > iso;
      }).length;
      const venueEvents = venueByDate.get(iso) || 0;
      const turnover = arrivals + departures;
      turnoverWeek += turnover;
      venuesWeek += venueEvents;
      weekOutlook.push({
        date: iso,
        label: d.toLocaleDateString('en-US', { weekday: 'short' }),
        day_num: d.getDate(),
        is_today: i === 0,
        arrivals,
        departures,
        turnover,
        room_stays: roomStays,
        venue_events: venueEvents,
        total: roomStays + venueEvents,
      });
    }

    const peakLoad = [...weekOutlook].sort((a, b) => b.turnover - a.turnover)[0] || null;

    const actionItems = [
      ...pendingRoomRows.map((b) => ({
        key: `room-${b.id}`,
        kind: 'room',
        id: b.id,
        guest_name: b.guest_name,
        label: b.room_number
          ? `Room ${b.room_number}${b.building_name ? ` · ${b.building_name}` : ''}`
          : (b.building_name || 'Room request'),
        when_label: `${dateOnly(b.check_in)} → ${dateOnly(b.check_out)}`,
        guests: Number(b.guest_count) || 1,
        submitted_at: b.created_at,
        href: 'reservations.html?tab=pending',
      })),
      ...pendingGroupRows.map((g) => ({
        key: `group-${g.id}`,
        kind: 'group',
        id: g.id,
        guest_name: g.group_name || g.contact_name || g.contact_user_name || 'Group stay',
        label: `${g.rooms_requested ?? '?'} rooms requested`,
        when_label: `${dateOnly(g.check_in)} → ${dateOnly(g.check_out)}`,
        guests: Number(g.total_guests) || 1,
        submitted_at: g.created_at,
        href: 'reservations.html?tab=pending',
      })),
      ...pendingVenueRows.map((v) => ({
        key: `venue-${v.id}`,
        kind: 'venue',
        id: v.id,
        guest_name: v.guest_name,
        label: [v.facility_category, v.facility_name].filter(Boolean).join(' — ') || 'Venue request',
        when_label: `${dateOnly(v.event_date)} · ${formatTimeLabel(v.start_time)}–${formatTimeLabel(v.end_time)}`,
        guests: Number(v.guest_count) || 1,
        submitted_at: v.created_at,
        href: 'reservations.html?tab=venues',
      })),
    ]
      .sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at))
      .slice(0, 12);

    const todayBoard = {
      arriving: arrivingRows.map((b) => ({
        id: b.id,
        guest_name: b.guest_name,
        label: b.room_number
          ? `Room ${b.room_number}${b.building_name ? ` · ${b.building_name}` : ''}`
          : (b.building_name || 'Room'),
        guests: Number(b.guest_count) || 1,
        kind: 'arrival',
      })),
      departing: departingRows.map((b) => ({
        id: b.id,
        guest_name: b.guest_name,
        label: b.room_number
          ? `Room ${b.room_number}${b.building_name ? ` · ${b.building_name}` : ''}`
          : (b.building_name || 'Room'),
        guests: Number(b.guest_count) || 1,
        kind: 'departure',
      })),
      venues: venueTodayRows.map((v) => ({
        id: v.id,
        guest_name: v.guest_name,
        label: [v.facility_category, v.facility_name].filter(Boolean).join(' — ') || 'Venue',
        when_label: `${formatTimeLabel(v.start_time)}–${formatTimeLabel(v.end_time)}`,
        guests: Number(v.guest_count) || 1,
        kind: 'venue',
      })),
    };

    const recentActivity = [
      ...recentRoomRows.map((r) => ({ ...r, kind: 'room' })),
      ...recentVenueRows.map((r) => ({ ...r, kind: 'venue' })),
    ]
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      .slice(0, 8);

    const totalRooms = Number(roomStats.total || 0);
    const occupiedRooms = Number(roomStats.occupied || 0);
    const availableRooms = Number(roomStats.available || 0);
    const maintenanceRooms = Number(roomStats.maintenance || 0);
    const occupancyRate = totalRooms
      ? Math.round((occupiedRooms / totalRooms) * 100)
      : 0;

    res.status(200).json({
      kpis: {
        pending: pendingTotal,
        pendingRooms,
        pendingGroups,
        pendingVenues,
        arrivingToday: arrivingRows.length,
        departingToday: departingRows.length,
        venueEventsToday: venueTodayRows.length,
        availableRooms,
        totalRooms,
        occupiedRooms,
        maintenanceRooms,
        unpaidInvoices: Number(unpaid.unpaid_count || 0),
        unpaidTotal: Number(unpaid.unpaid_total || 0),
        approved: Number(counts.approved || 0) + Number(groupStats.approved || 0),
        rejected: Number(counts.rejected || 0),
        cancelled: Number(counts.cancelled || 0),
        totalBookings: Number(counts.total || 0),
      },
      analytics: {
        occupancyRate,
        turnoverWeek,
        venuesWeek,
        peakLoadDay: peakLoad?.label || null,
        peakLoadTurns: peakLoad?.turnover || 0,
      },
      actionItems,
      todayBoard,
      weekOutlook,
      recentActivity,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
