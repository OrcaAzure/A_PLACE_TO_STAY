import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import {
  parseFacilityPreviewImages,
  sanitizeFacilityImageFilename,
  processFacilityImageUpload,
  FACILITY_IMAGE_MAX_COUNT,
} from '../../src/services/facilityImage.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_FACILITY_ID = 'qa-facility-unit';

describe('facilityImage.service', () => {
  it('parseFacilityPreviewImages accepts arrays and JSON strings', () => {
    const paths = ['/images/facilities/1/a.webp', '/images/facilities/1/b.webp'];
    assert.deepEqual(parseFacilityPreviewImages(paths), paths);
    assert.deepEqual(parseFacilityPreviewImages(JSON.stringify(paths)), paths);
    assert.deepEqual(parseFacilityPreviewImages(null), []);
    assert.deepEqual(parseFacilityPreviewImages(['/images/rooms/1/a.webp']), []);
  });

  it('sanitizeFacilityImageFilename blocks path traversal', () => {
    assert.equal(sanitizeFacilityImageFilename('photo.webp'), 'photo.webp');
    assert.equal(sanitizeFacilityImageFilename('../secret.webp'), null);
  });

  it('allows up to six images per facility', () => {
    assert.equal(FACILITY_IMAGE_MAX_COUNT, 6);
  });

  it('processFacilityImageUpload converts PNG buffer to WebP on disk', async () => {
    const buffer = await sharp({
      create: { width: 200, height: 120, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .png()
      .toBuffer();

    const publicPath = await processFacilityImageUpload(
      { buffer, mimetype: 'image/png', size: buffer.length },
      TEST_FACILITY_ID,
    );

    assert.match(publicPath, /^\/images\/facilities\/qa-facility-unit\/.+\.webp$/);
    const diskPath = path.join(__dirname, '../../../public', publicPath.replace(/^\//, ''));
    const bytes = await fs.readFile(diskPath);
    assert.ok(bytes.length > 12);
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    await new Promise((r) => setTimeout(r, 50));
    await fs.rm(path.join(__dirname, '../../../public/images/facilities', TEST_FACILITY_ID), { recursive: true, force: true });
  });
});
