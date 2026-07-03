import { pool } from '../../config/db.js';
import { NON_VENUE_CATEGORIES } from '../../constants/ancillary.js';
import { deriveFacilityCatalogFields } from '../../services/facilityCatalog.service.js';
import { tableExists, columnExists, dropForeignKey } from '../helpers.js';

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
        `INSERT INTO rates_extra_services (category, item, season, rate)
         VALUES ('GMC Chapel', 'Aircon', 'N/A', ?)
         ON DUPLICATE KEY UPDATE rate = VALUES(rate)`,
        [airconRows[0].rate]
      );
    }
    await pool.execute(`DELETE FROM facilities WHERE category = 'GMC Chapel' AND item = 'Aircon'`);
  }

  await pool.execute(
    `INSERT INTO rates_extra_services (category, item, season, rate)
     VALUES ('GMC Chapel', 'Aircon', 'N/A', 275.00)
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

export {
  upsertGmcFacilities,
  migrateAirconToExtraServices,
  ensureRatesFacilitiesTable,
  runFacilitiesCatalogMigration,
  runGmcAblockMigration,
};
