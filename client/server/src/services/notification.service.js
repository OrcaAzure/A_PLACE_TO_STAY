import { pool } from '../config/db.js';
import { isAdminPortalRole } from '../utils/constants.js';

function item(id, { icon, title, subtitle, href, level = 'info', at = null }) {
  return {
    id,
    icon,
    title,
    subtitle,
    href: href || null,
    level,
    at: at ? new Date(at).toISOString() : null,
  };
}

async function getAdminNotifications() {
  const today = new Date().toISOString().slice(0, 10);
  const [
    [roomPending],
    [groupPending],
    [venuePending],
    [upcomingRows],
    [recentRooms],
    [recentVenues],
    [openInvoices],
  ] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS c FROM bookings_rooms WHERE status = 'Pending' AND group_id IS NULL`),
    pool.query(`SELECT COUNT(*) AS c FROM reservation_groups WHERE status = 'Pending'`),
    pool.query(`SELECT COUNT(*) AS c FROM bookings_facilities WHERE status = 'Pending'`),
    pool.query(
      `SELECT COUNT(*) AS c FROM bookings_rooms WHERE status = 'Approved' AND check_in >= ?`,
      [today],
    ),
    pool.query(`
      SELECT bk.id, bk.status, bk.updated_at, u.full_name AS guest_name,
             r.room_number, b.name AS building_name
      FROM bookings_rooms bk
      JOIN users u ON bk.user_id = u.id
      LEFT JOIN rooms r ON bk.room_id = r.id
      LEFT JOIN buildings b ON r.building_id = b.id
      WHERE bk.status IN ('Pending', 'Approved')
        AND bk.group_id IS NULL
      ORDER BY bk.updated_at DESC
      LIMIT 6
    `),
    pool.query(`
      SELECT fb.id, fb.status, fb.updated_at, fb.event_date, u.full_name AS guest_name,
             f.name AS facility_name
      FROM bookings_facilities fb
      JOIN users u ON fb.user_id = u.id
      JOIN facilities f ON fb.facility_id = f.id
      WHERE fb.status IN ('Pending', 'Approved')
      ORDER BY fb.updated_at DESC
      LIMIT 6
    `),
    pool.query(`
      SELECT COUNT(*) AS c FROM payments
      WHERE status IN ('Pending', 'Partially Paid')
    `),
  ]);

  const pendingRooms = Number(roomPending[0]?.c || 0);
  const pendingGroups = Number(groupPending[0]?.c || 0);
  const pendingVenues = Number(venuePending[0]?.c || 0);
  const pendingTotal = pendingRooms + pendingGroups + pendingVenues;
  const upcoming = Number(upcomingRows[0]?.c || 0);
  const invoicesDue = Number(openInvoices[0]?.c || 0);

  const feed = [];

  if (pendingTotal > 0) {
    const parts = [];
    if (pendingRooms) parts.push(`${pendingRooms} room`);
    if (pendingGroups) parts.push(`${pendingGroups} group`);
    if (pendingVenues) parts.push(`${pendingVenues} venue`);
    feed.push(item('admin:pending-summary', {
      icon: 'pending_actions',
      title: `${pendingTotal} pending reservation${pendingTotal === 1 ? '' : 's'}`,
      subtitle: `${parts.join(' · ')} — review in Reservations`,
      href: '/admin/reservations.html',
      level: 'warn',
    }));
  } else {
    feed.push(item('admin:pending-clear', {
      icon: 'check_circle',
      title: 'No pending reservations',
      subtitle: 'All booking requests are reviewed',
      href: '/admin/reservations.html',
      level: 'info',
    }));
  }

  if (upcoming > 0) {
    feed.push(item('admin:upcoming', {
      icon: 'login',
      title: `${upcoming} upcoming check-in${upcoming === 1 ? '' : 's'}`,
      subtitle: 'Approved room stays starting today or later',
      href: '/admin/reservations.html',
      level: 'info',
    }));
  }

  if (invoicesDue > 0) {
    feed.push(item('admin:billing', {
      icon: 'payments',
      title: `${invoicesDue} invoice${invoicesDue === 1 ? '' : 's'} awaiting payment`,
      subtitle: 'Open billing records need attention',
      href: '/admin/payments.html',
      level: 'warn',
    }));
  }

  const recent = [
    ...recentRooms.map((r) => ({
      ...r,
      kind: 'room',
      label: r.building_name && r.room_number
        ? `${r.building_name} Room ${r.room_number}`
        : 'Room stay',
    })),
    ...recentVenues.map((v) => ({
      ...v,
      kind: 'venue',
      label: v.facility_name || 'Venue booking',
    })),
  ]
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    .slice(0, 5);

  for (const row of recent) {
    const status = String(row.status || '').toLowerCase();
    feed.push(item(`admin:recent:${row.kind}:${row.id}`, {
      icon: row.kind === 'venue' ? 'meeting_room' : 'hotel',
      title: `${row.guest_name || 'Guest'} — ${row.label}`,
      subtitle: `${status.charAt(0).toUpperCase()}${status.slice(1)}${row.kind === 'venue' && row.event_date ? ` · ${String(row.event_date).slice(0, 10)}` : ''}`,
      href: row.kind === 'venue' ? '/admin/reservations.html' : '/admin/reservations.html',
      level: status === 'pending' ? 'warn' : 'info',
      at: row.updated_at,
    }));
  }

  return {
    unreadCount: pendingTotal + invoicesDue,
    items: feed,
  };
}

async function getGuestNotifications(userId) {
  const [
    [pendingRooms],
    [pendingGroups],
    [pendingVenues],
    [approvedUpcoming],
    [recentRooms],
    [recentVenues],
  ] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS c FROM bookings_rooms WHERE user_id = ? AND status = 'Pending' AND group_id IS NULL`,
      [userId],
    ),
    pool.query(
      `SELECT COUNT(*) AS c FROM reservation_groups WHERE user_id = ? AND status = 'Pending'`,
      [userId],
    ),
    pool.query(
      `SELECT COUNT(*) AS c FROM bookings_facilities WHERE user_id = ? AND status = 'Pending'`,
      [userId],
    ),
    pool.query(
      `SELECT COUNT(*) AS c FROM bookings_rooms
       WHERE user_id = ? AND status = 'Approved' AND check_out >= CURDATE()`,
      [userId],
    ),
    pool.query(
      `SELECT id, status, check_in, check_out, updated_at
       FROM bookings_rooms
       WHERE user_id = ? AND status IN ('Pending', 'Approved', 'Rejected')
         AND group_id IS NULL
       ORDER BY updated_at DESC
       LIMIT 5`,
      [userId],
    ),
    pool.query(
      `SELECT id, status, event_date, updated_at, start_time, end_time
       FROM bookings_facilities
       WHERE user_id = ? AND status IN ('Pending', 'Approved', 'Rejected', 'Cancelled')
       ORDER BY updated_at DESC
       LIMIT 5`,
      [userId],
    ),
  ]);

  const pendingRoomCount = Number(pendingRooms[0]?.c || 0);
  const pendingGroupCount = Number(pendingGroups[0]?.c || 0);
  const pendingVenueCount = Number(pendingVenues[0]?.c || 0);
  const pendingTotal = pendingRoomCount + pendingGroupCount + pendingVenueCount;
  const upcoming = Number(approvedUpcoming[0]?.c || 0);

  const feed = [];

  if (pendingTotal > 0) {
    feed.push(item('guest:pending', {
      icon: 'hourglass_top',
      title: `${pendingTotal} request${pendingTotal === 1 ? '' : 's'} awaiting review`,
      subtitle: 'APTS staff will approve or follow up by email',
      href: '/guest/reservations.html',
      level: 'warn',
    }));
  }

  if (upcoming > 0) {
    feed.push(item('guest:upcoming', {
      icon: 'event_available',
      title: `${upcoming} approved stay${upcoming === 1 ? '' : 's'} on your calendar`,
      subtitle: 'View details in My Stays',
      href: '/guest/reservations.html',
      level: 'info',
    }));
  }

  const recent = [
    ...recentRooms.map((r) => ({ ...r, kind: 'room' })),
    ...recentVenues.map((v) => ({ ...v, kind: 'venue' })),
  ]
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    .slice(0, 6);

  for (const row of recent) {
    const status = String(row.status || '').toLowerCase();
    const title = row.kind === 'room'
      ? `Room stay #${row.id} — ${status}`
      : `Venue booking #${row.id} — ${status}`;
    const subtitle = row.kind === 'room'
      ? `${String(row.check_in).slice(0, 10)} → ${String(row.check_out).slice(0, 10)}`
      : `${String(row.event_date).slice(0, 10)}${row.start_time ? ` · ${String(row.start_time).slice(0, 5)}` : ''}`;
    feed.push(item(`guest:recent:${row.kind}:${row.id}`, {
      icon: row.kind === 'venue' ? 'meeting_room' : 'hotel',
      title,
      subtitle,
      href: '/guest/reservations.html',
      level: status === 'pending' ? 'warn' : status === 'rejected' ? 'critical' : 'info',
      at: row.updated_at,
    }));
  }

  if (!feed.length) {
    feed.push(item('guest:welcome', {
      icon: 'info',
      title: 'You are all caught up',
      subtitle: 'Browse facilities to book lodging or a venue',
      href: '/guest/facilities.html',
      level: 'info',
    }));
  }

  return {
    unreadCount: pendingTotal,
    items: feed,
  };
}

export async function getNotificationsForUser(user) {
  if (isAdminPortalRole(user.role)) {
    return getAdminNotifications();
  }
  return getGuestNotifications(user.id);
}
