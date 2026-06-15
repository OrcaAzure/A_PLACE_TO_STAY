import { pool } from '../config/db.js';
import Room from '../models/Room.js';
import { isEmpty } from '../utils/helpers.js';

export const getAllRooms = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM rooms ORDER BY room_number ASC');
    res.status(200).json({ rooms: rows.map(r => new Room(r)) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getRoomById = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM rooms WHERE id = ? LIMIT 1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Room not found' });
    res.status(200).json({ room: new Room(rows[0]) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createRoom = async (req, res) => {
  try {
    const { room_number, room_type, capacity, price } = req.body;
    if (isEmpty(room_number) || isEmpty(room_type) || isEmpty(capacity) || isEmpty(price)) {
      return res.status(400).json({ message: 'room_number, room_type, capacity, and price are required' });
    }
    const [result] = await pool.query(
      'INSERT INTO rooms (room_number, room_type, capacity, price) VALUES (?, ?, ?, ?)',
      [room_number, room_type, capacity, price]
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

    const { room_number, room_type, capacity, occupancy, price, status } = req.body;
    await pool.query(
      `UPDATE rooms SET
        room_number = COALESCE(?, room_number),
        room_type   = COALESCE(?, room_type),
        capacity    = COALESCE(?, capacity),
        occupancy   = COALESCE(?, occupancy),
        price       = COALESCE(?, price),
        status      = COALESCE(?, status)
      WHERE id = ?`,
      [room_number, room_type, capacity, occupancy, price, status, req.params.id]
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