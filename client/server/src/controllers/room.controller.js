import { pool } from '../config/db.js';
import Room from '../models/Room.js';
import { isEmpty } from '../utils/helpers.js';
import { filterRoomsForGuestUser, canGuestAccessBuilding } from '../utils/guestAccess.js';

export const getAllBuildings = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, description FROM buildings ORDER BY name ASC'
    );
    res.status(200).json({ buildings: rows });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getAllRooms = async (req, res) => {
  try {
    const { status, building_id, search } = req.query;
    const conditions = [];
    const params = [];

    if (status && status !== 'all') {
      conditions.push('rooms.status = ?');
      params.push(status);
    }
    if (building_id) {
      conditions.push('rooms.building_id = ?');
      params.push(Number(building_id));
    }
    if (search && String(search).trim()) {
      const term = `%${String(search).trim()}%`;
      conditions.push('(rooms.room_number LIKE ? OR buildings.name LIKE ? OR rooms.room_type LIKE ?)');
      params.push(term, term, term);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows] = await pool.query(
      `SELECT rooms.*, buildings.name AS building_name
       FROM rooms
       LEFT JOIN buildings ON buildings.id = rooms.building_id
       ${where}
       ORDER BY buildings.name ASC, rooms.room_number ASC`,
      params
    );
    const scopedRows = filterRoomsForGuestUser(rows, req.user?.email);
    res.status(200).json({ rooms: scopedRows.map((r) => new Room(r)) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getRoomsOverview = async (req, res) => {
  try {
    const { status, building_id, search } = req.query;
    const conditions = [];
    const params = [];

    if (status && status !== 'all') {
      conditions.push('r.status = ?');
      params.push(status);
    }
    if (building_id) {
      conditions.push('r.building_id = ?');
      params.push(Number(building_id));
    }
    if (search && String(search).trim()) {
      const term = `%${String(search).trim()}%`;
      conditions.push('(r.room_number LIKE ? OR b.name LIKE ? OR r.room_type LIKE ?)');
      params.push(term, term, term);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [buildingRows] = await pool.query(
      'SELECT id, name, description FROM buildings ORDER BY name ASC'
    );

    const [roomRows] = await pool.query(
      `SELECT r.*, b.name AS building_name
       FROM rooms r
       LEFT JOIN buildings b ON b.id = r.building_id
       ${where}
       ORDER BY b.name ASC, r.room_number ASC`,
      params
    );

    const [summaryRows] = await pool.query(`
      SELECT
        COUNT(*) AS total,
        SUM(status = 'Available') AS available,
        SUM(status = 'Occupied') AS occupied,
        SUM(status = 'Dirty') AS dirty,
        SUM(status = 'Maintenance') AS maintenance
      FROM rooms
    `);

    const rooms = roomRows.map((r) => new Room(r));
    const summary = summaryRows[0] || {};

    const roomsByBuilding = new Map();
    for (const room of rooms) {
      const key = room.building_id || 0;
      if (!roomsByBuilding.has(key)) roomsByBuilding.set(key, []);
      roomsByBuilding.get(key).push(room);
    }

    const buildings = buildingRows.map((b) => {
      const bRooms = roomsByBuilding.get(b.id) || [];
      return {
        id: b.id,
        name: b.name,
        description: b.description,
        summary: {
          total: bRooms.length,
          available: bRooms.filter((r) => r.status === 'Available').length,
          occupied: bRooms.filter((r) => r.status === 'Occupied').length,
          dirty: bRooms.filter((r) => r.status === 'Dirty').length,
          maintenance: bRooms.filter((r) => r.status === 'Maintenance').length,
        },
        rooms: bRooms,
      };
    });

    const unassigned = roomsByBuilding.get(0) || [];
    if (unassigned.length) {
      buildings.push({
        id: null,
        name: 'Unassigned',
        description: null,
        summary: {
          total: unassigned.length,
          available: unassigned.filter((r) => r.status === 'Available').length,
          occupied: unassigned.filter((r) => r.status === 'Occupied').length,
          maintenance: unassigned.filter((r) => r.status === 'Maintenance').length,
        },
        rooms: unassigned,
      });
    }

    res.status(200).json({
      summary: {
        total: Number(summary.total || 0),
        available: Number(summary.available || 0),
        occupied: Number(summary.occupied || 0),
        dirty: Number(summary.dirty || 0),
        maintenance: Number(summary.maintenance || 0),
      },
      buildings: buildings.filter((b) => b.summary.total > 0 || !where),
      rooms,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getRoomById = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT rooms.*, buildings.name AS building_name
       FROM rooms
       LEFT JOIN buildings ON buildings.id = rooms.building_id
       WHERE rooms.id = ? LIMIT 1`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Room not found' });
    const ADMIN_ROLES = ['Super Admin', 'Admin'];
    if (!ADMIN_ROLES.includes(req.user?.role)
      && !canGuestAccessBuilding(req.user?.email, rows[0].building_name)) {
      return res.status(403).json({ message: 'You do not have access to this room.' });
    }
    res.status(200).json({ room: new Room(rows[0]) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createRoom = async (req, res) => {
  try {
    const { building_id, room_number, room_type, bed_count, bedroom_count, capacity_min, capacity_max, occupancy, status } = req.body;
    if (isEmpty(building_id) || isEmpty(room_number) || isEmpty(room_type) || isEmpty(capacity_min) || isEmpty(capacity_max)) {
      return res.status(400).json({ message: 'building_id, room_number, room_type, capacity_min, and capacity_max are required' });
    }
    const rawBedCount = bed_count ?? bedroom_count;
    const bedCount = room_type === 'Deluxe Apartment' && rawBedCount != null
      ? Number(rawBedCount)
      : null;
    const [result] = await pool.query(
      `INSERT INTO rooms (building_id, room_number, room_type, bed_count, capacity_min, capacity_max, occupancy, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [building_id, room_number, room_type, bedCount, capacity_min, capacity_max, occupancy || 0, status || 'Available']
    );
    const [newRoom] = await pool.query(
      `SELECT rooms.*, buildings.name AS building_name
       FROM rooms
       LEFT JOIN buildings ON buildings.id = rooms.building_id
       WHERE rooms.id = ?`,
      [result.insertId]
    );
    res.status(201).json({ message: 'Room created', room: new Room(newRoom[0]) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateRoom = async (req, res) => {
  try {
    const [existing] = await pool.query('SELECT * FROM rooms WHERE id = ? LIMIT 1', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ message: 'Room not found' });

    const { building_id, room_number, room_type, bed_count, bedroom_count, capacity_min, capacity_max, occupancy, status } = req.body;
    const hasBedCount = Object.prototype.hasOwnProperty.call(req.body, 'bed_count')
      || Object.prototype.hasOwnProperty.call(req.body, 'bedroom_count');
    const rawBedCount = hasBedCount ? (bed_count ?? bedroom_count) : existing[0].bed_count;
    const bedCount = hasBedCount
      ? (rawBedCount != null ? Number(rawBedCount) : null)
      : existing[0].bed_count;
    await pool.query(
      `UPDATE rooms SET
        building_id  = COALESCE(?, building_id),
        room_number  = COALESCE(?, room_number),
        room_type    = COALESCE(?, room_type),
        bed_count = ?,
        capacity_min = COALESCE(?, capacity_min),
        capacity_max = COALESCE(?, capacity_max),
        occupancy    = COALESCE(?, occupancy),
        status       = COALESCE(?, status)
      WHERE id = ?`,
      [building_id, room_number, room_type, bedCount, capacity_min, capacity_max, occupancy, status, req.params.id]
    );
    const [updated] = await pool.query(
      `SELECT rooms.*, buildings.name AS building_name
       FROM rooms
       LEFT JOIN buildings ON buildings.id = rooms.building_id
       WHERE rooms.id = ?`,
      [req.params.id]
    );
    res.status(200).json({ message: 'Room updated', room: new Room(updated[0]) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteRoom = async (req, res) => {
  try {
    const [existing] = await pool.query('SELECT * FROM rooms WHERE id = ? LIMIT 1', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ message: 'Room not found' });
    await pool.query('DELETE FROM rooms WHERE id = ?', [req.params.id]);
    res.status(200).json({ message: 'Room deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};