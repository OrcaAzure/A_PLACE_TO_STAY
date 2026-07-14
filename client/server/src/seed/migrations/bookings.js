import { pool } from '../../config/db.js';
import { tableExists, columnExists } from '../helpers.js';

/** Early meal_allergen_notes on lodging bookings. */
export async function runBookingsMealAllergenNotes() {
  await pool.execute(
    `ALTER TABLE bookings_rooms
     ADD COLUMN meal_allergen_notes TEXT DEFAULT NULL AFTER contact_phone`
  );
}

/** Create bookings_facilities (must run before legacy renames). */
export async function runBookingsFacilitiesCreate() {
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS bookings_facilities (
       id           INT AUTO_INCREMENT PRIMARY KEY,
       user_id      INT NOT NULL,
       facility_id  INT NOT NULL,
       event_date   DATE NOT NULL,
       start_time   TIME NOT NULL,
       end_time     TIME NOT NULL,
       guest_count  INT NOT NULL DEFAULT 1,
       season       ENUM('Regular', 'Peak', 'N/A') NOT NULL DEFAULT 'Regular',
       total_amount DECIMAL(10,2) DEFAULT NULL,
       status       ENUM('Pending', 'Approved', 'Rejected', 'Cancelled') NOT NULL DEFAULT 'Pending',
       notes        TEXT DEFAULT NULL,
       created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       CONSTRAINT fk_fbooking_user
         FOREIGN KEY (user_id) REFERENCES users(id)
         ON DELETE RESTRICT ON UPDATE CASCADE,
       CONSTRAINT fk_fbooking_facility
         FOREIGN KEY (facility_id) REFERENCES facilities(id)
         ON DELETE RESTRICT ON UPDATE CASCADE,
       CONSTRAINT chk_fb_times  CHECK (end_time > start_time),
       CONSTRAINT chk_fb_guests CHECK (guest_count >= 1),
       CONSTRAINT chk_fb_total  CHECK (total_amount IS NULL OR total_amount > 0)
     )`
  );
}

/** Widen bookings_rooms.occupancy_item to VARCHAR. */
export async function runBookingsOccupancyItemVarchar() {
  if (!(await tableExists('bookings_rooms'))) return;
  await pool.execute(
    `ALTER TABLE bookings_rooms MODIFY occupancy_item VARCHAR(120) NOT NULL DEFAULT 'Single/Double Occupancy'`
  );
}

/** Add pricing_category to lodging bookings and reservation groups. */
export async function runBookingsPricingCategory() {
  if (await tableExists('bookings_rooms') && !(await columnExists('bookings_rooms', 'pricing_category'))) {
    await pool.execute(
      `ALTER TABLE bookings_rooms ADD COLUMN pricing_category VARCHAR(80) NOT NULL DEFAULT 'Guest' AFTER meal_allergen_notes`
    );
    console.log('[schema] Added bookings_rooms.pricing_category');
  }
  if (await tableExists('reservation_groups') && !(await columnExists('reservation_groups', 'pricing_category'))) {
    await pool.execute(
      `ALTER TABLE reservation_groups ADD COLUMN pricing_category VARCHAR(80) NOT NULL DEFAULT 'Guest' AFTER notes`
    );
    console.log('[schema] Added reservation_groups.pricing_category');
  }
}

/** Venue booking contact phone. */
export async function runBookingsFacilitiesContactPhone() {
  if (!(await tableExists('bookings_facilities'))) return;
  if (await columnExists('bookings_facilities', 'contact_phone')) return;

  await pool.execute(
    `ALTER TABLE bookings_facilities
     ADD COLUMN contact_phone VARCHAR(30) DEFAULT NULL AFTER notes`
  );
  console.log('[schema] Added bookings_facilities.contact_phone');
}
