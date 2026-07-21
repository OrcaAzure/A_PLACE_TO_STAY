import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '../../../public');
const ROOM_IMAGES_ROOT = path.join(PUBLIC_DIR, 'images', 'rooms');

export const ROOM_IMAGE_MAX_COUNT = 6;
export const ROOM_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const ROOM_IMAGE_MAX_WIDTH = 1400;
export const ROOM_IMAGE_WEBP_QUALITY = 82;

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/jpg']);

export function parsePreviewImages(value) {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) return value.filter((v) => typeof v === 'string' && v.startsWith('/images/rooms/'));
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string' && v.startsWith('/images/rooms/')) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function sanitizeRoomImageFilename(filename) {
  const raw = String(filename || '');
  if (!raw || raw.includes('..') || raw.includes('/') || raw.includes('\\')) return null;
  const base = path.basename(raw);
  if (!/^[a-zA-Z0-9_-]+\.webp$/.test(base)) return null;
  return base;
}

function roomDir(roomId) {
  return path.join(ROOM_IMAGES_ROOT, String(roomId));
}

function publicPathFor(roomId, filename) {
  return `/images/rooms/${roomId}/${filename}`;
}

export async function ensureRoomImageDir(roomId) {
  await fs.mkdir(roomDir(roomId), { recursive: true });
}

export async function processRoomImageUpload(file, roomId) {
  if (!file?.buffer) throw new Error('No image file received.');
  if (!ALLOWED_MIME.has(file.mimetype)) {
    throw new Error('Only JPG and PNG images are allowed.');
  }
  if (file.size > ROOM_IMAGE_MAX_BYTES) {
    throw new Error('Each image must be 8 MB or smaller.');
  }

  const filename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.webp`;
  await ensureRoomImageDir(roomId);

  const outputPath = path.join(roomDir(roomId), filename);
  await sharp(file.buffer)
    .rotate()
    .resize({ width: ROOM_IMAGE_MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: ROOM_IMAGE_WEBP_QUALITY })
    .toFile(outputPath);

  return publicPathFor(roomId, filename);
}

export async function deleteRoomImageFile(roomId, filename) {
  const safeName = sanitizeRoomImageFilename(filename);
  if (!safeName) throw new Error('Invalid image filename.');
  const filePath = path.join(roomDir(roomId), safeName);
  await fs.unlink(filePath).catch((err) => {
    if (err.code !== 'ENOENT') throw err;
  });
  return publicPathFor(roomId, safeName);
}

export async function deleteAllRoomImages(roomId) {
  const dir = roomDir(roomId);
  await fs.rm(dir, { recursive: true, force: true });
}
