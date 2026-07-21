/**
 * Facility/venue photo uploads — mirrors roomImage.service.js.
 * Files land under public/images/facilities/{facilityId}/ as WebP.
 * Paths stored in facilities.preview_images (JSON array).
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '../../../public');
const FACILITY_IMAGES_ROOT = path.join(PUBLIC_DIR, 'images', 'facilities');

export const FACILITY_IMAGE_MAX_COUNT = 6;
export const FACILITY_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const FACILITY_IMAGE_MAX_WIDTH = 1400;
export const FACILITY_IMAGE_WEBP_QUALITY = 82;

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/jpg']);
const PATH_PREFIX = '/images/facilities/';

function isFacilityImagePath(v) {
  return typeof v === 'string' && v.startsWith(PATH_PREFIX);
}

/**
 * Normalize DB JSON (mysql2 may return array, string, Buffer, or double-encoded JSON).
 */
export function parseFacilityPreviewImages(value) {
  if (value == null || value === '') return [];
  let raw = value;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(raw)) {
    raw = raw.toString('utf8');
  }
  if (Array.isArray(raw)) return raw.filter(isFacilityImagePath);
  if (typeof raw === 'object') {
    const vals = Object.values(raw);
    if (vals.length && vals.every((v) => typeof v === 'string')) return vals.filter(isFacilityImagePath);
    return [];
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      let parsed = JSON.parse(trimmed);
      if (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed);
        } catch {
          /* keep string */
        }
      }
      if (Array.isArray(parsed)) return parsed.filter(isFacilityImagePath);
      if (isFacilityImagePath(parsed)) return [parsed];
      return [];
    } catch {
      return isFacilityImagePath(trimmed) ? [trimmed] : [];
    }
  }
  return [];
}

/** Bind a JS array to a MySQL JSON column without double-encoding as a JSON string. */
export function facilityPreviewImagesForMysql(paths) {
  const list = parseFacilityPreviewImages(paths);
  if (!list.length) return null;
  return JSON.stringify(list);
}

export function sanitizeFacilityImageFilename(filename) {
  const raw = String(filename || '');
  if (!raw || raw.includes('..') || raw.includes('/') || raw.includes('\\')) return null;
  const base = path.basename(raw);
  if (!/^[a-zA-Z0-9_-]+\.webp$/.test(base)) return null;
  return base;
}

function facilityDir(facilityId) {
  return path.join(FACILITY_IMAGES_ROOT, String(facilityId));
}

function publicPathFor(facilityId, filename) {
  return `${PATH_PREFIX}${facilityId}/${filename}`;
}

async function removeWithRetry(remove, attempts = 5) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await remove();
      return;
    } catch (err) {
      if (err.code === 'ENOENT') return;
      const retryable = err.code === 'EBUSY' || err.code === 'EPERM';
      if (!retryable || attempt === attempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, attempt * 50));
    }
  }
}

export async function ensureFacilityImageDir(facilityId) {
  await fs.mkdir(facilityDir(facilityId), { recursive: true });
}

export async function unlinkFacilityImagePath(publicPath) {
  if (typeof publicPath !== 'string' || !publicPath.startsWith(PATH_PREFIX)) return;
  const rel = publicPath.replace(/^\//, '');
  await removeWithRetry(() => fs.unlink(path.join(PUBLIC_DIR, rel)));
}

export async function processFacilityImageUpload(file, facilityId) {
  if (!file?.buffer) throw new Error('No image file received.');
  if (!ALLOWED_MIME.has(file.mimetype)) {
    throw new Error('Only JPG and PNG images are allowed.');
  }
  if (file.size > FACILITY_IMAGE_MAX_BYTES) {
    throw new Error('Each image must be 8 MB or smaller.');
  }

  const filename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.webp`;
  await ensureFacilityImageDir(facilityId);

  const outputPath = path.join(facilityDir(facilityId), filename);
  await sharp(file.buffer)
    .rotate()
    .resize({ width: FACILITY_IMAGE_MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: FACILITY_IMAGE_WEBP_QUALITY })
    .toFile(outputPath);

  return publicPathFor(facilityId, filename);
}

export async function deleteFacilityImageFile(facilityId, filename) {
  const safeName = sanitizeFacilityImageFilename(filename);
  if (!safeName) throw new Error('Invalid image filename.');
  const filePath = path.join(facilityDir(facilityId), safeName);
  await removeWithRetry(() => fs.unlink(filePath));
  return publicPathFor(facilityId, safeName);
}

export async function replaceFacilityImageFile(file, facilityId, oldFilename) {
  const safeOld = sanitizeFacilityImageFilename(oldFilename);
  if (!safeOld) throw new Error('Invalid image filename.');
  const oldPath = publicPathFor(facilityId, safeOld);
  const newPath = await processFacilityImageUpload(file, facilityId);
  return { oldPath, newPath, oldFilename: safeOld };
}

export async function deleteAllFacilityImages(facilityId) {
  const dir = facilityDir(facilityId);
  await removeWithRetry(() => fs.rm(dir, { recursive: true, force: true }));
}
