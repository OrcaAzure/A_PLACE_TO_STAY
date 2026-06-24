import { pool } from '../config/db.js';
import Room from '../models/Room.js';
import { isEmpty } from '../utils/helpers.js';

export const getAllRooms = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT rooms.*, buildings.name AS building_name
       FROM rooms
       LEFT JOIN buildings ON buildings.id = rooms.building_id
       ORDER BY rooms.room_number ASC`
    );
    res.status(200).json({ rooms: rows.map(r => new Room(r)) });
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
    res.status(200).json({ room: new Room(rows[0]) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createRoom = async (req, res) => {
  try {
    const { building_id, room_number, room_type, capacity_min, capacity_max, occupancy, status } = req.body;
    if (isEmpty(building_id) || isEmpty(room_number) || isEmpty(room_type) || isEmpty(capacity_min) || isEmpty(capacity_max)) {
      return res.status(400).json({ message: 'building_id, room_number, room_type, capacity_min, and capacity_max are required' });
    }
    const [result] = await pool.query(
      `INSERT INTO rooms (building_id, room_number, room_type, capacity_min, capacity_max, occupancy, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [building_id, room_number, room_type, capacity_min, capacity_max, occupancy || 0, status || 'Available']
    );
    const [newRoom] = await pool.query('SELECT * FROM rooms WHERE id = ?', [result.insertId]);
    res.status(201).json({ message: 'Room created', room: new Room(newRoom[0]) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateRoom = async (req, res) => {
  try {
    const [existing] = await pool.query('SELECT * FROM rooms WHERE id = ? LIMIT 1', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ message: 'Room not found' });

    const { building_id, room_number, room_type, capacity_min, capacity_max, occupancy, status } = req.body;
    await pool.query(
      `UPDATE rooms SET
        building_id  = COALESCE(?, building_id),
        room_number  = COALESCE(?, room_number),
        room_type    = COALESCE(?, room_type),
        capacity_min = COALESCE(?, capacity_min),
        capacity_max = COALESCE(?, capacity_max),
        occupancy    = COALESCE(?, occupancy),
        status       = COALESCE(?, status)
      WHERE id = ?`,
      [building_id, room_number, room_type, capacity_min, capacity_max, occupancy, status, req.params.id]
    );
    const [updated] = await pool.query('SELECT * FROM rooms WHERE id = ?', [req.params.id]);
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