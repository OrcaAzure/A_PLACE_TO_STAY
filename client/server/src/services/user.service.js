import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { pool } from '../config/db.js';
import { safeUser, isEmpty } from '../utils/helpers.js';
import { ROLES } from '../utils/constants.js';
import { sendGuestAccessEmail } from './email.service.js';
import { logAudit, AUDIT_ACTIONS } from './audit.service.js';

export function generateTempPassword() {
  const segment = crypto.randomBytes(3).toString('hex');
  const digits = String(crypto.randomInt(1000, 9999));
  return `${segment}${digits}`;
}

export async function createGuestUser({ full_name, email, organization, actorUserId = null }) {
  if (isEmpty(full_name) || isEmpty(email)) {
    throw new Error('Full name and email are required');
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error('Please enter a valid email address');
  }

  const [existing] = await pool.query(
    'SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1',
    [normalizedEmail]
  );
  if (existing.length) {
    throw new Error('Email is already in use');
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
