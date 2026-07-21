import multer from 'multer';
import { FACILITY_IMAGE_MAX_BYTES, FACILITY_IMAGE_MAX_COUNT } from '../services/facilityImage.service.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: FACILITY_IMAGE_MAX_BYTES,
    files: FACILITY_IMAGE_MAX_COUNT,
  },
  fileFilter(req, file, cb) {
    const ok = ['image/jpeg', 'image/png', 'image/jpg'].includes(file.mimetype);
    cb(ok ? null : new Error('Only JPG and PNG images are allowed.'), ok);
  },
});

export const uploadFacilityImages = upload.array('images', FACILITY_IMAGE_MAX_COUNT);
export const uploadFacilityImageReplace = upload.single('image');

export function handleFacilityImageUploadError(err, req, res, next) {
  if (!err) return next();
  console.error(`[facilities] multer error ${req.method} ${req.originalUrl}:`, err.message || err.code);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ message: 'Each image must be 8 MB or smaller.' });
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({ message: `You can upload up to ${FACILITY_IMAGE_MAX_COUNT} images at a time.` });
  }
  return res.status(400).json({ message: err.message || 'Image upload failed.' });
}
