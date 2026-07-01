import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { pool } from '../config/db.js';
import { safeUser, isEmpty } from '../utils/helpers.js';
import { ROLES } from '../utils/constants.js';
import { sendGuestAccessEmail } from './email.service.js';
import { logAudit, AUDIT_ACTIONS } from './audit.service.js';

const INTERNAL_PORTAL_ROLES = new Set([
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN,
  ROLES.SUPERVISORY_USER,
  ROLES.GMC,
  ROLES.FACULTY,
  ROLES.STAFF,
  ROLES.MISSIONARY,
]);

export function generateTempPassword() {
  const segment = crypto.randomBytes(3).toString('hex');
  const digits = String(crypto.randomInt(1000, 9999));
  return `${segment}${digits}`;
}

export async function findUserByEmail(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return null;
  const [rows] = await pool.query(
    'SELECT id, full_name, email, role, status FROM users WHERE LOWER(email) = ? LIMIT 1',
    [normalizedEmail],
  );
  return rows[0] || null;
}

export function describeGuestEmailConflict(existing) {
  if (!existing) return 'Email is already in use';

  if (existing.role === ROLES.EXTERNAL_GUEST) {
    if (existing.status === 'Active') {
      return `A guest account for ${existing.full_name} (${existing.email}) already exists. Look for them in the guest accounts list below.`;
    }
    return `A guest account for ${existing.full_name} (${existing.email}) already exists but is inactive. Creating again will reactivate it.`;
  }

  if (INTERNAL_PORTAL_ROLES.has(existing.role)) {
    return `This email belongs to ${existing.full_name}, an internal ${existing.role} account. Guest Access is for external visitors — that person already has an APTS login and will not appear in this list.`;
  }

  return `This email is already used by ${existing.full_name} (${existing.role}). Guest Access only lists External Guest accounts.`;
}

export async function createGuestUser({ full_name, email, organization, actorUserId = null }) {
  if (isEmpty(full_name) || isEmpty(email)) {
    throw new Error('Full name and email are required');
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error('Please enter a valid email address');
  }

  const existing = await findUserByEmail(normalizedEmail);
  if (existing) {
    if (existing.role === ROLES.EXTERNAL_GUEST) {
      if (existing.status === 'Active') {
        throw new Error(describeGuestEmailConflict(existing));
      }

      const tempPassword = generateTempPassword();
      const hashedPassword = await bcrypt.hash(tempPassword, 10);
      await pool.query(
        'UPDATE users SET full_name = ?, password = ?, status = ? WHERE id = ?',
        [full_name.trim(), hashedPassword, 'Active', existing.id],
      );

      const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [existing.id]);
      const user = rows[0];
      void sendGuestAccessEmail(user, tempPassword);

      if (actorUserId) {
        await logAudit({
          actorUserId,
          action: AUDIT_ACTIONS.GUEST_ACCOUNT_ACTIVATED,
          entityType: 'user',
          entityId: user.id,
          details: {
            full_name: user.full_name,
            email: user.email,
            organization: organization?.trim() || null,
            reactivated: true,
          },
        });
      }

      return {
        message: 'Guest account reactivated',
        user: safeUser(user),
        temporaryPassword: tempPassword,
        reactivated: true,
      };
    }

    throw new Error(describeGuestEmailConflict(existing));
  }

  const tempPassword = generateTempPassword();
  const hashedPassword = await bcrypt.hash(tempPassword, 10);

  const [result] = await pool.query(
    'INSERT INTO users (full_name, email, password, role, status) VALUES (?, ?, ?, ?, ?)',
    [full_name.trim(), normalizedEmail, hashedPassword, ROLES.EXTERNAL_GUEST, 'Active']
  );

  const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [result.insertId]);
  const user = rows[0];
  void sendGuestAccessEmail(user, tempPassword);

  if (actorUserId) {
    await logAudit({
      actorUserId,
      action: AUDIT_ACTIONS.GUEST_ACCOUNT_CREATED,
      entityType: 'user',
      entityId: user.id,
      details: {
        full_name: user.full_name,
        email: user.email,
        organization: organization?.trim() || null,
      },
    });
  }

  return {
    message: 'Guest account created',
    user: safeUser(user),
    temporaryPassword: tempPassword,
  };
}
