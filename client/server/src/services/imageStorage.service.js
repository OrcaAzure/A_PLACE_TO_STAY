/**
 * Generic WebP image storage engine shared by room and facility photo pipelines.
 *
 * How it fits in:
 *   roomImage.service.js     -> createImageStore for /images/rooms/{roomId}/
 *   facilityImage.service.js -> createImageStore for /images/facilities/{facilityId}/
 *
 * Responsibilities:
 *   - validate + convert uploads (JPG/PNG -> resized WebP via sharp)
 *   - parse `preview_images` JSON columns defensively (mysql2 may hand back an
 *     array, string, Buffer, or an accidentally double-encoded JSON string)
 *   - safe filename handling and retry-tolerant file deletion (Windows EBUSY/EPERM)
 *
 * The DB itself is owned by the callers; this module only touches the filesystem
 * and normalizes values in/out of the JSON column.
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PUBLIC_DIR = path.join(__dirname, '../../../public');

/* Shared upload constraints — same limits for rooms and facilities. */
export const IMAGE_MAX_COUNT = 6;
export const IMAGE_MAX_BYTES = 8 * 1024 * 1024; // 8 MB per file
export const IMAGE_MAX_WIDTH = 1400; // px; larger uploads are downscaled
export const IMAGE_WEBP_QUALITY = 82;

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/jpg']);

/** Only allow generated names like `1712345678-a1b2c3d4.webp` (no path tricks). */
export function sanitizeImageFilename(filename) {
  const raw = String(filename || '');
  if (!raw || raw.includes('..') || raw.includes('/') || raw.includes('\\')) return null;
  const base = path.basename(raw);
  if (!/^[a-zA-Z0-9_-]+\.webp$/.test(base)) return null;
  return base;
}

/**
 * Delete with retries — Windows can briefly hold file locks (EBUSY/EPERM)
 * right after sharp writes or while a static request streams the file.
 */
async function removeWithRetry(remove, attempts = 5) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await remove();
      return;
    } catch (err) {
      if (err.code === 'ENOENT') return; // already gone — success
      const retryable = err.code === 'EBUSY' || err.code === 'EPERM';
      if (!retryable || attempt === attempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, attempt * 50));
    }
  }
}

/**
 * Build an image store bound to one public path prefix.
 *
 * @param {object} config
 * @param {string} config.pathPrefix - Public URL prefix, e.g. '/images/rooms/'.
 *   Also determines the on-disk root under PUBLIC_DIR.
 * @returns Store with parse/serialize + file CRUD helpers. All "publicPath"
 *   values are browser-facing (e.g. '/images/rooms/12/abc.webp').
 */
export function createImageStore({ pathPrefix }) {
  const imagesRoot = path.join(PUBLIC_DIR, ...pathPrefix.split('/').filter(Boolean));

  const isStorePath = (v) => typeof v === 'string' && v.startsWith(pathPrefix);
  const entityDir = (entityId) => path.join(imagesRoot, String(entityId));
  const publicPathFor = (entityId, filename) => `${pathPrefix}${entityId}/${filename}`;

  /**
   * Normalize a `preview_images` JSON column value to string[].
   * Accepts array / object / string / Buffer / double-encoded JSON;
   * silently drops anything that is not a path under this store's prefix.
   */
  function parsePreviewImages(value) {
    if (value == null || value === '') return [];
    let raw = value;
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(raw)) {
      raw = raw.toString('utf8');
    }
    if (Array.isArray(raw)) return raw.filter(isStorePath);
    if (typeof raw === 'object') {
      // mysql2 can surface JSON columns as plain objects with numeric keys.
      const vals = Object.values(raw);
      if (vals.length && vals.every((v) => typeof v === 'string')) return vals.filter(isStorePath);
      return [];
    }
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (!trimmed) return [];
      try {
        let parsed = JSON.parse(trimmed);
        // Repair accidental double-encoding (JSON.stringify into a JSON column).
        if (typeof parsed === 'string') {
          try {
            parsed = JSON.parse(parsed);
          } catch {
            /* keep the single-decoded string */
          }
        }
        if (Array.isArray(parsed)) return parsed.filter(isStorePath);
        if (isStorePath(parsed)) return [parsed];
        return [];
      } catch {
        return isStorePath(trimmed) ? [trimmed] : [];
      }
    }
    return [];
  }

  /**
   * Serialize a path list for a MySQL JSON column.
   * Callers bind the result with `CAST(? AS JSON)` to avoid double-encoding.
   * Returns null when the list is empty so the column stores SQL NULL.
   */
  function previewImagesForMysql(paths) {
    const list = parsePreviewImages(paths);
    if (!list.length) return null;
    return JSON.stringify(list);
  }

  async function ensureImageDir(entityId) {
    await fs.mkdir(entityDir(entityId), { recursive: true });
  }

  /** Best-effort cleanup when a processed upload should not be kept. */
  async function unlinkImagePath(publicPath) {
    if (!isStorePath(publicPath)) return;
    const rel = publicPath.replace(/^\//, '');
    await removeWithRetry(() => fs.unlink(path.join(PUBLIC_DIR, rel)));
  }

  /**
   * Validate + convert one multer file to WebP on disk.
   * @returns {Promise<string>} public path of the stored image.
   * @throws {Error} with a user-facing message on validation failure.
   */
  async function processImageUpload(file, entityId) {
    if (!file?.buffer) throw new Error('No image file received.');
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new Error('Only JPG and PNG images are allowed.');
    }
    if (file.size > IMAGE_MAX_BYTES) {
      throw new Error('Each image must be 8 MB or smaller.');
    }

    const filename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.webp`;
    await ensureImageDir(entityId);

    const outputPath = path.join(entityDir(entityId), filename);
    await sharp(file.buffer)
      .rotate() // respect EXIF orientation before resizing
      .resize({ width: IMAGE_MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: IMAGE_WEBP_QUALITY })
      .toFile(outputPath);

    return publicPathFor(entityId, filename);
  }

  /** Delete one stored image file. Returns its public path for DB cleanup. */
  async function deleteImageFile(entityId, filename) {
    const safeName = sanitizeImageFilename(filename);
    if (!safeName) throw new Error('Invalid image filename.');
    const filePath = path.join(entityDir(entityId), safeName);
    await removeWithRetry(() => fs.unlink(filePath));
    return publicPathFor(entityId, safeName);
  }

  /**
   * Write the replacement first so a failed upload never loses the original.
   * Caller updates the DB, then unlinks `oldPath`.
   * @returns {{ oldPath: string, newPath: string, oldFilename: string }}
   */
  async function replaceImageFile(file, entityId, oldFilename) {
    const safeOld = sanitizeImageFilename(oldFilename);
    if (!safeOld) throw new Error('Invalid image filename.');
    const oldPath = publicPathFor(entityId, safeOld);
    const newPath = await processImageUpload(file, entityId);
    return { oldPath, newPath, oldFilename: safeOld };
  }

  /** Remove the whole per-entity image directory (entity deleted). */
  async function deleteAllImages(entityId) {
    await removeWithRetry(() => fs.rm(entityDir(entityId), { recursive: true, force: true }));
  }

  return {
    isStorePath,
    parsePreviewImages,
    previewImagesForMysql,
    ensureImageDir,
    unlinkImagePath,
    processImageUpload,
    deleteImageFile,
    replaceImageFile,
    deleteAllImages,
  };
}
