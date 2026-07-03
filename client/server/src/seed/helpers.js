import { pool } from '../config/db.js';

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

export { getUserId, getRoomId, tableExists, columnExists, dropForeignKey };
