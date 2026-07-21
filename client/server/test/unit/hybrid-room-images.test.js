/**
 * Hybrid room image resolver — unit mirror of facility-display getImagesByRoom priority.
 * Keeps migration-safe: uploaded wins, hardcoded arrays are fallback.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const ROOM_NUMBER_IMAGE = {
  '202': ['/images/DormPreview.webp'],
  '301': ['/images/301Preview.webp'],
};

const ROOM_NUMBER_GALLERY = {
  '202': ['/images/DormPreview.webp', '/images/DormPreview2.webp'],
};

function asImageList(value) {
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) return [];
  return value.filter((v) => typeof v === 'string' && v.length);
}

function normalizeRoomNumber(value) {
  return String(value ?? '').trim().replace(/^room\s+/i, '');
}

function getHardcodedRoomFallback(roomNumber) {
  const num = normalizeRoomNumber(roomNumber);
  if (!num) return [];
  if (ROOM_NUMBER_GALLERY[num]?.length) return asImageList(ROOM_NUMBER_GALLERY[num]);
  if (ROOM_NUMBER_IMAGE[num]?.length) return asImageList(ROOM_NUMBER_IMAGE[num]);
  return [];
}

function resolveHybrid(roomOrNumber) {
  const room = typeof roomOrNumber === 'object' && roomOrNumber !== null
    ? roomOrNumber
    : { room_number: roomOrNumber };
  const uploaded = asImageList(room.preview_images);
  if (uploaded.length) return uploaded;
  const num = normalizeRoomNumber(room.room_number ?? room.roomNumber ?? roomOrNumber);
  const hardcoded = getHardcodedRoomFallback(num);
  if (hardcoded.length) return hardcoded;
  return ['/images/placeholder.webp'];
}

describe('hybrid getImagesByRoom priority', () => {
  it('normalizes hardcoded primaries to arrays', () => {
    assert.ok(Array.isArray(ROOM_NUMBER_IMAGE['202']));
    assert.equal(ROOM_NUMBER_IMAGE['202'][0], '/images/DormPreview.webp');
  });

  it('prefers uploaded preview_images over hardcoded maps', () => {
    const images = resolveHybrid({
      room_number: '202',
      preview_images: ['/images/rooms/9/real.webp'],
    });
    assert.deepEqual(images, ['/images/rooms/9/real.webp']);
  });

  it('falls back to ROOM_NUMBER_GALLERY when no uploads', () => {
    const images = resolveHybrid('202');
    assert.deepEqual(images, ['/images/DormPreview.webp', '/images/DormPreview2.webp']);
  });

  it('falls back to ROOM_NUMBER_IMAGE array when no gallery map', () => {
    const images = resolveHybrid('301');
    assert.deepEqual(images, ['/images/301Preview.webp']);
  });

  it('always returns an array', () => {
    assert.ok(Array.isArray(resolveHybrid('999-unknown')));
    assert.ok(resolveHybrid('999-unknown').length >= 1);
  });
});
