/**
 * Room photo upload API: JPG/PNG → WebP, RBAC, limits.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { api, isDbAvailable, loginAs } from '../helpers/http.mjs';
import { pool } from '../../src/config/db.js';

const dbReady = await isDbAvailable();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '../../../public');

async function makePngBuffer() {
  return sharp({
    create: { width: 120, height: 80, channels: 3, background: { r: 40, g: 120, b: 200 } },
  })
    .png()
    .toBuffer();
}

async function makeJpegBuffer() {
  return sharp({
    create: { width: 100, height: 60, channels: 3, background: { r: 200, g: 80, b: 40 } },
  })
    .jpeg()
    .toBuffer();
}

describe('API room images', { skip: dbReady ? false : 'MySQL not available' }, () => {
  let admin;
  let viewer;
  let roomId;
  let uploadedPaths = [];

  before(async () => {
    admin = api();
    viewer = api();
    await loginAs(admin, 'admin@aptspace.com');
    await loginAs(viewer, 'viewer@aptspace.com');

    const buildings = await admin.get('/api/rooms/buildings/list');
    assert.equal(buildings.status, 200);
    const buildingId = buildings.body.buildings?.[0]?.id;
    assert.ok(buildingId, 'need at least one building');

    const createRes = await admin.post('/api/rooms').send({
      building_id: buildingId,
      room_number: `QA-IMG-${Date.now()}`,
      room_type: 'Superior Guest Room',
      capacity_min: 1,
      capacity_max: 2,
      status: 'Available',
    });
    assert.equal(createRes.status, 201, createRes.body?.message);
    roomId = createRes.body.room.id;
  });

  after(async () => {
    if (!roomId) return;
    await admin.delete(`/api/rooms/${roomId}`).catch(() => {});
    for (const publicPath of uploadedPaths) {
      const rel = publicPath.replace(/^\//, '');
      await fs.unlink(path.join(PUBLIC_DIR, rel)).catch(() => {});
    }
    await fs.rm(path.join(PUBLIC_DIR, 'images', 'rooms', String(roomId)), { recursive: true, force: true }).catch(() => {});
  });

  it('POST /api/rooms/:id/images converts PNG to WebP', async () => {
    const png = await makePngBuffer();
    const res = await admin
      .post(`/api/rooms/${roomId}/images`)
      .attach('images', png, { filename: 'test.png', contentType: 'image/png' });

    assert.equal(res.status, 200, res.body?.message);
    assert.ok(Array.isArray(res.body.preview_images));
    assert.equal(res.body.preview_images.length, 1);
    assert.match(res.body.preview_images[0], /^\/images\/rooms\/\d+\/.+\.webp$/);
    assert.ok(res.body.room?.preview_images?.length === 1);

    uploadedPaths.push(res.body.preview_images[0]);
    const diskPath = path.join(PUBLIC_DIR, res.body.preview_images[0].replace(/^\//, ''));
    const meta = await sharp(await fs.readFile(diskPath)).metadata();
    assert.equal(meta.format, 'webp');
  });

  it('POST /api/rooms/:id/images accepts JPEG', async () => {
    const jpeg = await makeJpegBuffer();
    const res = await admin
      .post(`/api/rooms/${roomId}/images`)
      .attach('images', jpeg, { filename: 'test.jpg', contentType: 'image/jpeg' });

    assert.equal(res.status, 200, res.body?.message);
    assert.equal(res.body.preview_images.length, 2);
    uploadedPaths.push(res.body.preview_images[1]);
  });

  it('GET /api/rooms returns preview_images for guests with access', async () => {
    const res = await admin.get('/api/rooms');
    assert.equal(res.status, 200);
    const room = res.body.rooms.find((r) => r.id === roomId);
    assert.ok(room);
    assert.equal(room.preview_images.length, 2);
  });

  it('serves uploaded WebP at public path', async () => {
    // Serve the second image so Windows does not hold open the file that the
    // next test deletes in the same process.
    const publicPath = uploadedPaths[1];
    const res = await admin.get(publicPath);
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'] || '', /image\/webp/i);
  });

  it('DELETE /api/rooms/:id/images/:filename removes one photo', async () => {
    const filename = uploadedPaths[0].split('/').pop();
    const res = await admin.delete(`/api/rooms/${roomId}/images/${filename}`);
    assert.equal(res.status, 200, res.body?.message);
    assert.equal(res.body.preview_images.length, 1);
    uploadedPaths = uploadedPaths.slice(1);
  });

  it('POST /api/rooms/:id/images rejects non-image MIME', async () => {
    const res = await admin
      .post(`/api/rooms/${roomId}/images`)
      .attach('images', Buffer.from('not an image'), { filename: 'bad.txt', contentType: 'text/plain' });
    assert.equal(res.status, 400);
  });

  it('POST /api/rooms/:id/images returns 403 for View-Only Admin', async () => {
    const png = await makePngBuffer();
    const res = await viewer
      .post(`/api/rooms/${roomId}/images`)
      .attach('images', png, { filename: 'blocked.png', contentType: 'image/png' });
    assert.equal(res.status, 403);
    assert.match(res.body.message, /Forbidden/i);
  });

  it('DELETE /api/rooms/:id/images/:filename returns 403 for View-Only Admin', async () => {
    const filename = uploadedPaths[0]?.split('/').pop();
    assert.ok(filename);
    const res = await viewer.delete(`/api/rooms/${roomId}/images/${filename}`);
    assert.equal(res.status, 403);
  });
});
