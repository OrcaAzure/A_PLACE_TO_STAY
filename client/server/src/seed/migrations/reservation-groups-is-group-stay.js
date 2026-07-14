import { pool } from '../../config/db.js';
import { tableExists, columnExists } from '../helpers.js';

/**
 * Marks multi-room vs standalone group shell rows.
 * Single-room booking requests set is_group_stay = 0.
 */
export async function runReservationGroupsIsGroupStayMigration() {
  try {
    if (!(await tableExists('reservation_groups'))) return;
    if (await columnExists('reservation_groups', 'is_group_stay')) return;

    await pool.execute(
      `ALTER TABLE reservation_groups
       ADD COLUMN is_group_stay TINYINT(1) NOT NULL DEFAULT 1 AFTER rooms_requested`
    );
    console.log('[schema] reservation_groups.is_group_stay added');
  } catch (err) {
    console.warn('[schema] reservation_groups.is_group_stay skipped:', err.message);
  }
}
