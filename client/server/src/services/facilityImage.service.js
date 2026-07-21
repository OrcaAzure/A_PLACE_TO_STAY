/**
 * Facility/venue photo storage — thin wrapper around the shared WebP image store.
 *
 * Files land under public/images/facilities/{facilityId}/ as WebP; the public
 * paths are stored in facilities.preview_images (JSON array). Uploaded photos
 * are the source of truth for venue imagery; the client falls back to
 * hardcoded images only when this array is empty (see client facility-display.js).
 *
 * All heavy lifting (validation, sharp conversion, JSON-column parsing, safe
 * deletes) lives in imageStorage.service.js and is shared with
 * roomImage.service.js.
 */
import {
  createImageStore,
  sanitizeImageFilename,
  IMAGE_MAX_COUNT,
  IMAGE_MAX_BYTES,
} from './imageStorage.service.js';

/* Upload constraints re-exported under facility-specific names for multer middleware. */
export const FACILITY_IMAGE_MAX_COUNT = IMAGE_MAX_COUNT;
export const FACILITY_IMAGE_MAX_BYTES = IMAGE_MAX_BYTES;

const store = createImageStore({ pathPrefix: '/images/facilities/' });

/** Normalize a facilities.preview_images JSON value to a clean string[] of public paths. */
export const parseFacilityPreviewImages = store.parsePreviewImages;

/** Serialize a path list for `CAST(? AS JSON)` binding; null when empty. */
export const facilityPreviewImagesForMysql = store.previewImagesForMysql;

export const sanitizeFacilityImageFilename = sanitizeImageFilename;
export const ensureFacilityImageDir = store.ensureImageDir;
export const unlinkFacilityImagePath = store.unlinkImagePath;
export const processFacilityImageUpload = store.processImageUpload;
export const deleteFacilityImageFile = store.deleteImageFile;
export const replaceFacilityImageFile = store.replaceImageFile;
export const deleteAllFacilityImages = store.deleteAllImages;
