/**
 * View-Only Admin (supervisory) accounts — created and managed by Super Admins
 * on the Team Access page. Internal @apts.edu emails only; external visitors
 * belong on Guest Access.
 */
import bcrypt from 'bcryptjs';
import { pool } from '../config/db.js';
import { safeUser, isEmpty } from '../utils/helpers.js';
import { ROLES } from '../utils/constants.js';
import { isInternalGuestEmail } from '../utils/guestAccess.js';
import { generateTempPassword, findUserByEmail, isManagedExternalGuest } from './user.service.js';
import { sendPortalStaffAccessEmail } from './email.service.js';
import { logAudit, AUDIT_ACTIONS } from './audit.service.js';
import { invalidateSession } from './session.service.js';

const STAFF_COLUMNS = 'id, full_name, email, role, status, created_at, updated_at';

export function describePortalStaffEmailConflict(existing) {
  if (!existing) return 'Email is already in use';

  if (existing.role === ROLES.SUPER_ADMIN) {
    return `${existing.full_name} is already a Housing Administrator (Super Admin).`;
  }

  if (existing.role === ROLES.VIEW_ONLY_ADMIN) {
    if (existing.status === 'Active') {
      return `A view-only admin account for ${existing.full_name} (${existing.email}) already exists.`;
    }
    return `A view-only admin account for ${existing.full_name} (${existing.email}) exists but is inactive. Creating again will reactivate it.`;
  }

  if (isManagedExternalGuest(existing)) {
    return `This email belongs to an external guest (${existing.full_name}). Use Guest Access for external visitors.`;
  }

  if (existing.role === ROLES.GUEST && isInternalGuestEmail(existing.email)) {
    return `This email belongs to ${existing.full_name}, an internal community guest account. Granting team access will upgrade them to View-Only Admin.`;
  }

  return `This email is already used by ${existing.full_name} (${existing.role}).`;
}

async function grantViewOnlyAccess({ userId, full_name, tempPassword, actorUserId, auditAction, details = {} }) {
  const hashedPassword = await bcrypt.hash(tempPassword, 10);
  await pool.query(
    `UPDATE users SET full_name = ?, password = ?, role = ?, status = ? WHERE id = ?`,
    [full_name.trim(), hashedPassword, ROLES.VIEW_ONLY_ADMIN, 'Active', userId],
  );

  const [rows] = await pool.query(`SELECT ${STAFF_COLUMNS} FROM users WHERE id = ? LIMIT 1`, [userId]);
  const user = rows[0];
  void sendPortalStaffAccessEmail(user, tempPassword);
  await invalidateSession(userId);

  if (actorUserId) {
    await logAudit({
      actorUserId,
      action: auditAction,
      entityType: 'user',
      entityId: user.id,
      details: { full_name: user.full_name, email: user.email, ...details },
    });
  }

  return {
    user: safeUser(user),
    temporaryPassword: tempPassword,
  };
}

/** List all View-Only Admin accounts for the Team Access page. */
export async function listPortalStaff() {
  const [rows] = await pool.query(
    `SELECT ${STAFF_COLUMNS} FROM users WHERE role = ? ORDER BY full_name ASC`,
    [ROLES.VIEW_ONLY_ADMIN],
  );

  const active = rows.filter((r) => r.status === 'Active').length;
  return {
    summary: { total: rows.length, active, inactive: rows.length - active },
    staff: rows.map(safeUser),
  };
}

/**
 * Create or reactivate a View-Only Admin. Requires an internal APTS email.
 * @returns {{ message: string, user: object, temporaryPassword: string, reactivated?: boolean, promoted?: boolean }}
 */
export async function createViewOnlyAdminUser({ full_name, email, actorUserId = null }) {
  if (isEmpty(full_name) || isEmpty(email)) {
    throw new Error('Full name and email are required');
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error('Please enter a valid email address');
  }
  if (!isInternalGuestEmail(normalizedEmail)) {
    throw new Error('Team access requires an internal APTS email (@apts.edu or @apts.edu.ph). Use Guest Access for external visitors.');
  }

  const existing = await findUserByEmail(normalizedEmail);
  const tempPassword = generateTempPassword();

  if (existing) {
    if (existing.role === ROLES.SUPER_ADMIN) {
      throw new Error(describePortalStaffEmailConflict(existing));
    }

    if (existing.role === ROLES.VIEW_ONLY_ADMIN) {
      if (existing.status === 'Active') {
        throw new Error(describePortalStaffEmailConflict(existing));
      }

      const { user, temporaryPassword } = await grantViewOnlyAccess({
        userId: existing.id,
        full_name,
        tempPassword,
        actorUserId,
        auditAction: AUDIT_ACTIONS.PORTAL_STAFF_ACTIVATED,
        details: { reactivated: true },
      });

      return {
        message: 'View-only admin reactivated',
        user,
        temporaryPassword,
        reactivated: true,
      };
    }

    if (isManagedExternalGuest(existing)) {
      throw new Error(describePortalStaffEmailConflict(existing));
    }

    if (existing.role === ROLES.GUEST) {
      const { user, temporaryPassword } = await grantViewOnlyAccess({
        userId: existing.id,
        full_name,
        tempPassword,
        actorUserId,
        auditAction: AUDIT_ACTIONS.PORTAL_STAFF_CREATED,
        details: { promotedFromGuest: true },
      });

      return {
        message: 'View-only admin access granted',
        user,
        temporaryPassword,
        promoted: true,
      };
    }

    throw new Error(describePortalStaffEmailConflict(existing));
  }

  const hashedPassword = await bcrypt.hash(tempPassword, 10);
  const [result] = await pool.query(
    'INSERT INTO users (full_name, email, password, role, status) VALUES (?, ?, ?, ?, ?)',
    [full_name.trim(), normalizedEmail, hashedPassword, ROLES.VIEW_ONLY_ADMIN, 'Active'],
  );

  const [rows] = await pool.query(`SELECT ${STAFF_COLUMNS} FROM users WHERE id = ? LIMIT 1`, [result.insertId]);
  const user = rows[0];
  void sendPortalStaffAccessEmail(user, tempPassword);

  if (actorUserId) {
    await logAudit({
      actorUserId,
      action: AUDIT_ACTIONS.PORTAL_STAFF_CREATED,
      entityType: 'user',
      entityId: user.id,
      details: { full_name: user.full_name, email: user.email },
    });
  }

  return {
    message: 'View-only admin created',
    user: safeUser(user),
    temporaryPassword: tempPassword,
  };
}

/** Update name or active status for a View-Only Admin account. */
export async function updatePortalStaffUser(userId, { full_name, status }, actorUserId = null) {
  const [existing] = await pool.query(`SELECT * FROM users WHERE id = ? LIMIT 1`, [userId]);
  if (!existing.length) throw new Error('User not found');

  const target = existing[0];
  if (target.role !== ROLES.VIEW_ONLY_ADMIN) {
    throw new Error('Only view-only admin accounts can be managed on Team Access');
  }

  if (status && !['Active', 'Inactive'].includes(status)) {
    throw new Error('Invalid status');
  }

  await pool.query(
    `UPDATE users SET
      full_name = COALESCE(?, full_name),
      status    = COALESCE(?, status)
    WHERE id = ?`,
    [full_name?.trim() || null, status || null, userId],
  );

  if (status && status !== target.status && actorUserId) {
    await logAudit({
      actorUserId,
      action: status === 'Active'
        ? AUDIT_ACTIONS.PORTAL_STAFF_ACTIVATED
        : AUDIT_ACTIONS.PORTAL_STAFF_DEACTIVATED,
      entityType: 'user',
      entityId: target.id,
      details: { full_name: target.full_name, email: target.email },
    });
  }

  const [updated] = await pool.query(`SELECT ${STAFF_COLUMNS} FROM users WHERE id = ?`, [userId]);
  return safeUser(updated[0]);
}

/** Permanently remove a View-Only Admin account from Team Access. */
export async function deletePortalStaffUser(userId, actorUserId = null) {
  const [existing] = await pool.query(`SELECT ${STAFF_COLUMNS} FROM users WHERE id = ? LIMIT 1`, [userId]);
  if (!existing.length) throw new Error('User not found');

  const target = existing[0];
  if (target.role !== ROLES.VIEW_ONLY_ADMIN) {
    throw new Error('Only view-only admin accounts can be deleted from Team Access');
  }

  await invalidateSession(userId);

  try {
    await pool.query('DELETE FROM users WHERE id = ?', [userId]);
  } catch (err) {
    if (err?.code === 'ER_ROW_IS_REFERENCED_2' || err?.errno === 1451) {
      throw new Error(
        'This account has related records on file and cannot be permanently deleted. Deactivate the account instead.',
      );
    }
    throw err;
  }

  if (actorUserId) {
    await logAudit({
      actorUserId,
      action: AUDIT_ACTIONS.PORTAL_STAFF_DELETED,
      entityType: 'user',
      entityId: Number(userId),
      details: { full_name: target.full_name, email: target.email },
    });
  }

  return { deleted: true, userId: Number(userId) };
}
