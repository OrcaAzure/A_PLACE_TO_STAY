import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import {
  parsePreviewImages,
  sanitizeRoomImageFilename,
  processRoomImageUpload,
  ROOM_IMAGE_MAX_COUNT,
} from '../../src/services/roomImage.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_ROOM_ID = 'qa-unit';

describe('roomImage.service', () => {
  it('parsePreviewImages accepts arrays and JSON strings', () => {
    const paths = ['/images/rooms/1/a.webp', '/images/rooms/1/b.webp'];
    assert.deepEqual(parsePreviewImages(paths), paths);
    assert.deepEqual(parsePreviewImages(JSON.stringify(paths)), paths);
    assert.deepEqual(parsePreviewImages(null), []);
    assert.deepEqual(parsePreviewImages('not-json'), []);
    assert.deepEqual(parsePreviewImages(['/evil/../x.webp']), []);
  });

  it('sanitizeRoomImageFilename blocks path traversal', () => {
    assert.equal(sanitizeRoomImageFilename('photo.webp'), 'photo.webp');
    assert.equal(sanitizeRoomImageFilename('../secret.webp'), null);
    assert.equal(sanitizeRoomImageFilename('photo.jpg'), null);
  });

  it('allows up to six images per room', () => {
    assert.equal(ROOM_IMAGE_MAX_COUNT, 6);
  });

  it('processRoomImageUpload converts PNG buffer to WebP on disk', async () => {
    const buffer = await sharp({
      create: { width: 200, height: 120, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .png()
      .toBuffer();

    const publicPath = await processRoomImageUpload(
      { buffer, mimetype: 'image/png', size: buffer.length },
      TEST_ROOM_ID,
    );

    assert.match(publicPath, /^\/images\/rooms\/qa-unit\/.+\.webp$/);
    const diskPath = path.join(__dirname, '../../../public', publicPath.replace(/^\//, ''));
    const bytes = await fs.readFile(diskPath);
    assert.ok(bytes.length > 12);
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
    await new Promise((r) => setTimeout(r, 50));
    await fs.rm(path.join(__dirname, '../../../public/images/rooms', TEST_ROOM_ID), { recursive: true, force: true });
  });
});
