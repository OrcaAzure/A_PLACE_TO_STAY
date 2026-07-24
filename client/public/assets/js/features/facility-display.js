/**
 * Shared visuals for room & venue cards (guest browse + admin facilities).
 *
 * HYBRID IMAGE SYSTEM (rooms)
 * ---------------------------
 * 1. Admin uploads (`preview_images` / runtime registry) = SOURCE OF TRUTH
 * 2. Hardcoded ROOM_NUMBER_* maps = FALLBACK placeholders during migration
 * 3. Room-type Unsplash galleries = last-resort so every room still shows something
 *
 * Prefer getImagesByRoom() / roomPreviewImage() — never read the fallback maps
 * directly in UI. Once every room has DB uploads, the fallback maps can be removed.
 * The maps below are module-private on purpose so all reads go through the
 * resolver functions.
 */

import { resolveRoomVisualKey } from '/assets/js/features/room-types.js';

/** FALLBACK ONLY — room-type placeholder photos when a room has no uploads or number-keyed stills. */
const ROOM_TYPE_IMAGE = {
  'Dorm': 'https://images.unsplash.com/photo-1555854877-bab0e5b6b4f5?auto=format&fit=crop&w=1200&q=80',
  'Superior Guest Room': 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&w=1200&q=80',
  'Standard Apartment': 'https://images.unsplash.com/photo-1566665797739-1674de7a421a?auto=format&fit=crop&w=1200&q=80',
  VIP: 'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=1200&q=80',
  'Deluxe Apartment': 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80',
  'Deluxe 2 BR': 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80',
  'Deluxe 3 BR': 'https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&w=1200&q=80',
};

/**
 * FALLBACK ONLY — primary campus stills keyed by room number.
 * Values are always string[] so galleries can map over them.
 * Ignored when admin uploads exist for that room.
 * TODO(migration): remove once every room has preview_images in the DB.
 */
const ROOM_NUMBER_IMAGE = {
  '202': ['/images/DormPreview.webp'],
  '204': ['/images/DormPreview.webp'],
  '206': ['/images/DormPreview.webp'],
  '207': ['/images/DormPreview.webp'],
  '208': ['/images/DormPreview.webp'],
  '209': ['/images/DormPreview.webp'],
  '301': ['/images/301Preview.webp'],
  '305': ['/images/DormPreview.webp'],
  '306': ['/images/DormPreview.webp'],
  '308': ['/images/DormPreview.webp'],
  '401': ['/images/401Preview.webp'],
  '404': ['/images/404Preview.webp'],
  '410': ['/images/410Preview.webp'],
  '411': ['/images/411Preview.webp'],
  '413': ['/images/413Preview.webp'],
  '416': ['/images/416Preview.webp'],
  'A-501': ['/images/501Preview.webp'],
};

/**
 * Runtime galleries from DB/API uploads — keyed like:
 *   UPLOADED_ROOM_GALLERY['202'] = ['/images/rooms/12/a.webp', ...]
 * Populated by registerRoomUploadedImages() after fetch/upload.
 */
const UPLOADED_ROOM_GALLERY = Object.create(null);
const UPLOADED_ROOM_GALLERY_BY_ID = Object.create(null);
const UPLOADED_VENUE_GALLERY = Object.create(null);
const UPLOADED_VENUE_GALLERY_BY_ID = Object.create(null);

/** Rooms that already logged a fallback warning this page load (avoid spam). */
const FALLBACK_WARNED_ROOMS = new Set();

function asImageList(value) {
  if (typeof value === 'string' && value.trim()) {
    const clean = value.trim();
    return clean.startsWith('/images/') || /^https?:\/\//i.test(clean) ? [clean] : [];
  }
  if (!Array.isArray(value)) return [];
  return value.filter((v) => typeof v === 'string' && (v.startsWith('/images/') || /^https?:\/\//i.test(v)));
}

function normalizeRoomNumber(value) {
  return String(value ?? '').trim().replace(/^room\s+/i, '');
}

/** Register admin-uploaded room photos under room number + numeric id keys. */
export function registerRoomUploadedImages(room = {}) {
  const imgs = asImageList(room.preview_images || room.previewImages);
  const num = normalizeRoomNumber(room.roomNumber ?? room.room_number);
  const id = room.id != null ? String(room.id) : null;
  if (id) {
    if (imgs.length) UPLOADED_ROOM_GALLERY_BY_ID[id] = imgs;
    else delete UPLOADED_ROOM_GALLERY_BY_ID[id];
  }
  if (num) {
    if (imgs.length) UPLOADED_ROOM_GALLERY[num] = imgs;
    else delete UPLOADED_ROOM_GALLERY[num];
  }
  return imgs;
}

export function registerRoomsUploadedImages(rooms = []) {
  for (const room of rooms) registerRoomUploadedImages(room);
}

/** Register admin-uploaded venue photos under name/code key + facility id. */
export function registerVenueUploadedImages(venue = {}) {
  const imgs = asImageList(venue.preview_images || venue.previewImages);
  const id = venue.facility_id ?? venue.facilityId ?? venue.id;
  const key = [
    venue.facility_group || venue.category || '',
    venue.name || venue.label || '',
    venue.room_code || venue.roomCode || '',
  ].join('\x1f');
  if (id != null) {
    const sid = String(id);
    if (imgs.length) UPLOADED_VENUE_GALLERY_BY_ID[sid] = imgs;
    else delete UPLOADED_VENUE_GALLERY_BY_ID[sid];
  }
  if (key && key !== '\x1f\x1f') {
    if (imgs.length) UPLOADED_VENUE_GALLERY[key] = imgs;
    else delete UPLOADED_VENUE_GALLERY[key];
  }
  const name = normalizeVenueKey(venue.name || venue.label);
  const code = normalizeVenueKey(venue.room_code ?? venue.roomCode);
  if (name) {
    if (imgs.length) UPLOADED_VENUE_GALLERY[name] = imgs;
    else delete UPLOADED_VENUE_GALLERY[name];
  }
  if (code) {
    if (imgs.length) UPLOADED_VENUE_GALLERY[code] = imgs;
    else delete UPLOADED_VENUE_GALLERY[code];
  }
  return imgs;
}

export function registerVenuesUploadedImages(venues = []) {
  for (const venue of venues) registerVenueUploadedImages(venue);
}

function uploadedRoomImagesFor(room = {}) {
  const fromEntity = asImageList(room.preview_images || room.previewImages);
  if (fromEntity.length) return fromEntity;
  const id = room.id != null ? String(room.id) : null;
  if (id && UPLOADED_ROOM_GALLERY_BY_ID[id]?.length) return UPLOADED_ROOM_GALLERY_BY_ID[id];
  const num = normalizeRoomNumber(room.roomNumber ?? room.room_number);
  if (num && UPLOADED_ROOM_GALLERY[num]?.length) return UPLOADED_ROOM_GALLERY[num];
  return [];
}

function uploadedVenueImagesFor(venue = {}) {
  const fromEntity = asImageList(venue.preview_images || venue.previewImages);
  if (fromEntity.length) return fromEntity;
  const id = venue.facility_id ?? venue.facilityId ?? venue.id;
  if (id != null && UPLOADED_VENUE_GALLERY_BY_ID[String(id)]?.length) {
    return UPLOADED_VENUE_GALLERY_BY_ID[String(id)];
  }
  const key = [
    venue.facility_group || venue.category || '',
    venue.name || venue.label || '',
    venue.room_code || venue.roomCode || '',
  ].join('\x1f');
  if (UPLOADED_VENUE_GALLERY[key]?.length) return UPLOADED_VENUE_GALLERY[key];
  const code = normalizeVenueKey(venue.room_code ?? venue.roomCode);
  if (code && UPLOADED_VENUE_GALLERY[code]?.length) return UPLOADED_VENUE_GALLERY[code];
  const name = normalizeVenueKey(venue.name || venue.label);
  if (name && UPLOADED_VENUE_GALLERY[name]?.length) return UPLOADED_VENUE_GALLERY[name];
  return [];
}

const DEFAULT_ROOM_IMAGE =
  'https://images.unsplash.com/photo-1631049552057-403cdb8f0658?auto=format&fit=crop&w=1200&q=80';

/** Local / stock placeholders — FALLBACK until real venue photos are uploaded. */
export const VENUE_CATEGORY_IMAGE = {
  'GMC Chapel': '/images/GMCChapelPreview.webp',
  'Burdine Commons': 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80',
  'GMC Conference Rooms': '/images/A-101Preview.webp',
  GMC: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80',
  'Prayer Mountain': '/images/PrayerMountainPreview.webp',
  'Prayer Tower / Baptismal Pool': '/images/PrayerTowerPreview.webp',
  Garden: '/images/GardenPreview.webp',
  Recreation: '/images/RecreationPreview.webp',
  'Basketball Court': '/images/BasketballCourtPreview.webp',
  'Childrens Playground': '/images/RecreationPreview.webp',
  'Recreational Center': '/images/RecreationPreview.webp',
};

/** Canonical amenity previews for guest dashboard / landing (same paths as venue details). */
export const LANDING_AMENITY_IMAGE = {
  garden: VENUE_CATEGORY_IMAGE.Garden,
  prayerMountain: VENUE_CATEGORY_IMAGE['Prayer Mountain'],
  prayerTower: VENUE_CATEGORY_IMAGE['Prayer Tower / Baptismal Pool'],
  recreation: VENUE_CATEGORY_IMAGE.Recreation,
  chapel: VENUE_CATEGORY_IMAGE['GMC Chapel'],
  conference: VENUE_CATEGORY_IMAGE['GMC Conference Rooms'],
  basketballCourt: VENUE_CATEGORY_IMAGE['Basketball Court'],
};

/**
 * Exact venue name / room code / package overrides.
 * FALLBACK ONLY — ignored when admin venue uploads exist.
 * TODO(migration): remove once venues have preview_images coverage.
 */
const VENUE_NAME_IMAGE = {
  'GMC Chapel': '/images/GMCChapelPreview.webp',
  'Burdine Commons': 'https://images.unsplash.com/photo-1517502884422-41eaead166d4?auto=format&fit=crop&w=1200&q=80',
  'Prayer Mountain': '/images/PrayerMountainPreview.webp',
  'Prayer Tower / Baptismal Pool': '/images/PrayerTowerPreview.webp',
  Garden: '/images/GardenPreview.webp',
  'Osgood Hall': '/images/GardenPreview.webp',
  'Osgood Garden': '/images/GardenPreview.webp',
  'Basketball Court': '/images/BasketballCourtPreview.webp',
  'Childrens Playground': '/images/RecreationPreview.webp',
  'Recreational Center': '/images/RecreationPreview.webp',
  'A-101': '/images/A-101Preview.webp',
  'A-504': '/images/A-504Preview.webp',
  'A-505': '/images/A-505Preview.webp',
  'A-506': '/images/A-101Preview.webp',
  'A-507': '/images/A-101Preview.webp',
};

const DEFAULT_VENUE_IMAGE =
  'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=80';

const GALLERY_MAX_ROOM = 5;
const GALLERY_MAX_VENUE = 12;

function inferVenueCategory(blob) {
  const text = String(blob || '').toLowerCase();
  if (/chapel|church|wedding|baptism/.test(text)) return 'GMC Chapel';
  if (/prayer mountain|retreat|hut/.test(text)) return 'Prayer Mountain';
  if (/prayer tower|baptismal pool/.test(text)) return 'Prayer Tower / Baptismal Pool';
  if (/garden|osgood/.test(text)) return 'Garden';
  if (/basketball/.test(text)) return 'Basketball Court';
  if (/playground|recreation|sport|court|gym/.test(text)) return 'Recreation';
  if (/conference|classroom|commons|meeting|a-\d{3}/.test(text)) return 'GMC Conference Rooms';
  return '';
}

/** @type {Record<string, { label: string, badge: string }>} */
const AVAIL_BADGES = {
  available: { label: 'Available', badge: 'fac-badge--available' },
  booked: { label: 'Booked', badge: 'fac-badge--booked' },
  occupied: { label: 'Occupied', badge: 'fac-badge--booked' },
  dirty: { label: 'Being cleaned', badge: 'fac-badge--dirty' },
  maintenance: { label: 'Out of order', badge: 'fac-badge--blocked' },
  too_small: { label: 'Too small', badge: 'fac-badge--blocked' },
  dorm_min_guests: { label: 'Below minimum', badge: 'fac-badge--blocked' },
};

/** @type {Record<string, { label: string, badge: string }>} */
const LIVE_BADGES = {
  Available: { label: 'Vacant', badge: 'fac-badge--available' },
  Occupied: { label: 'Occupied', badge: 'fac-badge--booked' },
  Dirty: { label: 'Being cleaned', badge: 'fac-badge--dirty' },
  Maintenance: { label: 'Out of order', badge: 'fac-badge--blocked' },
};

function roomTypeImage(roomType) {
  return ROOM_TYPE_IMAGE[roomType] || DEFAULT_ROOM_IMAGE;
}

function warnRoomFallbackOnce(roomNumber, source) {
  const key = roomNumber || '(unknown)';
  if (FALLBACK_WARNED_ROOMS.has(key)) return;
  FALLBACK_WARNED_ROOMS.add(key);
  console.info(
    `[facility-display] room ${key} still using fallback images (${source}) — upload real photos to replace`,
  );
}

/**
 * Hardcoded room stills for migration — multi-shot galleries preferred over single primary.
 * Always returns a string[] (never null).
 */
function getHardcodedRoomFallback(roomNumber) {
  const num = normalizeRoomNumber(roomNumber);
  if (!num) return [];
  if (ROOM_NUMBER_GALLERY[num]?.length) return asImageList(ROOM_NUMBER_GALLERY[num]);
  if (ROOM_NUMBER_IMAGE[num]?.length) return asImageList(ROOM_NUMBER_IMAGE[num]);
  return [];
}

/**
 * Unified hybrid resolver for room photos.
 *
 * @param {string|object} roomOrNumber - Room number ('202') or a room-like object
 *   with room_number / roomNumber / id / preview_images.
 * @returns {string[]} Always an array (uploaded → hardcoded → type placeholder).
 *
 * Uploaded images are the source of truth. Hardcoded maps are temporary fallbacks.
 */
export function getImagesByRoom(roomOrNumber = {}) {
  const room = (typeof roomOrNumber === 'object' && roomOrNumber !== null)
    ? roomOrNumber
    : { room_number: roomOrNumber, roomNumber: roomOrNumber };

  const num = normalizeRoomNumber(room.roomNumber ?? room.room_number ?? (
    typeof roomOrNumber === 'string' || typeof roomOrNumber === 'number' ? roomOrNumber : ''
  ));

  // 1) Admin uploads (entity fields or runtime registry keyed by id / room number)
  const uploaded = uploadedRoomImagesFor({
    ...room,
    room_number: room.room_number ?? num,
    roomNumber: room.roomNumber ?? num,
  });
  if (uploaded.length) {
    return uniqueUrls(uploaded).slice(0, GALLERY_MAX_ROOM);
  }

  // 2) Hardcoded campus placeholders (migration fallback)
  const hardcoded = getHardcodedRoomFallback(num);
  if (hardcoded.length) {
    warnRoomFallbackOnce(num, 'ROOM_NUMBER_* map');
    return uniqueUrls(hardcoded).slice(0, GALLERY_MAX_ROOM);
  }

  // 3) Type-level placeholder so the UI never renders an empty gallery
  const tier = resolveRoomVisualKey({
    room_type: room.room_type ?? room.roomType,
    room_type_label: room.room_type_label ?? room.roomTypeLabel,
    bed_count: room.bed_count ?? room.bedCount,
    room_number: num,
  });
  const primary = roomTypeImage(tier);
  const extras = ROOM_TYPE_GALLERY[tier] || [primary];
  warnRoomFallbackOnce(num || `type:${tier}`, 'room-type placeholder');
  return uniqueUrls([primary, ...extras, DEFAULT_ROOM_IMAGE]).slice(0, GALLERY_MAX_ROOM);
}

/** Card / hero thumbnail — first image from getImagesByRoom(). */
export function roomPreviewImage(room = {}) {
  const images = getImagesByRoom(room);
  return images[0] || DEFAULT_ROOM_IMAGE;
}

/** Extra gallery shots per room type when no admin uploads / room-number fallback exist. */
const ROOM_TYPE_GALLERY = {
  'Dorm': [
    'https://images.unsplash.com/photo-1555854877-bab0e5b6b4f5?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&w=1400&q=80',
  ],
  'Superior Guest Room': [
    'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1618773928121-c32242e63f39?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1400&q=80',
  ],
  'Standard Apartment': [
    'https://images.unsplash.com/photo-1566665797739-1674de7a421a?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1400&q=80',
  ],
  VIP: [
    'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1400&q=80',
  ],
  'Deluxe Apartment': [
    'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1560185127-6ed189bf02f4?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=1400&q=80',
  ],
  'Deluxe 2 BR': [
    'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1560185127-6ed189bf02f4?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=1400&q=80',
  ],
  'Deluxe 3 BR': [
    'https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1560448204-603b3fc33ddc?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=1400&q=80',
  ],
};

/**
 * FALLBACK ONLY — multi-photo campus galleries keyed by room number.
 * Preferred over ROOM_NUMBER_IMAGE when both exist for the same room.
 * Ignored when admin uploads exist.
 * TODO(migration): remove once every room has preview_images in the DB.
 */
const ROOM_NUMBER_GALLERY = {
  '202': [
    '/images/DormPreview.webp',
    '/images/DormPreview2.webp',
  ],
  '204': [
    '/images/DormPreview.webp',
    '/images/DormPreview2.webp',
  ],
  '206': [
    '/images/DormPreview.webp',
    '/images/DormPreview2.webp',
  ],
  '207': [
    '/images/DormPreview.webp',
    '/images/DormPreview2.webp',
  ],
  '208': [
    '/images/DormPreview.webp',
    '/images/DormPreview2.webp',
  ],
  '209': [
    '/images/DormPreview.webp',
    '/images/DormPreview2.webp',
  ],
  '301': [
    '/images/301Preview.webp',
    '/images/301Preview2.webp',
  ],
  '305': [
    '/images/DormPreview.webp',
    '/images/DormPreview2.webp',
  ],
  '306': [
    '/images/DormPreview.webp',
    '/images/DormPreview2.webp',
  ],
  '307': [
    '/images/DormPreview.webp',
    '/images/DormPreview2.webp',
  ],
  '308': [
    '/images/DormPreview.webp',
    '/images/DormPreview2.webp',
  ],
  '309': [
    '/images/DormPreview.webp',
    '/images/DormPreview2.webp',
  ],
  '310': [
    '/images/DormPreview.webp',
    '/images/DormPreview2.webp',
  ],
  '401': [
    '/images/401Preview.webp',
    '/images/401Preview2.webp',
    '/images/401Preview3.webp',
    '/images/401Preview4.webp',
    '/images/401Preview5.webp',
  ],
  '404': [
    '/images/404Preview.webp',
    '/images/404Preview2.webp',
    '/images/404Preview3.webp',
    '/images/404Preview4.webp',
    '/images/404Preview5.webp',
    '/images/404Preview6.webp',
  ],
  '410': [
    '/images/410Preview.webp',
    '/images/410Preview2.webp',
    '/images/410Preview3.webp',
    '/images/410Preview4.webp',
  ],
  '411': [
    '/images/411Preview.webp',
    '/images/411Preview2.webp',
    '/images/411Preview3.webp',
  ],
  '413': [
    '/images/413Preview.webp',
    '/images/413Preview2.webp',
    '/images/413Preview3.webp',
    '/images/413Preview4.webp',
  ],
  '416': [
    '/images/416Preview.webp',
    '/images/416Preview2.webp',
    '/images/416Preview3.webp',
    '/images/416Preview4.webp',
    '/images/416Preview5.webp',
  ],
  'A-501': [
    '/images/501Preview.webp',
    '/images/501Preview2.webp',
    '/images/501Preview3.webp',
    '/images/501Preview4.webp',
    '/images/501Preview5.webp',
    '/images/501Preview6.webp',
  ],
};

/** Optional multi-photo overrides keyed by venue name / room code. */
const VENUE_NAME_GALLERY = {
  'GMC Chapel': [
    '/images/GMCChapelPreview.webp',
    '/images/GMCChapelPreview2.webp',
    '/images/GMCChapelPreview3.webp',
  ],
  'Basketball Court': [
    '/images/BasketballCourtPreview.webp',
    '/images/BasketballCourtPreview2.webp',
    '/images/BasketballCourtPreview3.webp',
  ],
  'A-101': [
    '/images/A-101Preview.webp',
    '/images/A-101Preview2.webp',
    '/images/A-101Preview3.webp',
  ],
  'A-504': [
    '/images/A-504Preview.webp',
    '/images/A-504Preview2.webp',
    '/images/A-504Preview3.webp',
  ],
  'A-505': [
    '/images/A-505Preview.webp',
    '/images/A-505Preview2.webp',
    '/images/A-505Preview3.webp',
  ],
};

const VENUE_CATEGORY_GALLERY = {
  'GMC Chapel': [
    '/images/GMCChapelPreview.webp',
    '/images/GMCChapelPreview2.webp',
    '/images/GMCChapelPreview3.webp',
  ],
  'Burdine Commons': [
    'https://images.unsplash.com/photo-1517502884422-41eaead166d4?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1400&q=80',
  ],
  'GMC Conference Rooms': [
    '/images/A-101Preview.webp',
    '/images/A-101Preview2.webp',
    '/images/A-504Preview.webp',
    '/images/A-505Preview.webp',
    '/images/A-101Preview3.webp',
  ],
  'Prayer Mountain': [
    '/images/PrayerMountainPreview.webp',
    '/images/PrayerMountainPreview2.webp',
    '/images/PrayerMountainPreview3.webp',
    '/images/HutPreview.webp',
  ],
  'Prayer Tower / Baptismal Pool': [
    '/images/PrayerTowerPreview.webp',
    '/images/PrayerTowerPreview2.webp',
    '/images/PrayerTowerPreview3.webp',
  ],
  'Prayer Tower': [
    '/images/PrayerTowerPreview.webp',
    '/images/PrayerTowerPreview2.webp',
    '/images/PrayerTowerPreview3.webp',
  ],
  Garden: [
    '/images/GardenPreview.webp',
    '/images/GardenPreview2.webp',
    '/images/GardenPreview3.webp',
    '/images/GardenPreview4.webp',
  ],
  'Basketball Court': [
    '/images/BasketballCourtPreview.webp',
    '/images/BasketballCourtPreview2.webp',
    '/images/BasketballCourtPreview3.webp',
  ],
  Recreation: [
    '/images/BasketballCourtPreview.webp',
    '/images/RecreationPreview.webp',
    '/images/RecreationPreview2.webp',
    '/images/RecreationPreview3.webp',
    '/images/RecreationPreview4.webp',
    '/images/RecreationPreview5.webp',
    '/images/RecreationPreview6.webp',
    '/images/RecreationPreview8.webp',
    '/images/RecreationPreview9.webp',
    '/images/RecreationPreview10.webp',
    '/images/RecreationPreview11.webp',
    '/images/RecreationPreview12.webp',
  ],
};

function uniqueUrls(urls = []) {
  const seen = new Set();
  const out = [];
  for (const url of urls) {
    const clean = String(url || '').trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}

/**
 * Gallery list for a venue card/detail modal.
 * Uses venue-specific photos first, then category gallery placeholders.
 */
export function venueGalleryImages(venue = {}) {
  // Prefer admin-uploaded paths (DB / runtime registry) over static placeholder maps.
  const uploaded = uploadedVenueImagesFor(venue);
  if (uploaded.length) {
    return uniqueUrls(uploaded).slice(0, GALLERY_MAX_VENUE);
  }

  const code = normalizeVenueKey(venue.room_code ?? venue.roomCode);
  const candidates = [venue.name, venue.label, venue.item, venue.facility_group, venue.category]
    .map(normalizeVenueKey)
    .filter(Boolean);

  if (code && VENUE_NAME_GALLERY[code]?.length) {
    return uniqueUrls(VENUE_NAME_GALLERY[code]).slice(0, GALLERY_MAX_VENUE);
  }
  for (const key of candidates) {
    if (VENUE_NAME_GALLERY[key]?.length) {
      return uniqueUrls(VENUE_NAME_GALLERY[key]).slice(0, GALLERY_MAX_VENUE);
    }
  }

  let categoryKey = '';
  for (const key of candidates) {
    if (VENUE_CATEGORY_GALLERY[key] || VENUE_CATEGORY_IMAGE[key]) {
      categoryKey = key;
      break;
    }
  }
  if (!categoryKey) {
    categoryKey = inferVenueCategory(candidates.join(' '));
  }

  const categoryGallery = VENUE_CATEGORY_GALLERY[categoryKey];
  if (categoryGallery?.length) {
    return uniqueUrls(categoryGallery).slice(0, GALLERY_MAX_VENUE);
  }

  const primary = venuePreviewImage(venue);
  const extras = [
    code && VENUE_NAME_IMAGE[code],
    VENUE_CATEGORY_IMAGE[categoryKey],
    DEFAULT_VENUE_IMAGE,
  ].filter(Boolean);

  return uniqueUrls([primary, ...extras]).slice(0, GALLERY_MAX_VENUE);
}

function normalizeVenueKey(value) {
  return String(value ?? '').trim();
}

/**
 * Resolve a venue photo.
 * Priority: admin uploads → room_code → exact name/item/label → facility_group/category → default.
 */
export function formatVenueDisplayName(name) {
  const n = String(name || '').trim();
  if (n === 'Prayer Tower') return 'Prayer Tower / Baptismal Pool';
  return n;
}

export function venuePreviewImage(venue = {}) {
  const uploaded = uploadedVenueImagesFor(venue);
  if (uploaded.length) return uploaded[0];

  const {
    name, label, item, category, facility_group, room_code, roomCode,
  } = venue;
  const code = normalizeVenueKey(room_code ?? roomCode);
  if (code && VENUE_NAME_IMAGE[code]) return VENUE_NAME_IMAGE[code];

  const candidates = [name, label, item, facility_group, category]
    .map(normalizeVenueKey)
    .filter(Boolean);

  for (const key of candidates) {
    if (VENUE_NAME_IMAGE[key]) return VENUE_NAME_IMAGE[key];
  }

  for (const key of candidates) {
    if (VENUE_CATEGORY_IMAGE[key]) return VENUE_CATEGORY_IMAGE[key];
  }

  const blob = candidates.join(' ');
  const categoryKey = inferVenueCategory(blob);
  if (categoryKey && VENUE_CATEGORY_IMAGE[categoryKey]) {
    return VENUE_CATEGORY_IMAGE[categoryKey];
  }

  return DEFAULT_VENUE_IMAGE;
}

export function availabilityBadge(status) {
  return AVAIL_BADGES[status] || AVAIL_BADGES.booked;
}

export function liveStatusBadge(status) {
  return LIVE_BADGES[status] || LIVE_BADGES.Occupied;
}

/** Guest-facing amenity chips by room type — fallback only when DB inclusions are empty. */
const ROOM_TYPE_HIGHLIGHTS = {
  Dorm: [
    { icon: 'bed', label: 'Shared bunk beds' },
    { icon: 'bathroom', label: 'Shared bath' },
    { icon: 'groups', label: 'Ideal for teams' },
    { icon: 'wifi', label: 'Wi‑Fi' },
  ],
  'Superior Guest Room': [
    { icon: 'king_bed', label: 'Private room' },
    { icon: 'bathroom', label: 'Private bath' },
    { icon: 'ac_unit', label: 'Air-conditioned' },
    { icon: 'wifi', label: 'Wi‑Fi' },
  ],
  'Standard Apartment': [
    { icon: 'apartment', label: 'Apartment stay' },
    { icon: 'kitchen', label: 'Kitchenette' },
    { icon: 'bathroom', label: 'Private bath' },
    { icon: 'wifi', label: 'Wi‑Fi' },
  ],
  VIP: [
    { icon: 'workspace_premium', label: 'VIP suite' },
    { icon: 'king_bed', label: 'Premium bedding' },
    { icon: 'living', label: 'Sitting area' },
    { icon: 'wifi', label: 'Wi‑Fi' },
  ],
  'Deluxe Apartment': [
    { icon: 'holiday_village', label: 'Multi-room apt' },
    { icon: 'kitchen', label: 'Full kitchen' },
    { icon: 'living', label: 'Living area' },
    { icon: 'wifi', label: 'Wi‑Fi' },
  ],
  'Deluxe 2 BR': [
    { icon: 'holiday_village', label: '2 bedrooms' },
    { icon: 'kitchen', label: 'Full kitchen' },
    { icon: 'living', label: 'Living area' },
    { icon: 'wifi', label: 'Wi‑Fi' },
  ],
  'Deluxe 3 BR': [
    { icon: 'holiday_village', label: '3 bedrooms' },
    { icon: 'kitchen', label: 'Full kitchen' },
    { icon: 'living', label: 'Living area' },
    { icon: 'wifi', label: 'Wi‑Fi' },
  ],
};

/** Parse admin-entered inclusions / amenities (one per line, or comma / semicolon separated). */
export function parseHighlightLines(text) {
  return String(text || '')
    .split(/\n+|;\s*/)
    .flatMap((chunk) => chunk.includes(',') && !/\d,\d/.test(chunk)
      ? chunk.split(/,\s*/).map((s) => s.trim())
      : [chunk.trim()])
    .map((s) => s.trim())
    .filter(Boolean);
}

function roomInclusionsText(room = {}) {
  return room.inclusions || room.highlights || '';
}

/**
 * Guest chips for a room. Prefers DB `inclusions` (legacy: highlights);
 * falls back to type defaults only when empty.
 */
export function roomTypeHighlights(room = {}) {
  const fromDb = parseHighlightLines(roomInclusionsText(room));
  if (fromDb.length) {
    return fromDb.map((label) => ({ icon: 'check_circle', label }));
  }

  const tier = resolveRoomVisualKey({
    room_type: room.room_type ?? room.roomType,
    room_type_label: room.room_type_label,
    bed_count: room.bed_count,
    room_number: room.roomNumber ?? room.room_number,
  });
  return ROOM_TYPE_HIGHLIGHTS[tier] || [
    { icon: 'meeting_room', label: 'Campus lodging' },
    { icon: 'wifi', label: 'Wi‑Fi' },
  ];
}
