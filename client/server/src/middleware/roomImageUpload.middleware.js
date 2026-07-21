import multer from 'multer';
import { ROOM_IMAGE_MAX_BYTES, ROOM_IMAGE_MAX_COUNT } from '../services/roomImage.service.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: ROOM_IMAGE_MAX_BYTES,
    files: ROOM_IMAGE_MAX_COUNT,
  },
  fileFilter(req, file, cb) {
    const ok = ['image/jpeg', 'image/png', 'image/jpg'].includes(file.mimetype);
    cb(ok ? null : new Error('Only JPG and PNG images are allowed.'), ok);
  },
});

export const uploadRoomImages = upload.array('images', ROOM_IMAGE_MAX_COUNT);

/** Single-file field used by PUT replace. */
export const uploadRoomImageReplace = upload.single('image');

export function handleRoomImageUploadError(err, req, res, next) {
  if (!err) return next();
  console.error(`[rooms] multer error ${req.method} ${req.originalUrl}:`, err.message || err.code);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ message: 'Each image must be 8 MB or smaller.' });
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({ message: `You can upload up to ${ROOM_IMAGE_MAX_COUNT} images at a time.` });
  }
  return res.status(400).json({ message: err.message || 'Image upload failed.' });
}
