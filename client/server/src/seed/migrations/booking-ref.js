import { pool } from '../../config/db.js';
import { tableExists, columnExists } from '../helpers.js';

/**
 * Dedicated booking_ref columns so refs are not stuffed into notes.
 * Applies to room stays, groups, and venue bookings.
 */
export async function runBookingRefMigration() {
  try {
    if (await tableExists('bookings_rooms') && !(await columnExists('bookings_rooms', 'booking_ref'))) {
      await pool.execute(
        `ALTER TABLE bookings_rooms
         ADD COLUMN booking_ref VARCHAR(40) DEFAULT NULL AFTER notes`
      );
      console.log('[schema] bookings_rooms.booking_ref added');
    }
  } catch (err) {
    console.warn('[schema] bookings_rooms.booking_ref skipped:', err.message);
  }

  try {
    if (await tableExists('reservation_groups') && !(await columnExists('reservation_groups', 'booking_ref'))) {
      await pool.execute(
        `ALTER TABLE reservation_groups
         ADD COLUMN booking_ref VARCHAR(40) DEFAULT NULL AFTER notes`
      );
      console.log('[schema] reservation_groups.booking_ref added');
    }
  } catch (err) {
    console.warn('[schema] reservation_groups.booking_ref skipped:', err.message);
  }

  try {
    if (await tableExists('bookings_facilities') && !(await columnExists('bookings_facilities', 'booking_ref'))) {
      await pool.execute(
        `ALTER TABLE bookings_facilities
         ADD COLUMN booking_ref VARCHAR(40) DEFAULT NULL AFTER notes`
      );
      console.log('[schema] bookings_facilities.booking_ref added');
    }
  } catch (err) {
    console.warn('[schema] bookings_facilities.booking_ref skipped:', err.message);
  }
}
