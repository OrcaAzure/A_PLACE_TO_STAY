import { pool } from '../../config/db.js';
import { tableExists, columnExists } from '../helpers.js';

/** Expand users.role enum through historical stages (legacy DBs). */
export async function runUsersRoleExpansion() {
  await pool.execute(
    `ALTER TABLE users
     MODIFY role ENUM(
       'Super Admin',
       'Admin',
       'GNC View Only',
       'Supervisory User',
       'GMC',
       'Faculty',
       'Staff',
       'Missionary'
     ) NOT NULL DEFAULT 'Faculty'`
  );

  try {
    await pool.execute(
      `UPDATE users SET role = 'Supervisory User' WHERE role = 'GNC View Only'`
    );
  } catch {
    /* legacy role may not exist */
  }

  await pool.execute(
    `ALTER TABLE users
     MODIFY role ENUM(
       'Super Admin',
       'Admin',
       'Supervisory User',
       'GMC',
       'Faculty',
       'Staff',
       'Missionary',
       'External Guest'
     ) NOT NULL DEFAULT 'Faculty'`
  );

  try {
    await pool.execute(
      `UPDATE users SET role = 'External Guest' WHERE email LIKE '%@aptspace.local'`
    );
  } catch {
    /* walk-in guests may not exist */
  }

  try {
    await pool.execute(
      `UPDATE users SET role = 'External Guest'
       WHERE role IN ('Guest', 'guest', 'External guest')`
    );
  } catch {
    /* legacy role labels may not exist */
  }

  try {
    await pool.execute(
      `UPDATE users u
       INNER JOIN bookings_rooms b ON b.user_id = u.id
       SET u.role = 'External Guest'
       WHERE u.role NOT IN (
         'Super Admin', 'Admin', 'Supervisory User', 'GMC',
         'Faculty', 'Staff', 'Missionary', 'External Guest'
       )
         AND LOWER(u.email) NOT LIKE '%@apts.edu%'
         AND LOWER(u.email) NOT LIKE '%@apts.edu.ph%'`
    );
  } catch {
    /* lodging guests may not need role repair */
  }
}

/** Single-session auth columns. */
export async function runUsersSessionColumns() {
  if (await tableExists('users') && !(await columnExists('users', 'session_id'))) {
    try {
      await pool.execute('ALTER TABLE users ADD COLUMN session_id VARCHAR(64) NULL AFTER status');
      console.log('[schema] Added users.session_id for single-session auth');
    } catch (err) {
      console.warn('[schema] users.session_id skipped:', err.message);
    }
  }

  if (await tableExists('users') && !(await columnExists('users', 'session_expires_at'))) {
    try {
      await pool.execute(
        'ALTER TABLE users ADD COLUMN session_expires_at TIMESTAMP NULL AFTER session_id'
      );
      console.log('[schema] Added users.session_expires_at for session expiry');
    } catch (err) {
      console.warn('[schema] users.session_expires_at skipped:', err.message);
    }
  }
}

/** Collapse historical roles to Super Admin / Supervisory User / Guest. */
export async function runUsersRoleSimplify() {
  if (!(await tableExists('users'))) return;

  await pool.execute(
    `ALTER TABLE users
     MODIFY role ENUM(
       'Super Admin', 'Admin', 'Supervisory User', 'GMC', 'Faculty', 'Staff',
       'Missionary', 'External Guest', 'Guest'
     ) NOT NULL DEFAULT 'Guest'`
  );
  await pool.execute(`UPDATE users SET role = 'Super Admin' WHERE role = 'Admin'`);
  await pool.execute(
    `UPDATE users SET role = 'Guest'
     WHERE role IN ('GMC', 'Faculty', 'Staff', 'Missionary', 'External Guest', 'GNC View Only')`
  );
  await pool.execute(
    `ALTER TABLE users
     MODIFY role ENUM('Super Admin', 'Supervisory User', 'Guest') NOT NULL DEFAULT 'Guest'`
  );
  console.log('[schema] Simplified users.role to Super Admin / Supervisory User / Guest');
}

/** Repair empty/null roles to Guest. */
export async function runUsersEmptyRoleRepair() {
  if (!(await tableExists('users'))) return;

  const [result] = await pool.execute(
    `UPDATE users SET role = 'Guest'
     WHERE role = '' OR role IS NULL`
  );
  if (result.affectedRows > 0) {
    console.log(`[schema] Repaired ${result.affectedRows} user(s) with empty role → Guest`);
  }
}

/** Drop obsolete profile columns; add contact_phone. */
export async function runUsersProfileCleanup() {
  if (!(await tableExists('users'))) return;

  if (await columnExists('users', 'preferred_language')) {
    await pool.execute('ALTER TABLE users DROP COLUMN preferred_language');
    console.log('[schema] Removed users.preferred_language');
  }
  if (await columnExists('users', 'email_modification_notices_enabled')) {
    await pool.execute('ALTER TABLE users DROP COLUMN email_modification_notices_enabled');
    console.log('[schema] Removed users.email_modification_notices_enabled');
  }
  if (await columnExists('users', 'email_notifications_enabled')) {
    await pool.execute('ALTER TABLE users DROP COLUMN email_notifications_enabled');
    console.log('[schema] Removed users.email_notifications_enabled');
  }
  if (!(await columnExists('users', 'contact_phone'))) {
    await pool.execute(
      `ALTER TABLE users
       ADD COLUMN contact_phone VARCHAR(30) DEFAULT NULL
       AFTER session_expires_at`
    );
    console.log('[schema] Added users.contact_phone');
  }
}
