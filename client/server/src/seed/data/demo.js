import { pool } from '../../config/db.js';
import { getUserId, getRoomId } from '../helpers.js';

const DEMO_BOOKINGS = [
  { email: 'maria.santos@apts.edu.ph',    building: 'Global Missions Center', room: '201', check_in: '2026-07-01', check_out: '2026-07-05', guests: 2, season: 'Regular', item: 'Single/Double Occupancy', total: 10000, status: 'Approved', notes: 'Conference attendance' },
  { email: 'maria.santos@apts.edu.ph',    building: 'Global Missions Center', room: '401', check_in: '2026-07-15', check_out: '2026-07-20', guests: 4, season: 'Regular', item: 'Daily Maximum',           total: 22750, status: 'Rejected', notes: 'Family retreat — rejected due to room conflict' },
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

export async function seedGuestStayExamples() {
  const samuelId = await getUserId('samuel.park@gracechurch.org');
  const roomId = await getRoomId('Global Missions Center', '301');
  if (!roomId || !samuelId) return;

  const today = new Date();
  const iso = (offset) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  };

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
