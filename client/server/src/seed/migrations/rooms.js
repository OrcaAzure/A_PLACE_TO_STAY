import { pool } from '../../config/db.js';

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

/** GMC dorm max pax — FY26 lodging sheet (rooms not listed keep prior defaults). */
const DORM_CAPACITY_BY_ROOM = {
  '103': { min: 1, max: 2 },
  '202': { min: 1, max: 40 },
  '204': { min: 1, max: 16 },
  '206': { min: 1, max: 14 },
  '207': { min: 1, max: 14 },
  '208': { min: 1, max: 14 },
  '305': { min: 1, max: 20 },
  '306': { min: 1, max: 16 },
  '309': { min: 1, max: 4 },
  '310': { min: 1, max: 4 },
};

/** GMC Superior Guest Room max pax — FY26 lodging sheet (rooms not listed keep prior defaults). */
const SUPERIOR_GUEST_ROOM_CAPACITY_BY_ROOM = {
  '410': { min: 1, max: 2 },
  '413': { min: 1, max: 3 },
};

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

async function runDormCapacityMigration() {
  const [[gmc]] = await pool.execute(
    `SELECT id FROM buildings WHERE name = 'Global Missions Center' LIMIT 1`
  );
  if (!gmc?.id) return;

  for (const [roomNumber, caps] of Object.entries(DORM_CAPACITY_BY_ROOM)) {
    await pool.execute(
      `UPDATE rooms
       SET capacity_min = ?, capacity_max = ?
       WHERE building_id = ? AND room_number = ? AND room_type = 'Dorm'`,
      [caps.min, caps.max, gmc.id, roomNumber]
    );
  }

  console.log('[schema] GMC dorm capacities updated (FY26 sheet)');
}

async function runSuperiorGuestRoomCapacityMigration() {
  const [[gmc]] = await pool.execute(
    `SELECT id FROM buildings WHERE name = 'Global Missions Center' LIMIT 1`
  );
  if (!gmc?.id) return;

  for (const [roomNumber, caps] of Object.entries(SUPERIOR_GUEST_ROOM_CAPACITY_BY_ROOM)) {
    await pool.execute(
      `UPDATE rooms
       SET capacity_min = ?, capacity_max = ?
       WHERE building_id = ? AND room_number = ? AND room_type = 'Superior Guest Room'`,
      [caps.min, caps.max, gmc.id, roomNumber]
    );
  }

  console.log('[schema] GMC Superior Guest Room capacities updated (FY26 sheet)');
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

export {
  upsertDeluxeRoomRates,
  runDeluxeRoomTypeMigration,
  runDormCapacityMigration,
  runSuperiorGuestRoomCapacityMigration,
  runSeasonSettingsMigration,
};
