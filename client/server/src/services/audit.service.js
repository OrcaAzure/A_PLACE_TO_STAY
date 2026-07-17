import { pool } from '../config/db.js';

export const AUDIT_ACTIONS = {
  GUEST_ACCOUNT_CREATED: 'guest_account_created',
  GUEST_ACCOUNT_ACTIVATED: 'guest_account_activated',
  GUEST_ACCOUNT_DEACTIVATED: 'guest_account_deactivated',
  GUEST_ACCOUNT_DELETED: 'guest_account_deleted',
  GUEST_BULK_DEACTIVATED: 'guest_bulk_deactivated',
  GUEST_ACCESS_REQUEST_CREATED: 'guest_access_request_created',
  GUEST_ACCESS_REQUEST_APPROVED: 'guest_access_request_approved',
  GUEST_ACCESS_REQUEST_REJECTED: 'guest_access_request_rejected',
  UNAUTHORIZED_WRITE_ATTEMPT: 'unauthorized_write_attempt',
};

const GUEST_ACCESS_ACTIONS = new Set(Object.values(AUDIT_ACTIONS));

export async function logAudit({ actorUserId = null, action, entityType, entityId = null, details = null }) {
  await pool.query(
    `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details)
     VALUES (?, ?, ?, ?, ?)`,
    [
      actorUserId,
      action,
      entityType,
      entityId,
      details ? JSON.stringify(details) : null,
    ]
  );
}

/** Best-effort audit when a view-only role attempts a blocked write. */
export async function logUnauthorizedAccess(req, extra = {}) {
  if (!req?.user?.id) return;
  await logAudit({
    actorUserId: req.user.id,
    action: AUDIT_ACTIONS.UNAUTHORIZED_WRITE_ATTEMPT,
    entityType: 'api',
    entityId: null,
    details: {
      method: req.method,
      path: req.originalUrl || req.url,
      role: req.user.role,
      ...extra,
    },
  });
}

function formatAuditSummary(row) {
  let details = {};
  try {
    details = row.details ? (typeof row.details === 'string' ? JSON.parse(row.details) : row.details) : {};
  } catch {
    details = {};
  }

  const actor = row.actor_name || 'System';
  const target = details.full_name || details.email || details.label || '';

  switch (row.action) {
    case AUDIT_ACTIONS.GUEST_ACCOUNT_CREATED:
      return `${actor} created guest account for ${target || 'a guest'}`;
    case AUDIT_ACTIONS.GUEST_ACCOUNT_ACTIVATED:
      return `${actor} reactivated guest access for ${target || 'a guest'}`;
    case AUDIT_ACTIONS.GUEST_ACCOUNT_DEACTIVATED:
      return `${actor} deactivated guest access for ${target || 'a guest'}`;
    case AUDIT_ACTIONS.GUEST_ACCOUNT_DELETED:
      return `${actor} deleted guest account for ${target || 'a guest'}`;
    case AUDIT_ACTIONS.GUEST_BULK_DEACTIVATED:
      return `${actor} bulk-deactivated ${details.count || 0} guest account(s)`;
    case AUDIT_ACTIONS.GUEST_ACCESS_REQUEST_CREATED:
      return `${actor} logged access request for ${target || 'a guest'}`;
    case AUDIT_ACTIONS.GUEST_ACCESS_REQUEST_APPROVED:
      return `${actor} approved access request for ${target || 'a guest'}`;
    case AUDIT_ACTIONS.GUEST_ACCESS_REQUEST_REJECTED:
      return `${actor} rejected access request for ${target || 'a guest'}`;
    case AUDIT_ACTIONS.UNAUTHORIZED_WRITE_ATTEMPT:
      return `${actor} attempted unauthorized ${details.method || 'write'} on ${details.path || 'an endpoint'}`;
    default:
      return `${actor} performed ${row.action}`;
  }
}

export async function listGuestAccessActivity(limit = 25) {
  const actions = [...GUEST_ACCESS_ACTIONS];
  const placeholders = actions.map(() => '?').join(',');

  const [rows] = await pool.query(
    `SELECT al.*, u.full_name AS actor_name
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.actor_user_id
     WHERE al.action IN (${placeholders})
     ORDER BY al.created_at DESC
     LIMIT ?`,
    [...actions, limit]
  );

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    actorName: row.actor_name || 'System',
    summary: formatAuditSummary(row),
    createdAt: row.created_at,
  }));
}
