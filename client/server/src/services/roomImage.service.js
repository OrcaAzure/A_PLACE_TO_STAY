/**
 * Room photo storage — thin wrapper around the shared WebP image store.
 *
 * Files land under public/images/rooms/{roomId}/ as WebP; the public paths are
 * stored in rooms.preview_images (JSON array). Uploaded photos are the source
 * of truth for room imagery; the client falls back to hardcoded images only
 * when this array is empty (see client facility-display.js).
 *
 * All heavy lifting (validation, sharp conversion, JSON-column parsing, safe
 * deletes) lives in imageStorage.service.js and is shared with
 * facilityImage.service.js.
 */
import {
  createImageStore,
  sanitizeImageFilename,
  IMAGE_MAX_COUNT,
  IMAGE_MAX_BYTES,
} from './imageStorage.service.js';

/* Upload constraints re-exported under room-specific names for multer middleware. */
export const ROOM_IMAGE_MAX_COUNT = IMAGE_MAX_COUNT;
export const ROOM_IMAGE_MAX_BYTES = IMAGE_MAX_BYTES;

const store = createImageStore({ pathPrefix: '/images/rooms/' });

/** Normalize a rooms.preview_images JSON value to a clean string[] of public paths. */
export const parsePreviewImages = store.parsePreviewImages;

/** Serialize a path list for `CAST(? AS JSON)` binding; null when empty. */
export const previewImagesForMysql = store.previewImagesForMysql;

export const sanitizeRoomImageFilename = sanitizeImageFilename;
export const ensureRoomImageDir = store.ensureImageDir;
export const unlinkRoomImagePath = store.unlinkImagePath;
export const processRoomImageUpload = store.processImageUpload;
export const deleteRoomImageFile = store.deleteImageFile;
export const replaceRoomImageFile = store.replaceImageFile;
export const deleteAllRoomImages = store.deleteAllImages;
