import { pool } from '../config/db.js';
import Room from '../models/Room.js';
import { isEmpty } from '../utils/helpers.js';
import { isAdminRole } from '../utils/constants.js';
import { assertRoomDeletable } from '../services/booking.service.js';
import { filterRoomsForGuestUser, canGuestAccessBuilding } from '../utils/guestAccess.js';
import {
  parsePreviewImages,
  processRoomImageUpload,
  deleteRoomImageFile,
  deleteAllRoomImages,
  ROOM_IMAGE_MAX_COUNT,
} from '../services/roomImage.service.js';

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
    const rooms = isAdminRole(req.user?.role)
      ? rows
      : filterRoomsForGuestUser(rows, req.user?.email);
    res.status(200).json({ rooms: rooms.map((r) => new Room(r)) });
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
    if (!isAdminRole(req.user?.role)
      && !canGuestAccessBuilding(req.user?.email, rows[0].building_name)) {
      return res.status(403).json({ message: 'You do not have access to this room.' });
    }
    res.status(200).json({ room: new Room(rows[0]) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const ALLOWED_STATUSES = ['Available', 'Occupied', 'Dirty', 'Maintenance'];

function cleanOptionalText(value, { maxLen = 4000 } = {}) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (text.length > maxLen) return { error: `Text is too long (max ${maxLen} characters).` };
  return text;
}

/** Validate & normalize a room payload. Returns { error } or { values }. */
function normalizeRoomInput(body, existing = null) {
  const roomType = body.room_type != null ? String(body.room_type).trim() : existing?.room_type;
  const roomNumber = body.room_number != null ? String(body.room_number).trim() : existing?.room_number;
  const buildingId = body.building_id != null ? Number(body.building_id) : existing?.building_id;

  const capMin = body.capacity_min != null ? Number(body.capacity_min) : existing?.capacity_min;
  const capMax = body.capacity_max != null ? Number(body.capacity_max) : existing?.capacity_max;
  const occupancy = body.occupancy != null ? Number(body.occupancy) : (existing?.occupancy ?? 0);
  const status = body.status != null ? String(body.status).trim() : (existing?.status || 'Available');

  if (!buildingId) return { error: 'Please choose a building.' };
  if (!roomNumber) return { error: 'Please enter a room name or number.' };
  if (!roomType) return { error: 'Please choose a room type.' };
  if (roomType.length > 100) return { error: 'Room type name is too long (max 100 characters).' };

  if (!Number.isInteger(capMin) || capMin < 1) return { error: 'Minimum capacity must be a whole number of at least 1.' };
  if (!Number.isInteger(capMax) || capMax < 1) return { error: 'Maximum capacity must be a whole number of at least 1.' };
  if (capMin > capMax) return { error: 'Minimum capacity cannot be greater than the maximum.' };
  if (!Number.isInteger(occupancy) || occupancy < 0) return { error: 'Occupancy must be zero or a positive whole number.' };
  if (occupancy > capMax) return { error: `There are ${occupancy} guests checked in — set the maximum capacity to at least ${occupancy}.` };
  if (status && !ALLOWED_STATUSES.includes(status)) return { error: 'Invalid room status.' };

  const hasBedCount = Object.prototype.hasOwnProperty.call(body, 'bed_count')
    || Object.prototype.hasOwnProperty.call(body, 'bedroom_count');
  const rawBedCount = hasBedCount ? (body.bed_count ?? body.bedroom_count) : existing?.bed_count;

  // A shared dorm has no bedrooms; every other type may record how many it has.
  let bedCount = null;
  if (roomType !== 'Dorm' && rawBedCount != null && String(rawBedCount).trim() !== '') {
    const n = Number(rawBedCount);
    if (!Number.isInteger(n) || n < 1) {
      return { error: 'Bedrooms must be a whole number of at least 1.' };
    }
    bedCount = n;
  }

  const description = Object.prototype.hasOwnProperty.call(body, 'description')
    ? cleanOptionalText(body.description)
    : (existing?.description ?? null);
  if (description && typeof description === 'object' && description.error) {
    return { error: `Description: ${description.error}` };
  }

  const inclusionsRaw = Object.prototype.hasOwnProperty.call(body, 'inclusions')
    ? body.inclusions
    : (Object.prototype.hasOwnProperty.call(body, 'highlights') ? body.highlights : undefined);
  const inclusions = inclusionsRaw !== undefined
    ? cleanOptionalText(inclusionsRaw)
    : (existing?.inclusions ?? existing?.highlights ?? null);
  if (inclusions && typeof inclusions === 'object' && inclusions.error) {
    return { error: `Inclusions: ${inclusions.error}` };
  }

  const policies = Object.prototype.hasOwnProperty.call(body, 'policies')
    ? cleanOptionalText(body.policies)
    : (existing?.policies ?? null);
  if (policies && typeof policies === 'object' && policies.error) {
    return { error: `Policies: ${policies.error}` };
  }

  return {
    values: {
      building_id: buildingId,
      room_number: roomNumber,
      room_type: roomType,
      bed_count: bedCount,
      capacity_min: capMin,
      capacity_max: capMax,
      occupancy,
      status: status || 'Available',
      description: description ?? null,
      inclusions: inclusions ?? null,
      policies: policies ?? null,
    },
  };
}

export const createRoom = async (req, res) => {
  try {
    if (isEmpty(req.body.capacity_min) || isEmpty(req.body.capacity_max)) {
      return res.status(400).json({ message: 'Both minimum and maximum capacity are required.' });
    }
    const { error, values } = normalizeRoomInput(req.body);
    if (error) return res.status(400).json({ message: error });

    const [result] = await pool.query(
      `INSERT INTO rooms (
         building_id, room_number, room_type, bed_count, capacity_min, capacity_max,
         occupancy, status, description, inclusions, policies
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        values.building_id, values.room_number, values.room_type, values.bed_count,
        values.capacity_min, values.capacity_max, values.occupancy, values.status,
        values.description, values.inclusions, values.policies,
      ]
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
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'A room with that number already exists in this building.' });
    }
    res.status(500).json({ message: error.message });
  }
};

export const updateRoom = async (req, res) => {
  try {
    const [existing] = await pool.query('SELECT * FROM rooms WHERE id = ? LIMIT 1', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ message: 'Room not found' });

    const { error, values } = normalizeRoomInput(req.body, existing[0]);
    if (error) return res.status(400).json({ message: error });

    await pool.query(
      `UPDATE rooms SET
        building_id  = ?,
        room_number  = ?,
        room_type    = ?,
        bed_count    = ?,
        capacity_min = ?,
        capacity_max = ?,
        occupancy    = ?,
        status       = ?,
        description  = ?,
        inclusions   = ?,
        policies     = ?
      WHERE id = ?`,
      [
        values.building_id, values.room_number, values.room_type, values.bed_count,
        values.capacity_min, values.capacity_max, values.occupancy, values.status,
        values.description, values.inclusions, values.policies, req.params.id,
      ]
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
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'A room with that number already exists in this building.' });
    }
    res.status(500).json({ message: error.message });
  }
};

export const deleteRoom = async (req, res) => {
  try {
    const [existing] = await pool.query('SELECT * FROM rooms WHERE id = ? LIMIT 1', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ message: 'Room not found' });
    await assertRoomDeletable(req.params.id);
    await deleteAllRoomImages(req.params.id);
    await pool.query('DELETE FROM rooms WHERE id = ?', [req.params.id]);
    res.status(200).json({ message: 'Room deleted' });
  } catch (error) {
    const status = error.message.includes('reservation') ? 409 : 500;
    res.status(status).json({ message: error.message });
  }
};

async function fetchRoomRecord(id) {
  const [rows] = await pool.query(
    `SELECT rooms.*, buildings.name AS building_name
     FROM rooms
     LEFT JOIN buildings ON buildings.id = rooms.building_id
     WHERE rooms.id = ? LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

export const uploadRoomImagesHandler = async (req, res) => {
  try {
    const roomId = Number(req.params.id);
    if (!Number.isInteger(roomId) || roomId <= 0) {
      return res.status(400).json({ message: 'Invalid room id.' });
    }

    const existing = await fetchRoomRecord(roomId);
    if (!existing) return res.status(404).json({ message: 'Room not found' });

    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) return res.status(400).json({ message: 'Choose at least one JPG or PNG image.' });

    const current = parsePreviewImages(existing.preview_images);
    if (current.length + files.length > ROOM_IMAGE_MAX_COUNT) {
      return res.status(400).json({
        message: `This room can have up to ${ROOM_IMAGE_MAX_COUNT} photos. Remove some before uploading more.`,
      });
    }

    const added = [];
    for (const file of files) {
      added.push(await processRoomImageUpload(file, roomId));
    }

    const previewImages = [...current, ...added];
    await pool.query('UPDATE rooms SET preview_images = ? WHERE id = ?', [
      JSON.stringify(previewImages),
      roomId,
    ]);

    const room = await fetchRoomRecord(roomId);
    res.status(200).json({
      message: added.length === 1 ? 'Photo uploaded' : `${added.length} photos uploaded`,
      preview_images: previewImages,
      room: new Room(room),
    });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Could not upload photos.' });
  }
};

export const deleteRoomImageHandler = async (req, res) => {
  try {
    const roomId = Number(req.params.id);
    if (!Number.isInteger(roomId) || roomId <= 0) {
      return res.status(400).json({ message: 'Invalid room id.' });
    }

    const existing = await fetchRoomRecord(roomId);
    if (!existing) return res.status(404).json({ message: 'Room not found' });

    const publicPath = await deleteRoomImageFile(roomId, req.params.filename);
    const previewImages = parsePreviewImages(existing.preview_images)
      .filter((p) => p !== publicPath);

    await pool.query('UPDATE rooms SET preview_images = ? WHERE id = ?', [
      previewImages.length ? JSON.stringify(previewImages) : null,
      roomId,
    ]);

    const room = await fetchRoomRecord(roomId);
    res.status(200).json({
      message: 'Photo removed',
      preview_images: previewImages,
      room: new Room(room),
    });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Could not remove photo.' });
  }
};