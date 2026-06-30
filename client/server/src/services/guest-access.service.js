import { pool } from '../config/db.js';
import { safeUser } from '../utils/helpers.js';
import { ROLES } from '../utils/constants.js';
import { createGuestUser } from './user.service.js';
import { logAudit, AUDIT_ACTIONS, listGuestAccessActivity } from './audit.service.js';

const REVIEW_DAYS = 7;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromStr, toStr) {
  const from = new Date(`${fromStr}T12:00:00`);
  const to = new Date(`${toStr}T12:00:00`);
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
}

function normalizeStay(row) {
  const checkIn = String(row.check_in).slice(0, 10);
  const checkOut = String(row.check_out).slice(0, 10);
  return {
    kind: row.kind,
    id: row.id,
    status: row.status,
    checkIn,
    checkOut,
    label: row.label || 'Reservation',
  };
}

function buildStayList(soloBookings, groups) {
  const stays = [];

  for (const g of groups) {
    stays.push(normalizeStay({
      kind: 'group',
      id: g.id,
      status: g.status,
      check_in: g.check_in,
      check_out: g.check_out,
      label: g.group_name || 'Group stay',
    }));
  }

  for (const b of soloBookings) {
    const roomLabel = b.building_name && b.room_number
      ? `${b.building_name} — ${b.room_number}`
      : 'Room booking';
    stays.push(normalizeStay({
      kind: 'booking',
      id: b.id,
      status: b.status,
      check_in: b.check_in,
      check_out: b.check_out,
      label: roomLabel,
    }));
  }

  return stays;
}

function resolveStayContext(stays, today) {
  const weekEnd = addDays(today, 7);
  const reviewCutoff = addDays(today, -REVIEW_DAYS);

  const approved = stays.filter((s) => s.status === 'Approved');
  const pending = stays.filter((s) => s.status === 'Pending' && s.checkOut > today);

  const inStay = approved.find((s) => s.checkIn <= today && s.checkOut > today);
  if (inStay) {
    return {
      phase: 'in_stay',
      reservation: inStay,
      summary: `In stay · ${inStay.checkIn} → ${inStay.checkOut}`,
      needsReview: false,
    };
  }

  const arriving = approved
    .filter((s) => s.checkIn > today && s.checkIn <= weekEnd)
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  if (arriving.length) {
    const next = arriving[0];
    return {
      phase: 'arriving',
      reservation: next,
      summary: `Arriving ${next.checkIn}`,
      needsReview: false,
    };
  }

  if (pending.length) {
    const next = pending.sort((a, b) => a.checkIn.localeCompare(b.checkIn))[0];
    return {
      phase: 'pending',
      reservation: next,
      summary: `Pending · ${next.checkIn} → ${next.checkOut}`,
      needsReview: false,
    };
  }

  const upcoming = approved
    .filter((s) => s.checkIn > today)
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  if (upcoming.length) {
    const next = upcoming[0];
    return {
      phase: 'upcoming',
      reservation: next,
      summary: `Upcoming · ${next.checkIn}`,
      needsReview: false,
    };
  }

  const pastApproved = approved
    .filter((s) => s.checkOut <= today)
    .sort((a, b) => b.checkOut.localeCompare(a.checkOut));
  if (pastApproved.length) {
    const last = pastApproved[0];
    const daysSince = daysBetween(last.checkOut, today);
    const needsReview = last.checkOut <= reviewCutoff;
    return {
      phase: 'ended',
      reservation: last,
      summary: `Stay ended ${last.checkOut}`,
      daysSinceCheckout: daysSince,
      needsReview,
    };
  }

  return {
    phase: 'none',
    reservation: null,
    summary: 'No reservations',
    needsReview: false,
  };
}

export async function getGuestAccessOverview() {
  const today = todayStr();
  const weekEnd = addDays(today, 7);

  const [guests] = await pool.query(
    'SELECT * FROM users WHERE role = ? ORDER BY created_at DESC',
    [ROLES.EXTERNAL_GUEST]
  );

  if (!guests.length) {
    return {
      summary: {
        arrivingThisWeek: 0,
        currentlyStaying: 0,
        needsReview: 0,
        pendingRequests: 0,
        activeAccounts: 0,
        inactiveAccounts: 0,
        totalAccounts: 0,
      },
      guests: [],
    };
  }

  const ids = guests.map((g) => g.id);
  const placeholders = ids.map(() => '?').join(',');

  const [bookings] = await pool.query(
    `SELECT bk.id, bk.user_id, bk.status, bk.check_in, bk.check_out, bk.group_id,
            r.room_number, b.name AS building_name
     FROM bookings_rooms bk
     LEFT JOIN rooms r ON bk.room_id = r.id
     LEFT JOIN buildings b ON r.building_id = b.id
     WHERE bk.user_id IN (${placeholders})`,
    ids
  );

  const [groups] = await pool.query(
    `SELECT id, user_id, group_name, status, check_in, check_out
     FROM reservation_groups
     WHERE user_id IN (${placeholders})`,
    ids
  );

  const [[{ pendingRequests }]] = await pool.query(
    `SELECT COUNT(*) AS pendingRequests FROM guest_access_requests WHERE status = 'Pending'`
  );

  const bookingsByUser = new Map();
  for (const b of bookings) {
    if (!bookingsByUser.has(b.user_id)) bookingsByUser.set(b.user_id, []);
    bookingsByUser.get(b.user_id).push(b);
  }

  const groupsByUser = new Map();
  for (const g of groups) {
    if (!groupsByUser.has(g.user_id)) groupsByUser.set(g.user_id, []);
    groupsByUser.get(g.user_id).push(g);
  }

  let arrivingThisWeek = 0;
  let currentlyStaying = 0;
  let needsReview = 0;
  let activeAccounts = 0;
  let inactiveAccounts = 0;

  const guestRows = guests.map((guest) => {
    const userBookings = bookingsByUser.get(guest.id) || [];
    const userGroups = groupsByUser.get(guest.id) || [];
    const soloBookings = userBookings.filter((b) => !b.group_id);
    const stays = buildStayList(soloBookings, userGroups);
    const stay = resolveStayContext(stays, today);

    if (guest.status === 'Active') activeAccounts += 1;
    else inactiveAccounts += 1;

    if (stay.phase === 'in_stay') currentlyStaying += 1;
    if (stay.phase === 'arriving') arrivingThisWeek += 1;
    if (guest.status === 'Active' && stay.needsReview) needsReview += 1;

    return {
      ...safeUser(guest),
      stay: {
        phase: stay.phase,
        summary: stay.summary,
        needsReview: guest.status === 'Active' && stay.needsReview,
        daysSinceCheckout: stay.daysSinceCheckout ?? null,
        reservation: stay.reservation
          ? {
              kind: stay.reservation.kind,
              id: stay.reservation.id,
              status: stay.reservation.status,
              checkIn: stay.reservation.checkIn,
              checkOut: stay.reservation.checkOut,
              label: stay.reservation.label,
            }
          : null,
      },
    };
  });

  return {
    summary: {
      arrivingThisWeek,
      currentlyStaying,
      needsReview,
      pendingRequests: Number(pendingRequests) || 0,
      activeAccounts,
      inactiveAccounts,
      totalAccounts: guests.length,
      weekEnd,
    },
    guests: guestRows,
  };
}

function mapAccessRequest(row) {
  return {
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    organization: row.organization,
    notes: row.notes,
    status: row.status,
    user_id: row.user_id,
    review_notes: row.review_notes,
    reviewed_at: row.reviewed_at,
    created_at: row.created_at,
  };
}

export async function listGuestAccessRequests({ status } = {}) {
  let sql = 'SELECT * FROM guest_access_requests';
  const params = [];
  if (status) {
    sql += ' WHERE status = ?';
    params.push(status);
  }
  sql += ' ORDER BY FIELD(status, \'Pending\', \'Approved\', \'Rejected\'), created_at DESC';
  const [rows] = await pool.query(sql, params);
  return rows.map(mapAccessRequest);
}

export async function createGuestAccessRequest({ full_name, email, organization, notes, actorUserId }) {
  const name = String(full_name || '').trim();
  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (!name || !normalizedEmail) {
    throw new Error('Full name and email are required');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error('Please enter a valid email address');
  }

  const [pending] = await pool.query(
    `SELECT id FROM guest_access_requests WHERE LOWER(email) = ? AND status = 'Pending' LIMIT 1`,
    [normalizedEmail]
  );
  if (pending.length) {
    throw new Error('A pending access request already exists for this email');
  }

  const [result] = await pool.query(
    `INSERT INTO guest_access_requests (full_name, email, organization, notes)
     VALUES (?, ?, ?, ?)`,
    [name, normalizedEmail, organization?.trim() || null, notes?.trim() || null]
  );

  if (actorUserId) {
    await logAudit({
      actorUserId,
      action: AUDIT_ACTIONS.GUEST_ACCESS_REQUEST_CREATED,
      entityType: 'guest_access_request',
      entityId: result.insertId,
      details: { full_name: name, email: normalizedEmail, organization: organization?.trim() || null },
    });
  }

  const [rows] = await pool.query('SELECT * FROM guest_access_requests WHERE id = ?', [result.insertId]);
  return mapAccessRequest(rows[0]);
}

export async function approveGuestAccessRequest(requestId, actorUserId) {
  const [rows] = await pool.query('SELECT * FROM guest_access_requests WHERE id = ? LIMIT 1', [requestId]);
  if (!rows.length) throw new Error('Access request not found');

  const request = rows[0];
  if (request.status !== 'Pending') {
    throw new Error('Only pending requests can be approved');
  }

  let userId = request.user_id;
  let temporaryPassword = null;
  let user;

  const [existingUser] = await pool.query(
    'SELECT * FROM users WHERE LOWER(email) = ? LIMIT 1',
    [String(request.email).toLowerCase()]
  );

  if (existingUser.length) {
    user = existingUser[0];
    userId = user.id;
    if (user.status === 'Inactive') {
      await pool.query('UPDATE users SET status = ? WHERE id = ?', ['Active', userId]);
      user.status = 'Active';
      if (actorUserId) {
        await logAudit({
          actorUserId,
          action: AUDIT_ACTIONS.GUEST_ACCOUNT_ACTIVATED,
          entityType: 'user',
          entityId: userId,
          details: { full_name: user.full_name, email: user.email, via: 'access_request' },
        });
      }
    }
  } else {
    const created = await createGuestUser({
      full_name: request.full_name,
      email: request.email,
      actorUserId,
    });
    user = created.user;
    userId = user.id;
    temporaryPassword = created.temporaryPassword;
  }

  await pool.query(
    `UPDATE guest_access_requests
     SET status = 'Approved', user_id = ?, reviewed_by = ?, reviewed_at = NOW()
     WHERE id = ?`,
    [userId, actorUserId, requestId]
  );

  if (actorUserId) {
    await logAudit({
      actorUserId,
      action: AUDIT_ACTIONS.GUEST_ACCESS_REQUEST_APPROVED,
      entityType: 'guest_access_request',
      entityId: Number(requestId),
      details: { full_name: request.full_name, email: request.email, user_id: userId },
    });
  }

  return {
    request: mapAccessRequest({ ...request, status: 'Approved', user_id: userId }),
    user: safeUser(user),
    temporaryPassword,
  };
}

export async function rejectGuestAccessRequest(requestId, { review_notes, actorUserId }) {
  const [rows] = await pool.query('SELECT * FROM guest_access_requests WHERE id = ? LIMIT 1', [requestId]);
  if (!rows.length) throw new Error('Access request not found');

  const request = rows[0];
  if (request.status !== 'Pending') {
    throw new Error('Only pending requests can be rejected');
  }

  await pool.query(
    `UPDATE guest_access_requests
     SET status = 'Rejected', reviewed_by = ?, review_notes = ?, reviewed_at = NOW()
     WHERE id = ?`,
    [actorUserId, review_notes?.trim() || null, requestId]
  );

  if (actorUserId) {
    await logAudit({
      actorUserId,
      action: AUDIT_ACTIONS.GUEST_ACCESS_REQUEST_REJECTED,
      entityType: 'guest_access_request',
      entityId: Number(requestId),
      details: { full_name: request.full_name, email: request.email, review_notes: review_notes?.trim() || null },
    });
  }

  const [updated] = await pool.query('SELECT * FROM guest_access_requests WHERE id = ?', [requestId]);
  return mapAccessRequest(updated[0]);
}

export async function bulkDeactivateGuests({ actorUserId, userIds = null }) {
  const overview = await getGuestAccessOverview();
  let targets;

  if (userIds?.length) {
    const idSet = new Set(userIds.map(Number));
    targets = overview.guests.filter((g) => idSet.has(g.id) && g.status === 'Active');
  } else {
    targets = overview.guests.filter((g) => g.status === 'Active' && g.stay?.needsReview);
  }

  if (!targets.length) {
    throw new Error('No active guest accounts matched for deactivation');
  }

  const ids = targets.map((t) => t.id);
  const placeholders = ids.map(() => '?').join(',');
  await pool.query(`UPDATE users SET status = 'Inactive' WHERE id IN (${placeholders})`, ids);

  if (actorUserId) {
    await logAudit({
      actorUserId,
      action: AUDIT_ACTIONS.GUEST_BULK_DEACTIVATED,
      entityType: 'user',
      entityId: null,
      details: {
        count: ids.length,
        user_ids: ids,
        labels: targets.map((t) => ({ id: t.id, full_name: t.full_name, email: t.email })),
      },
    });
  }

  return { deactivated: ids.length, userIds: ids };
}
