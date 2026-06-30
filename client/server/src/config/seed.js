import bcrypt from 'bcryptjs';
import { pool } from './db.js';
import { FISCAL_YEAR_DEFAULTS } from '../utils/constants.js';
import { isProduction } from './env.js';
import { NON_VENUE_CATEGORIES } from '../constants/ancillary.js';
import { deriveFacilityCatalogFields } from '../services/facilityCatalog.service.js';
import { ensureInvoiceForBooking, ensureInvoiceForFacilityBooking } from '../services/payment.service.js';

const SEED_USERS = [
  { full_name: 'System Administrator', email: 'admin@aptspace.com',          role: 'Super Admin',   status: 'Active' },
  { full_name: 'Admin User',           email: 'admin2@aptspace.com',         role: 'Admin',         status: 'Active' },
  { full_name: 'Maria Santos',         email: 'maria.santos@apts.edu.ph',    role: 'Faculty',       status: 'Active' },
  { full_name: 'James Reyes',          email: 'james.reyes@apts.edu.ph',     role: 'Faculty',       status: 'Active' },
  { full_name: 'Ruth Villanueva',      email: 'ruth.villanueva@apts.edu.ph', role: 'Staff',         status: 'Active' },
  { full_name: 'Paul Mendoza',         email: 'paul.mendoza@apts.edu.ph',    role: 'Missionary',       status: 'Active' },
  { full_name: 'Grace Tan',            email: 'grace.tan@apts.edu.ph',       role: 'Staff', status: 'Active' },
  { full_name: 'David Cho',            email: 'david.cho@apts.edu.ph',       role: 'GMC',              status: 'Active' },
  { full_name: 'Rev. Samuel Park',     email: 'samuel.park@gracechurch.org', role: 'External Guest',   status: 'Active' },
  { full_name: 'Manila Bible Church',  email: 'mbc.retreat@example.org',   role: 'External Guest',   status: 'Inactive' },
  { full_name: 'Pacific Outreach Group', email: 'outreach@example.org',    role: 'External Guest',   status: 'Active' },
];

const DEMO_BOOKINGS = [
  { email: 'maria.santos@apts.edu.ph',    building: 'Global Missions Center', room: '201', check_in: '2026-07-01', check_out: '2026-07-05', guests: 2, season: 'Regular', item: 'Single/Double Occupancy', total: 10000, status: 'Approved', notes: 'Conference attendance' },
  { email: 'james.reyes@apts.edu.ph',     building: 'Global Missions Center', room: '205', check_in: '2026-07-10', check_out: '2026-07-12', guests: 1, season: 'Regular', item: 'Single/Double Occupancy', total: 4500,  status: 'Pending',  notes: 'Short study visit' },
  { email: 'ruth.villanueva@apts.edu.ph', building: 'Global Missions Center', room: '304', check_in: '2026-06-20', check_out: '2026-06-25', guests: 3, season: 'Regular', item: 'Daily Maximum',           total: 15250, status: 'Approved', notes: 'Staff retreat' },
  { email: 'paul.mendoza@apts.edu.ph',    building: 'Global Missions Center', room: '202', check_in: '2026-08-01', check_out: '2026-08-07', guests: 2, season: 'Regular', item: 'Single/Double Occupancy', total: 15000, status: 'Pending',  notes: 'Mission partner visit' },
  { email: 'maria.santos@apts.edu.ph',    building: 'Global Missions Center', room: '401', check_in: '2026-07-15', check_out: '2026-07-20', guests: 4, season: 'Regular', item: 'Daily Maximum',           total: 22750, status: 'Rejected', notes: 'Family retreat — rejected due to room conflict' },
  { email: 'james.reyes@apts.edu.ph',     building: 'Global Missions Center', room: '203', check_in: '2026-09-05', check_out: '2026-09-10', guests: 1, season: 'Regular', item: 'Single/Double Occupancy', total: 11250, status: 'Approved', notes: 'Academic conference' },
  { email: 'paul.mendoza@apts.edu.ph',    building: 'Global Missions Center', room: 'A-501', check_in: '2026-10-01', check_out: '2026-10-03', guests: 6, season: 'Regular', item: 'Daily Maximum',           total: 8700,  status: 'Pending',  notes: 'Mission team accommodation' },
  { email: 'ruth.villanueva@apts.edu.ph', building: 'Global Missions Center', room: '306', check_in: '2026-07-22', check_out: '2026-07-24', guests: 2, season: 'Regular', item: 'Single/Double Occupancy', total: 5000,  status: 'Cancelled', notes: 'Cancelled — travel plans changed' },
];

const ROOM_STATUS_UPDATES = [
  { building: 'Global Missions Center', room: '201', status: 'Occupied',    occupancy: 2 },
  { building: 'Global Missions Center', room: '304', status: 'Occupied',    occupancy: 3 },
  { building: 'Global Missions Center', room: '203', status: 'Occupied',    occupancy: 1 },
  { building: 'Global Missions Center', room: '202', status: 'Occupied',    occupancy: 2 },
  { building: 'Global Missions Center', room: '302', status: 'Occupied',    occupancy: 4 },
  { building: 'Global Missions Center', room: '205', status: 'Occupied',    occupancy: 1 },
  { building: 'Global Missions Center', room: '303', status: 'Maintenance', occupancy: 0 },
  { building: 'Global Missions Center', room: '307', status: 'Maintenance', occupancy: 0 },
  { building: 'Global Missions Center', room: '410', status: 'Maintenance', occupancy: 0 },
];

async function getUserId(email) {
  const [rows] = await pool.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
  return rows[0]?.id || null;
}

async function getRoomId(building, roomNumber) {
  const [rows] = await pool.execute(
    `SELECT r.id FROM rooms r
     JOIN buildings b ON b.id = r.building_id
     WHERE b.name = ? AND r.room_number = ? LIMIT 1`,
    [building, roomNumber]
  );
  return rows[0]?.id || null;
}

async function tableExists(name) {
  const [rows] = await pool.execute(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
    [name]
  );
  return rows.length > 0;
}

async function columnExists(table, column) {
  const [rows] = await pool.execute(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
}

async function dropForeignKey(table, constraint) {
  try {
    await pool.execute(`ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${constraint}\``);
  } catch {
    /* constraint may not exist */
  }
}

async function runTableRenameMigration() {
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

const GMC_VENUE_SPACES = [
  { item: 'A-101', regular: 4500, peak: 5500, capMin: 1, capMax: 100 }, // Russ Turney Educational Center
  { item: 'A-504', regular: 3000, peak: 3500, capMin: 1, capMax: 30 },  // Classroom Multi-Purpose Room
  { item: 'A-505', regular: 3000, peak: 3500, capMin: 1, capMax: 30 },  // Classroom Multi-Purpose Room
  { item: 'A-506', regular: 2100, peak: 2500, capMin: 1, capMax: 15 },  // Conference Room
  { item: 'A-507', regular: 2100, peak: 2500, capMin: 1, capMax: 15 },  // Conference Room (was A-105)
];

const GMC_ABLOCK_LODGING_ROOMS = ['A-101', 'A-105', 'A-504', 'A-505', 'A-506'];

const GMC_LEGACY_FACILITY_ITEMS = [
  'Russ Turney Educational Center',
  'Classroom Multi-Purpose Room',
  'Conference Room',
  'Russ Turney Educational Center (A-101)',
  'Classroom Multi-Purpose Room (A-504)',
  'Classroom Multi-Purpose Room (A-505)',
  'Conference Room (A-506)',
  'Conference Room (A-507)',
];

const DELUXE_2BR_RATES = [
  ['Single/Double Occupancy', 'Regular', 3000], ['Single/Double Occupancy', 'Peak', 3275], ['Single/Double Occupancy', 'Super Peak', 3650],
  ['Daily Maximum', 'Regular', 3750], ['Daily Maximum', 'Peak', 4150], ['Daily Maximum', 'Super Peak', 4500],
  ['Extra Bed or Extra Person', 'Regular', 450], ['Extra Bed or Extra Person', 'Peak', 500], ['Extra Bed or Extra Person', 'Super Peak', 550],
];

const DELUXE_3BR_RATES = [
  ['Single/Double Occupancy', 'Regular', 3600], ['Single/Double Occupancy', 'Peak', 3650], ['Single/Double Occupancy', 'Super Peak', 4450],
  ['Daily Maximum', 'Regular', 4350], ['Daily Maximum', 'Peak', 4750], ['Daily Maximum', 'Super Peak', 5200],
  ['Extra Bed or Extra Person', 'Regular', 450], ['Extra Bed or Extra Person', 'Peak', 500], ['Extra Bed or Extra Person', 'Super Peak', 550],
];

const DELUXE_3BR_ROOMS = ['201', '304'];
const DELUXE_2BR_ROOMS = ['A-501', '301', '401', '402', '403'];

async function upsertDeluxeRoomRates() {
  for (const [item, season, rate] of DELUXE_2BR_RATES) {
    await pool.execute(
      `INSERT INTO rates_rooms (room_type, item, season, rate)
       VALUES ('Deluxe 2 BR', ?, ?, ?)
       ON DUPLICATE KEY UPDATE rate = VALUES(rate)`,
      [item, season, rate]
    );
  }
  for (const [item, season, rate] of DELUXE_3BR_RATES) {
    await pool.execute(
      `INSERT INTO rates_rooms (room_type, item, season, rate)
       VALUES ('Deluxe 3 BR', ?, ?, ?)
       ON DUPLICATE KEY UPDATE rate = VALUES(rate)`,
      [item, season, rate]
    );
  }
}

async function runDeluxeRoomTypeMigration() {
  try {
    await pool.execute(
      `ALTER TABLE rooms ADD COLUMN bedroom_count TINYINT DEFAULT NULL AFTER room_type`
    );
  } catch {
    /* legacy column may already exist */
  }
  try {
    await pool.execute(
      `ALTER TABLE rooms ADD COLUMN bed_count TINYINT DEFAULT NULL AFTER room_type`
    );
  } catch {
    /* column may already exist */
  }
  try {
    await pool.execute(
      `UPDATE rooms SET bed_count = bedroom_count WHERE bed_count IS NULL AND bedroom_count IS NOT NULL`
    );
  } catch {
    /* bedroom_count may not exist */
  }
  try {
    await pool.execute(`ALTER TABLE rooms DROP COLUMN bedroom_count`);
  } catch {
    /* already dropped or never existed */
  }

  const expandedRoomEnum = `ENUM(
    'Dorm',
    'Standard Guest Room',
    'Superior Guest Room',
    'Standard Apartment',
    'Deluxe Apartment',
    'Deluxe 2 BR',
    'Deluxe 3 BR',
    'Uncategorized'
  )`;
  const finalRoomEnum = `ENUM(
    'Dorm',
    'Superior Guest Room',
    'Standard Apartment',
    'Deluxe Apartment'
  )`;
  const expandedRateEnum = `ENUM(
    'Dorm',
    'Standard Guest Room',
    'Superior Guest Room',
    'Standard Apartment',
    'Deluxe Apartment',
    'Deluxe 2 BR',
    'Deluxe 3 BR',
    'Uncategorized'
  )`;
  const finalRateEnum = `ENUM(
    'Dorm',
    'Superior Guest Room',
    'Standard Apartment',
    'Deluxe 2 BR',
    'Deluxe 3 BR'
  )`;

  try {
    await pool.execute(`ALTER TABLE rooms MODIFY room_type ${expandedRoomEnum} NOT NULL`);
    await pool.execute(`ALTER TABLE rates_rooms MODIFY room_type ${expandedRateEnum} NOT NULL`);
  } catch (err) {
    console.warn('[schema] lodging enum expand skipped:', err.message);
  }

  await pool.execute(
    `UPDATE rooms SET room_type = 'Superior Guest Room' WHERE room_type = 'Standard Guest Room'`
  );
  await pool.execute(
    `UPDATE rates_rooms SET room_type = 'Superior Guest Room' WHERE room_type = 'Standard Guest Room'`
  );

  const [[gmc]] = await pool.execute(
    `SELECT id FROM buildings WHERE name = 'Global Missions Center' LIMIT 1`
  );
  if (gmc?.id) {
    const threeBr = DELUXE_3BR_ROOMS.map(() => '?').join(', ');
    await pool.execute(
      `UPDATE rooms SET room_type = 'Deluxe Apartment', bed_count = 3, capacity_min = 1, capacity_max = 6
       WHERE building_id = ? AND room_number IN (${threeBr})`,
      [gmc.id, ...DELUXE_3BR_ROOMS]
    );

    const twoBr = DELUXE_2BR_ROOMS.map(() => '?').join(', ');
    await pool.execute(
      `UPDATE rooms SET room_type = 'Deluxe Apartment', bed_count = 2, capacity_min = 1, capacity_max = 4
       WHERE building_id = ? AND room_number IN (${twoBr})`,
      [gmc.id, ...DELUXE_2BR_ROOMS]
    );

    await pool.execute(
      `UPDATE rooms SET room_type = 'Deluxe Apartment', bed_count = 2, capacity_max = 4
       WHERE room_type IN ('Deluxe 2 BR', 'Deluxe 3 BR', 'Deluxe Apartment') AND bed_count IS NULL`
    );
  }

  await pool.execute(`DELETE FROM rates_rooms WHERE room_type IN ('Deluxe Apartment', 'Uncategorized')`);
  await upsertDeluxeRoomRates();

  try {
    await pool.execute(`ALTER TABLE rooms MODIFY room_type ${finalRoomEnum} NOT NULL`);
    await pool.execute(`ALTER TABLE rates_rooms MODIFY room_type ${finalRateEnum} NOT NULL`);
  } catch (err) {
    console.warn('[schema] lodging enum finalize skipped:', err.message);
  }

  console.log('[schema] Superior Guest Room + Deluxe Apartment catalog updated (FY26 sheet)');
}

async function runSeasonSettingsMigration() {
  await pool.execute(
    `INSERT INTO system_settings (setting_key, setting_value)
     VALUES ('active_lodging_season', 'Regular')
     ON DUPLICATE KEY UPDATE setting_key = setting_key`
  );

  const defaultPeriods = JSON.stringify([
    { season: 'Regular', start_month: 7, start_day: 1, end_month: 3, end_day: 31 },
    { season: 'Peak', start_month: 4, start_day: 1, end_month: 5, end_day: 31 },
    { season: 'Super Peak', start_month: 6, start_day: 1, end_month: 6, end_day: 30 },
  ]);
  await pool.execute(
    `INSERT INTO system_settings (setting_key, setting_value)
     VALUES ('lodging_season_periods', ?)
     ON DUPLICATE KEY UPDATE setting_key = setting_key`,
    [defaultPeriods]
  );

  try {
    await pool.execute('DROP TABLE IF EXISTS season_definitions');
    console.log('[schema] season_definitions removed — season periods are in system_settings');
  } catch (err) {
    console.warn('[schema] season_definitions drop skipped:', err.message);
  }
}

async function findOrCreateFacility(fields, capacityMin, capacityMax) {
  const group = fields.facility_group || fields.venue_group;
  if (fields.room_code) {
    await pool.execute(
      `INSERT INTO facilities (name, room_code, description, package_name, facility_group, capacity_min, capacity_max)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         description = COALESCE(VALUES(description), description),
         package_name = VALUES(package_name),
         facility_group = VALUES(facility_group),
         capacity_min = COALESCE(VALUES(capacity_min), capacity_min),
         capacity_max = COALESCE(VALUES(capacity_max), capacity_max)`,
      [fields.name, fields.room_code, fields.description, fields.package_name, group, capacityMin, capacityMax]
    );
    const [rows] = await pool.execute(
      'SELECT id FROM facilities WHERE room_code = ? LIMIT 1',
      [fields.room_code]
    );
    return rows[0].id;
  }

  const [existing] = await pool.execute(
    `SELECT id FROM facilities
     WHERE room_code IS NULL AND name = ? AND COALESCE(package_name, '') = COALESCE(?, '')
     LIMIT 1`,
    [fields.name, fields.package_name]
  );
  if (existing.length) {
    await pool.execute(
      `UPDATE facilities
       SET description = COALESCE(?, description),
           facility_group = COALESCE(?, facility_group),
           capacity_min = COALESCE(?, capacity_min),
           capacity_max = COALESCE(?, capacity_max)
       WHERE id = ?`,
      [fields.description, group, capacityMin, capacityMax, existing[0].id]
    );
    return existing[0].id;
  }

  const [result] = await pool.execute(
    `INSERT INTO facilities (name, room_code, description, package_name, facility_group, capacity_min, capacity_max)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [fields.name, fields.room_code, fields.description, fields.package_name, group, capacityMin, capacityMax]
  );
  return result.insertId;
}

async function upsertGmcFacilities() {
  for (const space of GMC_VENUE_SPACES) {
    const fields = deriveFacilityCatalogFields('GMC', space.item);
    const facilityId = await findOrCreateFacility(fields, space.capMin, space.capMax);

    for (const [season, rate] of [['Regular', space.regular], ['Peak', space.peak]]) {
      await pool.execute(
        `INSERT INTO rates_facilities (facility_id, season, rate)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE rate = VALUES(rate)`,
        [facilityId, season, rate]
      );
    }
  }
}

async function migrateAirconToExtraServices() {
  if (await columnExists('facilities', 'season')) {
    const [airconRows] = await pool.execute(
      `SELECT rate FROM facilities WHERE category = 'GMC Chapel' AND item = 'Aircon' LIMIT 1`
    );
    if (airconRows.length) {
      await pool.execute(
        `INSERT INTO rates_extra_services (category, item, rate)
         VALUES ('GMC Chapel', 'Aircon', ?)
         ON DUPLICATE KEY UPDATE rate = VALUES(rate)`,
        [airconRows[0].rate]
      );
    }
    await pool.execute(`DELETE FROM facilities WHERE category = 'GMC Chapel' AND item = 'Aircon'`);
  }

  await pool.execute(
    `INSERT INTO rates_extra_services (category, item, rate)
     VALUES ('GMC Chapel', 'Aircon', 275.00)
     ON DUPLICATE KEY UPDATE rate = VALUES(rate)`
  );
  await pool.execute(
    `DELETE FROM facilities WHERE facility_group = 'GMC Chapel' AND package_name = 'Aircon'`
  );
}

async function ensureRatesFacilitiesTable() {
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS rates_facilities (
       id          INT AUTO_INCREMENT PRIMARY KEY,
       facility_id INT NOT NULL,
       season      ENUM('Regular', 'Peak', 'N/A') NOT NULL DEFAULT 'Regular',
       rate        DECIMAL(10,2) NOT NULL,
       UNIQUE KEY uq_facility_rate (facility_id, season),
       CONSTRAINT chk_facility_rate CHECK (rate > 0),
       CONSTRAINT fk_rates_facility
         FOREIGN KEY (facility_id) REFERENCES facilities(id)
         ON DELETE CASCADE ON UPDATE CASCADE,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
     )`
  );
}

async function runFacilitiesCatalogMigration() {
  if (!(await tableExists('facilities'))) return;

  await migrateAirconToExtraServices();

  if (!(await columnExists('facilities', 'season'))) {
    await ensureRatesFacilitiesTable();
    if (await tableExists('event_venues')) {
      try { await pool.execute('DROP TABLE event_venues'); } catch { /* */ }
    }
    console.log('[schema] facilities catalog already in place');
    return;
  }

  await dropForeignKey('bookings_facilities', 'fk_fbooking_facility');
  await dropForeignKey('facilities', 'fk_facilities_event_venue');
  await dropForeignKey('facilities', 'fk_facility_event_venue');

  if (await tableExists('event_venues')) {
    await pool.execute(
      `UPDATE bookings_facilities bf
       JOIN facilities r ON r.id = bf.facility_id
       SET bf.facility_id = COALESCE(r.event_venue_id, r.id)
       WHERE r.event_venue_id IS NOT NULL`
    );

    await pool.execute('RENAME TABLE `facilities` TO `_facility_rates_staging`');
    await pool.execute('RENAME TABLE `event_venues` TO `facilities`');

    if (await columnExists('facilities', 'venue_group')) {
      await pool.execute('ALTER TABLE facilities CHANGE venue_group facility_group VARCHAR(50) DEFAULT NULL');
    }

    await ensureRatesFacilitiesTable();

    await pool.execute(
      `INSERT INTO rates_facilities (facility_id, season, rate)
       SELECT event_venue_id, season, rate
       FROM _facility_rates_staging
       WHERE event_venue_id IS NOT NULL
       ON DUPLICATE KEY UPDATE rate = VALUES(rate)`
    );

    await pool.execute('DROP TABLE `_facility_rates_staging`');
  } else {
    const placeholders = NON_VENUE_CATEGORIES.map(() => '?').join(',');
    const [rateRows] = await pool.execute(
      `SELECT category, item, season, rate, MAX(capacity_min) AS cap_min, MAX(capacity_max) AS cap_max
       FROM facilities
       WHERE category NOT IN (${placeholders})
       GROUP BY category, item, season, rate, capacity_min, capacity_max`,
      NON_VENUE_CATEGORIES
    );

    await pool.execute('RENAME TABLE `facilities` TO `_facility_rates_staging`');

    await pool.execute(
      `CREATE TABLE facilities (
         id              INT AUTO_INCREMENT PRIMARY KEY,
         name            VARCHAR(150) NOT NULL,
         room_code       VARCHAR(20)  DEFAULT NULL,
         description     TEXT         DEFAULT NULL,
         package_name    VARCHAR(100) DEFAULT NULL,
         facility_group  VARCHAR(50)  DEFAULT NULL,
         capacity_min    INT          DEFAULT NULL,
         capacity_max    INT          DEFAULT NULL,
         UNIQUE KEY uq_facility_room (room_code),
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
       )`
    );

    const catalogIds = new Map();
    const [distinct] = await pool.execute(
      `SELECT category, item, MAX(capacity_min) AS cap_min, MAX(capacity_max) AS cap_max
       FROM _facility_rates_staging
       WHERE category NOT IN (${placeholders})
       GROUP BY category, item`,
      NON_VENUE_CATEGORIES
    );

    for (const row of distinct) {
      const fields = deriveFacilityCatalogFields(row.category, row.item);
      const id = await findOrCreateFacility(fields, row.cap_min, row.cap_max);
      catalogIds.set(`${row.category}\x1f${row.item}`, id);
    }

    await ensureRatesFacilitiesTable();

    for (const row of rateRows) {
      const facilityId = catalogIds.get(`${row.category}\x1f${row.item}`);
      if (!facilityId) continue;
      await pool.execute(
        `INSERT INTO rates_facilities (facility_id, season, rate)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE rate = VALUES(rate)`,
        [facilityId, row.season, row.rate]
      );
    }

    const [bookings] = await pool.execute('SELECT id, facility_id FROM bookings_facilities');
    for (const b of bookings) {
      const [old] = await pool.execute(
        'SELECT category, item, event_venue_id FROM _facility_rates_staging WHERE id = ? LIMIT 1',
        [b.facility_id]
      );
      if (!old.length) continue;
      const newId = old[0].event_venue_id || catalogIds.get(`${old[0].category}\x1f${old[0].item}`);
      if (newId) {
        await pool.execute('UPDATE bookings_facilities SET facility_id = ? WHERE id = ?', [newId, b.id]);
      }
    }

    await pool.execute('DROP TABLE `_facility_rates_staging`');
  }

  try {
    await pool.execute(
      `ALTER TABLE bookings_facilities
       ADD CONSTRAINT fk_fbooking_facility
         FOREIGN KEY (facility_id) REFERENCES facilities(id)
         ON DELETE RESTRICT ON UPDATE CASCADE`
    );
  } catch {
    /* FK may already exist */
  }

  if (await tableExists('event_venues')) {
    try { await pool.execute('DROP TABLE event_venues'); } catch { /* */ }
  }

  console.log('[schema] facilities catalog + rates_facilities migration complete');
}

async function runGmcAblockMigration() {
  const placeholders = GMC_ABLOCK_LODGING_ROOMS.map(() => '?').join(', ');

  await pool.execute(
    `DELETE p FROM payments p
     JOIN bookings_rooms br ON br.id = p.bookings_room_id
     JOIN rooms r ON r.id = br.room_id
     JOIN buildings b ON b.id = r.building_id
     WHERE b.name = 'Global Missions Center' AND r.room_number IN (${placeholders})`,
    GMC_ABLOCK_LODGING_ROOMS
  );
  await pool.execute(
    `DELETE br FROM bookings_rooms br
     JOIN rooms r ON r.id = br.room_id
     JOIN buildings b ON b.id = r.building_id
     WHERE b.name = 'Global Missions Center' AND r.room_number IN (${placeholders})`,
    GMC_ABLOCK_LODGING_ROOMS
  );
  await pool.execute(
    `DELETE r FROM rooms r
     JOIN buildings b ON b.id = r.building_id
     WHERE b.name = 'Global Missions Center' AND r.room_number IN (${placeholders})`,
    GMC_ABLOCK_LODGING_ROOMS
  );

  for (const item of GMC_LEGACY_FACILITY_ITEMS) {
    const [linked] = await pool.execute(
      `SELECT bf.id FROM bookings_facilities bf
       JOIN facilities f ON f.id = bf.facility_id
       WHERE f.room_code = ? OR f.name = ?
       LIMIT 1`,
      [item.replace(/\s*\([^)]*\)/, '').trim(), item]
    );
    if (linked.length) continue;
    if (await columnExists('facilities', 'item')) {
      await pool.execute(`DELETE FROM facilities WHERE category = 'GMC' AND item = ?`, [item]);
    }
  }

  if (!(await columnExists('facilities', 'season'))) {
    await upsertGmcFacilities();
  }
  console.log('[schema] GMC A-block spaces are venue facilities (A-501 remains lodging)');
}

export async function seedUsers() {
  const password = process.env.DEFAULT_PASSWORD || 'password';
  const hash = await bcrypt.hash(password, 10);

  for (const u of SEED_USERS) {
    const [existing] = await pool.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [u.email]);
    if (existing.length > 0) continue;

    await pool.execute(
      'INSERT INTO users (full_name, email, password, role, status) VALUES (?, ?, ?, ?, ?)',
      [u.full_name, u.email, hash, u.role, u.status]
    );
    console.log(`[seed] Created user: ${u.email} [${u.role}]`);
  }
}

export async function seedDemoData() {
  const [existing] = await pool.execute('SELECT id FROM bookings_rooms LIMIT 1');
  if (existing.length > 0) return;

  console.log('[seed] Inserting demo bookings...');

  for (const b of DEMO_BOOKINGS) {
    const userId = await getUserId(b.email);
    const roomId = await getRoomId(b.building, b.room);
    if (!userId || !roomId) continue;

    await pool.execute(
      `INSERT INTO bookings_rooms (user_id, room_id, check_in, check_out, guest_count, season, occupancy_item, total_amount, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, roomId, b.check_in, b.check_out, b.guests, b.season, b.item, b.total, b.status, b.notes]
    );
  }

  const paymentSeeds = [
    { email: 'maria.santos@apts.edu.ph',    check_in: '2026-07-01', amount: 10000, method: 'GCash',         status: 'Paid',    paid_at: '2026-07-01 10:00:00' },
    { email: 'ruth.villanueva@apts.edu.ph', check_in: '2026-06-20', amount: 15250, method: 'Bank Transfer', status: 'Paid',    paid_at: '2026-06-20 09:00:00' },
    { email: 'james.reyes@apts.edu.ph',     check_in: '2026-09-05', amount: 11250, method: 'Cash',          status: 'Paid',    paid_at: '2026-09-05 08:30:00' },
    { email: 'paul.mendoza@apts.edu.ph',    check_in: '2026-08-01', amount: 15000, method: 'GCash',         status: 'Pending', paid_at: null },
  ];

  for (const p of paymentSeeds) {
    const [bookings] = await pool.execute(
      `SELECT b.id FROM bookings_rooms b
       JOIN users u ON u.id = b.user_id
       WHERE u.email = ? AND b.check_in = ? LIMIT 1`,
      [p.email, p.check_in]
    );
    if (!bookings.length) continue;

    await pool.execute(
      'INSERT INTO payments (bookings_room_id, amount, method, status, paid_at) VALUES (?, ?, ?, ?, ?)',
      [bookings[0].id, p.amount, p.method, p.status, p.paid_at]
    );
  }

  for (const r of ROOM_STATUS_UPDATES) {
    await pool.execute(
      `UPDATE rooms SET status = ?, occupancy = ?
       WHERE room_number = ? AND building_id = (SELECT id FROM buildings WHERE name = ? LIMIT 1)`,
      [r.status, r.occupancy, r.room, r.building]
    );
  }

  console.log('[seed] Demo bookings, payments, and room statuses ready.');
}

export async function runSchemaPatches() {
  try {
    await pool.execute(
      `ALTER TABLE rooms
       MODIFY status ENUM('Available', 'Occupied', 'Dirty', 'Maintenance') NOT NULL DEFAULT 'Available'`
    );
  } catch {
    /* enum may already include Dirty */
  }

  try {
    await pool.execute(
      `CREATE TABLE IF NOT EXISTS payments (
         id         INT AUTO_INCREMENT PRIMARY KEY,
         booking_id INT NOT NULL,
         amount     DECIMAL(10,2) NOT NULL,
         method     ENUM('Cash', 'GCash', 'Bank Transfer') NOT NULL,
         status     ENUM('Pending', 'Paid', 'Failed') NOT NULL DEFAULT 'Pending',
         paid_at    TIMESTAMP NULL DEFAULT NULL,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
         CONSTRAINT fk_payment_booking
           FOREIGN KEY (booking_id) REFERENCES bookings(id)
           ON DELETE RESTRICT
           ON UPDATE CASCADE,
         CONSTRAINT chk_amount CHECK (amount > 0)
       )`
    );
  } catch {
    /* bookings table may not exist yet if schema was not imported */
  }

  try {
    await pool.execute(
      `ALTER TABLE bookings_meals
       MODIFY meal_type ENUM('Breakfast', 'Lunch', 'Dinner', 'Snack') NOT NULL`
    );
  } catch {
    try {
      await pool.execute(
        `ALTER TABLE booking_meals
         MODIFY meal_type ENUM('Breakfast', 'Lunch', 'Dinner', 'Snack') NOT NULL`
      );
    } catch {
      /* column may already include Snack */
    }
  }

  try {
    await pool.execute(
      `ALTER TABLE bookings_rooms
       ADD COLUMN meal_allergen_notes TEXT DEFAULT NULL AFTER contact_phone`
    );
  } catch {
    /* column may already exist */
  }

  try {
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
  } catch {
    /* enum may already include new values */
  }

  try {
    await pool.execute(
      `UPDATE users SET role = 'Supervisory User' WHERE role = 'GNC View Only'`
    );
  } catch {
    /* legacy role may not exist */
  }

  try {
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
  } catch {
    /* enum may already be up to date */
  }

  try {
    await pool.execute(
      `UPDATE users SET role = 'External Guest' WHERE email LIKE '%@aptspace.local'`
    );
  } catch {
    /* walk-in guests may not exist */
  }

  try {
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
  } catch (err) {
    console.warn('[schema] bookings_facilities patch skipped:', err.message);
  }

  try {
    await pool.execute(
      `CREATE TABLE IF NOT EXISTS system_settings (
         setting_key   VARCHAR(64) PRIMARY KEY,
         setting_value VARCHAR(255) NOT NULL,
         updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
       )`
    );
    for (const [key, value] of Object.entries(FISCAL_YEAR_DEFAULTS)) {
      await pool.execute(
        `INSERT INTO system_settings (setting_key, setting_value)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_key = setting_key`,
        [key, String(value)]
      );
    }
  } catch {
    /* settings table may not be available yet */
  }

  try {
    const [hourRows] = await pool.query(
      `SELECT setting_value FROM system_settings WHERE setting_key = 'guest_cancellation_cutoff_hours' LIMIT 1`
    );
    if (!hourRows.length) {
      const [dayRows] = await pool.query(
        `SELECT setting_value FROM system_settings WHERE setting_key = 'guest_cancellation_cutoff_days' LIMIT 1`
      );
      const legacyDays = dayRows.length ? Number(dayRows[0].setting_value) : 1;
      const hours = Number.isFinite(legacyDays) ? legacyDays * 24 : 24;
      await pool.execute(
        `INSERT INTO system_settings (setting_key, setting_value)
         VALUES ('guest_cancellation_cutoff_hours', ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [String(hours)]
      );
    }
  } catch {
    /* migration optional */
  }

  try {
    await pool.execute(
      `CREATE TABLE IF NOT EXISTS guest_access_requests (
         id            INT AUTO_INCREMENT PRIMARY KEY,
         full_name     VARCHAR(150) NOT NULL,
         email         VARCHAR(150) NOT NULL,
         organization  VARCHAR(150) DEFAULT NULL,
         notes         TEXT DEFAULT NULL,
         status        ENUM('Pending', 'Approved', 'Rejected') NOT NULL DEFAULT 'Pending',
         user_id       INT DEFAULT NULL,
         reviewed_by   INT DEFAULT NULL,
         review_notes  TEXT DEFAULT NULL,
         reviewed_at   TIMESTAMP NULL DEFAULT NULL,
         created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
         CONSTRAINT fk_guest_request_user
           FOREIGN KEY (user_id) REFERENCES users(id)
           ON DELETE SET NULL ON UPDATE CASCADE,
         CONSTRAINT fk_guest_request_reviewer
           FOREIGN KEY (reviewed_by) REFERENCES users(id)
           ON DELETE SET NULL ON UPDATE CASCADE
       )`
    );
  } catch (err) {
    console.warn('[schema] guest_access_requests patch skipped:', err.message);
  }

  try {
    await pool.execute(
      `CREATE TABLE IF NOT EXISTS audit_logs (
         id            INT AUTO_INCREMENT PRIMARY KEY,
         actor_user_id INT DEFAULT NULL,
         action        VARCHAR(64) NOT NULL,
         entity_type   VARCHAR(32) NOT NULL,
         entity_id     INT DEFAULT NULL,
         details       JSON DEFAULT NULL,
         created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         CONSTRAINT fk_audit_actor
           FOREIGN KEY (actor_user_id) REFERENCES users(id)
           ON DELETE SET NULL ON UPDATE CASCADE,
         INDEX idx_audit_action (action),
         INDEX idx_audit_created (created_at)
       )`
    );
  } catch (err) {
    console.warn('[schema] audit_logs patch skipped:', err.message);
  }

  try {
    await pool.execute(
      `UPDATE buildings
       SET name = 'Global Missions Center',
           description = 'Main Global Missions Center building'
       WHERE name = 'PCALM'`
    );
    await pool.execute(
      `DELETE p FROM payments p
       JOIN bookings_rooms bk ON bk.id = p.bookings_room_id
       JOIN rooms r ON r.id = bk.room_id
       JOIN buildings b ON b.id = r.building_id
       WHERE b.name IN ('Thesda', 'Sampaguita', 'Peranza', 'House')`
    );
    await pool.execute(
      `DELETE bk FROM bookings_rooms bk
       JOIN rooms r ON r.id = bk.room_id
       JOIN buildings b ON b.id = r.building_id
       WHERE b.name IN ('Thesda', 'Sampaguita', 'Peranza', 'House')`
    );
    await pool.execute(
      `DELETE r FROM rooms r
       JOIN buildings b ON b.id = r.building_id
       WHERE b.name IN ('Thesda', 'Sampaguita', 'Peranza', 'House')`
    );
    await pool.execute(
      `DELETE FROM buildings WHERE name IN ('Thesda', 'Sampaguita', 'Peranza', 'House')`
    );
  } catch (err) {
    console.warn('[schema] building rename/removal patch skipped:', err.message);
  }

  try {
    await pool.execute(
      `CREATE TABLE IF NOT EXISTS rates_meals (
         id         INT AUTO_INCREMENT PRIMARY KEY,
         meal_type  ENUM('Breakfast', 'Lunch', 'Dinner', 'Snack') NOT NULL,
         rate       DECIMAL(10,2) NOT NULL,
         UNIQUE KEY uq_meal_type (meal_type),
         CONSTRAINT chk_meal_rate CHECK (rate > 0),
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
       )`
    );
    await pool.execute(
      `CREATE TABLE IF NOT EXISTS rates_extra_services (
         id       INT AUTO_INCREMENT PRIMARY KEY,
         category VARCHAR(50)  NOT NULL,
         item     VARCHAR(100) NOT NULL,
         rate     DECIMAL(10,2) NOT NULL,
         UNIQUE KEY uq_extra_service (category, item),
         CONSTRAINT chk_extra_service_rate CHECK (rate > 0),
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
       )`
    );

    if (await columnExists('facilities', 'season')) {
      await pool.execute(
        `INSERT INTO rates_meals (meal_type, rate)
         SELECT item, rate FROM facilities
         WHERE category = 'Food Service' AND season = 'N/A'
         ON DUPLICATE KEY UPDATE rate = VALUES(rate)`
      );

      await pool.execute(
        `INSERT INTO rates_extra_services (category, item, rate)
         SELECT category, item, rate FROM facilities
         WHERE category IN ('Laundry', 'Laundry-Iron', 'Corkage Fee', 'Maid Service', 'Accommodation Extras')
         ON DUPLICATE KEY UPDATE rate = VALUES(rate)`
      );

      await pool.execute(
        `DELETE FROM facilities
         WHERE category IN (
           'Food Service', 'Laundry', 'Laundry-Iron',
           'Corkage Fee', 'Maid Service', 'Accommodation Extras'
         )`
      );
    }
  } catch (err) {
    console.warn('[schema] ancillary rates migration skipped:', err.message);
  }

  try {
    await runTableRenameMigration();
  } catch (err) {
    console.warn('[schema] table rename migration skipped:', err.message);
  }

  try {
    await runGmcAblockMigration();
  } catch (err) {
    console.warn('[schema] GMC A-block migration skipped:', err.message);
  }

  try {
    await runFacilitiesCatalogMigration();
  } catch (err) {
    console.warn('[schema] facilities catalog migration skipped:', err.message);
  }

  try {
    await runDeluxeRoomTypeMigration();
  } catch (err) {
    console.warn('[schema] deluxe room type migration skipped:', err.message);
  }

  try {
    await runSeasonSettingsMigration();
  } catch (err) {
    console.warn('[schema] season settings migration skipped:', err.message);
  }

  try {
    await pool.execute(
    );
  } catch {
    /* facilities table may not exist yet */
  }

  try {
    await pool.execute(`DELETE FROM rates_rooms WHERE room_type = 'Uncategorized'`);
    const lodgingEnum = `ENUM(
      'Dorm',
      'Superior Guest Room',
      'Standard Apartment',
      'Deluxe Apartment'
    )`;
    const rateEnum = `ENUM(
      'Dorm',
      'Superior Guest Room',
      'Standard Apartment',
      'Deluxe 2 BR',
      'Deluxe 3 BR'
    )`;
    await pool.execute(`ALTER TABLE rooms MODIFY room_type ${lodgingEnum} NOT NULL`);
    await pool.execute(`ALTER TABLE rates_rooms MODIFY room_type ${rateEnum} NOT NULL`);
  } catch (err) {
    console.warn('[schema] remove Uncategorized room type skipped:', err.message);
  }

  if (await tableExists('payments')) {
    if (!(await columnExists('payments', 'subtotal'))) {
      try {
        await pool.execute('ALTER TABLE payments ADD COLUMN subtotal DECIMAL(10,2) NULL AFTER bookings_room_id');
        await pool.execute('UPDATE payments SET subtotal = amount WHERE subtotal IS NULL');
      } catch (err) {
        console.warn('[schema] payments.subtotal skipped:', err.message);
      }
    }
    if (!(await columnExists('payments', 'discount_amount'))) {
      try {
        await pool.execute('ALTER TABLE payments ADD COLUMN discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER subtotal');
      } catch (err) {
        console.warn('[schema] payments.discount_amount skipped:', err.message);
      }
    }
    if (!(await columnExists('payments', 'discount_note'))) {
      try {
        await pool.execute('ALTER TABLE payments ADD COLUMN discount_note VARCHAR(255) NULL AFTER discount_amount');
      } catch (err) {
        console.warn('[schema] payments.discount_note skipped:', err.message);
      }
    }
    if (!(await columnExists('payments', 'invoice_sent_at'))) {
      try {
        await pool.execute('ALTER TABLE payments ADD COLUMN invoice_sent_at TIMESTAMP NULL DEFAULT NULL AFTER paid_at');
      } catch (err) {
        console.warn('[schema] payments.invoice_sent_at skipped:', err.message);
      }
    }
    try {
      await pool.execute(
        `ALTER TABLE payments MODIFY method ENUM('Cash', 'GCash', 'Bank Transfer') NULL DEFAULT NULL`
      );
    } catch {
      /* method may already be nullable */
    }

    try {
      const [missing] = await pool.execute(
        `SELECT b.id FROM bookings_rooms b
         LEFT JOIN payments p ON p.bookings_room_id = b.id
         WHERE b.status = 'Approved' AND b.total_amount > 0 AND p.id IS NULL`
      );
      for (const row of missing) {
        await ensureInvoiceForBooking(row.id);
      }
    } catch (err) {
      console.warn('[schema] invoice backfill skipped:', err.message);
    }

    if (!(await columnExists('payments', 'bookings_facility_id'))) {
      try {
        await pool.execute('ALTER TABLE payments MODIFY bookings_room_id INT NULL');
        await pool.execute(
          'ALTER TABLE payments ADD COLUMN bookings_facility_id INT NULL AFTER bookings_room_id'
        );
        await pool.execute(
          `ALTER TABLE payments
           ADD CONSTRAINT fk_payments_bookings_facility
           FOREIGN KEY (bookings_facility_id) REFERENCES bookings_facilities(id)
           ON DELETE RESTRICT ON UPDATE CASCADE`
        );
      } catch (err) {
        console.warn('[schema] payments.bookings_facility_id skipped:', err.message);
      }
    }

    try {
      const [missingVenue] = await pool.execute(
        `SELECT fb.id FROM bookings_facilities fb
         LEFT JOIN payments p ON p.bookings_facility_id = fb.id
         WHERE fb.status = 'Approved' AND fb.total_amount > 0 AND p.id IS NULL`
      );
      for (const row of missingVenue) {
        await ensureInvoiceForFacilityBooking(row.id);
      }
    } catch (err) {
      console.warn('[schema] venue invoice backfill skipped:', err.message);
    }
  }
}

export async function seedGuestStayExamples() {
  const samuelId = await getUserId('samuel.park@gracechurch.org');
  const mbcId = await getUserId('mbc.retreat@example.org');
  const roomId = await getRoomId('Global Missions Center', '301');
  if (!roomId) return;

  const today = new Date();
  const iso = (offset) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  };

  if (samuelId) {
    const [exists] = await pool.execute('SELECT id FROM bookings_rooms WHERE user_id = ? LIMIT 1', [samuelId]);
    if (!exists.length) {
      await pool.execute(
        `INSERT INTO bookings_rooms (user_id, room_id, check_in, check_out, guest_count, season, occupancy_item, total_amount, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [samuelId, roomId, iso(-2), iso(4), 2, 'Regular', 'Single/Double Occupancy', 8500, 'Approved', 'External guest — ministry retreat']
      );
      console.log('[seed] Demo in-stay booking for external guest');
    }
  }

  if (mbcId) {
    const [exists] = await pool.execute('SELECT id FROM bookings_rooms WHERE user_id = ? LIMIT 1', [mbcId]);
    if (!exists.length) {
      await pool.execute(
        `INSERT INTO bookings_rooms (user_id, room_id, check_in, check_out, guest_count, season, occupancy_item, total_amount, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [mbcId, roomId, iso(-20), iso(-14), 8, 'Regular', 'Daily Maximum', 42000, 'Approved', 'Past group retreat — access review']
      );
      console.log('[seed] Demo ended-stay booking for external guest');
    }
  }

  const outreachId = await getUserId('outreach@example.org');
  if (outreachId) {
    const [exists] = await pool.execute('SELECT id FROM bookings_rooms WHERE user_id = ? LIMIT 1', [outreachId]);
    if (!exists.length) {
      await pool.execute(
        `INSERT INTO bookings_rooms (user_id, room_id, check_in, check_out, guest_count, season, occupancy_item, total_amount, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [outreachId, roomId, iso(-14), iso(-10), 5, 'Regular', 'Daily Maximum', 18000, 'Approved', 'Completed outreach — deactivate access']
      );
      console.log('[seed] Demo review-access booking for external guest');
    }
  }
}

export async function seedGuestAccessRequests() {
  const [existing] = await pool.execute(
    `SELECT id FROM guest_access_requests WHERE email = ? LIMIT 1`,
    ['retreat@gcc.org']
  );
  if (existing.length) return;

  await pool.execute(
    `INSERT INTO guest_access_requests (full_name, email, organization, notes, status)
     VALUES (?, ?, ?, ?, 'Pending')`,
    [
      'Grace Community Church',
      'retreat@gcc.org',
      'Grace Community Church',
      'Emailed housing office requesting portal access for a July retreat.',
    ]
  );
  console.log('[seed] Demo pending guest access request');
}

export async function runSeed() {
  await runSchemaPatches();

  const bootstrapUsers = process.env.ENABLE_SEED === 'true' || !isProduction;
  const loadDemoData = process.env.ENABLE_DEMO_DATA === 'true' || !isProduction;

  if (bootstrapUsers) {
    await seedUsers();
  } else if (isProduction) {
    console.log('[seed] User bootstrap skipped (set ENABLE_SEED=true on first deploy)');
  }

  if (loadDemoData) {
    await seedDemoData();
    await seedGuestStayExamples();
    await seedGuestAccessRequests();
  } else if (isProduction) {
    console.log('[seed] Demo data skipped in production');
  }
}
