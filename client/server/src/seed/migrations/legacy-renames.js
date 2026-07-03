import { pool } from '../../config/db.js';
import { tableExists, columnExists, dropForeignKey } from '../helpers.js';

export async function runTableRenameMigration() {
  const rateRenames = [
    ['room_rates', 'rates_rooms'],
    ['meal_rates', 'rates_meals'],
    ['extra_service_rates', 'rates_extra_services'],
  ];
  for (const [oldName, newName] of rateRenames) {
    if (await tableExists(oldName) && !(await tableExists(newName))) {
      await pool.execute(`RENAME TABLE \`${oldName}\` TO \`${newName}\``);
      console.log(`[schema] Renamed ${oldName} → ${newName}`);
    }
  }

  if (await tableExists('bookings') && !(await tableExists('bookings_rooms'))) {
    try { await pool.execute('DROP TRIGGER IF EXISTS trg_booking_status_change'); } catch { /* */ }
    await pool.execute('RENAME TABLE `bookings` TO `bookings_rooms`');
    console.log('[schema] Renamed bookings → bookings_rooms');
  }

  const bookingRenames = [
    ['booking_meals', 'bookings_meals'],
    ['booking_fees', 'bookings_extra_fees'],
    ['facility_bookings', 'bookings_facilities'],
  ];
  for (const [oldName, newName] of bookingRenames) {
    if (await tableExists(oldName) && !(await tableExists(newName))) {
      await pool.execute(`RENAME TABLE \`${oldName}\` TO \`${newName}\``);
      console.log(`[schema] Renamed ${oldName} → ${newName}`);
    }
  }

  if (await tableExists('bookings_meals') && await columnExists('bookings_meals', 'booking_id')) {
    await dropForeignKey('bookings_meals', 'fk_meal_booking');
    await pool.execute('ALTER TABLE bookings_meals CHANGE booking_id bookings_room_id INT NOT NULL');
    await pool.execute(
      `ALTER TABLE bookings_meals
       ADD CONSTRAINT fk_bookings_meals_room
       FOREIGN KEY (bookings_room_id) REFERENCES bookings_rooms(id) ON DELETE CASCADE`
    );
  }

  if (await tableExists('bookings_extra_services') && await columnExists('bookings_extra_services', 'fee_name')) {
    await pool.execute(
      'ALTER TABLE bookings_extra_services CHANGE fee_name service_name VARCHAR(100) NOT NULL'
    );
  }

  if (await tableExists('bookings_extra_fees') && !(await tableExists('bookings_extra_services'))) {
    await pool.execute('RENAME TABLE `bookings_extra_fees` TO `bookings_extra_services`');
    if (await columnExists('bookings_extra_services', 'fee_name')) {
      await pool.execute(
        'ALTER TABLE bookings_extra_services CHANGE fee_name service_name VARCHAR(100) NOT NULL'
      );
    }
    console.log('[schema] Renamed bookings_extra_fees → bookings_extra_services');
  }

  const extraFeesTable = (await tableExists('bookings_extra_services'))
    ? 'bookings_extra_services'
    : (await tableExists('bookings_extra_fees') ? 'bookings_extra_fees' : null);

  if (extraFeesTable && await columnExists(extraFeesTable, 'booking_id')) {
    await dropForeignKey(extraFeesTable, 'fk_fee_booking');
    await dropForeignKey(extraFeesTable, 'fk_bookings_extra_fees_room');
    await pool.execute(`ALTER TABLE \`${extraFeesTable}\` CHANGE booking_id bookings_room_id INT NOT NULL`);
    await pool.execute(
      `ALTER TABLE \`${extraFeesTable}\`
       ADD CONSTRAINT fk_bookings_extra_services_room
       FOREIGN KEY (bookings_room_id) REFERENCES bookings_rooms(id) ON DELETE CASCADE`
    );
  }

  if (await tableExists('payments') && await columnExists('payments', 'booking_id')) {
    await dropForeignKey('payments', 'fk_payment_booking');
    await pool.execute('ALTER TABLE payments CHANGE booking_id bookings_room_id INT NOT NULL');
    await pool.execute(
      `ALTER TABLE payments
       ADD CONSTRAINT fk_payments_bookings_room
       FOREIGN KEY (bookings_room_id) REFERENCES bookings_rooms(id)
       ON DELETE RESTRICT ON UPDATE CASCADE`
    );
  }

  if (await tableExists('bookings_rooms')) {
    try { await pool.execute('DROP TRIGGER IF EXISTS trg_booking_status_change'); } catch { /* */ }
    try { await pool.execute('DROP TRIGGER IF EXISTS trg_bookings_rooms_status_change'); } catch { /* */ }
    try {
      await pool.execute(`
        CREATE TRIGGER trg_bookings_rooms_status_change
        AFTER UPDATE ON bookings_rooms
        FOR EACH ROW
        BEGIN
          IF NEW.status = 'Approved' AND OLD.status != 'Approved' THEN
            UPDATE rooms SET status = 'Occupied', occupancy = NEW.guest_count WHERE id = NEW.room_id;
          END IF;
          IF NEW.status IN ('Rejected', 'Cancelled') AND OLD.status = 'Approved' THEN
            UPDATE rooms SET status = 'Available', occupancy = 0 WHERE id = NEW.room_id;
          END IF;
        END
      `);
    } catch {
      /* trigger may already exist */
    }
  }

  const legacyDrops = [
    ['bookings', 'bookings_rooms'],
    ['booking_meals', 'bookings_meals'],
    ['booking_fees', 'bookings_extra_fees'],
    ['facility_bookings', 'bookings_facilities'],
    ['room_rates', 'rates_rooms'],
    ['meal_rates', 'rates_meals'],
    ['extra_service_rates', 'rates_extra_services'],
  ];
  for (const [oldName, newName] of legacyDrops) {
    if (await tableExists(oldName) && await tableExists(newName)) {
      try {
        await pool.execute(`DROP TABLE \`${oldName}\``);
        console.log(`[schema] Dropped legacy table ${oldName}`);
      } catch {
        /* may still be referenced */
      }
    }
  }
}
