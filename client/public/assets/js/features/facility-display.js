/**
 * Shared visuals for room & venue cards (guest browse + admin facilities).
 */

import { resolveRoomVisualKey } from '/assets/js/features/room-types.js';

export const ROOM_TYPE_ICON = {
  'Dorm': 'bed',
  'Superior Guest Room': 'king_bed',
  'Standard Apartment': 'apartment',
  VIP: 'workspace_premium',
  'Deluxe Apartment': 'holiday_village',
  'Deluxe 2 BR': 'holiday_village',
  'Deluxe 3 BR': 'holiday_village',
};

export const ROOM_TYPE_IMAGE = {
  'Dorm': 'https://images.unsplash.com/photo-1555854877-bab0e5b6b4f5?auto=format&fit=crop&w=1200&q=80',
  'Superior Guest Room': 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&w=1200&q=80',
  'Standard Apartment': 'https://images.unsplash.com/photo-1566665797739-1674de7a421a?auto=format&fit=crop&w=1200&q=80',
  VIP: 'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=1200&q=80',
  'Deluxe Apartment': 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80',
  'Deluxe 2 BR': 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80',
  'Deluxe 3 BR': 'https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&w=1200&q=80',
};

/** Room-specific photos override type placeholders when available. */
export const ROOM_NUMBER_IMAGE = {
  '204': '/images/204Preview.jpg',
  '207': '/images/207Preview.jpg',
  '301': '/images/301Preview.jpg',
  '401': '/images/401Preview.jpg',
  '404': '/images/404Preview.jpg',
  '410': '/images/410Preview.jpg',
  '411': '/images/411Preview.jpg',
  '413': '/images/413Preview.jpg',
  '416': '/images/416Preview.jpg',
  'A-501': '/images/501Preview.jpg',
};

const DEFAULT_ROOM_IMAGE =
  'https://images.unsplash.com/photo-1631049552057-403cdb8f0658?auto=format&fit=crop&w=1200&q=80';

/** Local / stock placeholders until real venue photos are uploaded. */
export const VENUE_CATEGORY_IMAGE = {
  'GMC Chapel': 'https://images.unsplash.com/photo-1438032455732-1033d28535fd?auto=format&fit=crop&w=1200&q=80',
  'Burdine Commons': 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80',
  'GMC Conference Rooms': 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80',
  GMC: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80',
  'Prayer Mountain': '/images/PrayerMountainPreview.jpg',
  'Prayer Tower': '/images/PrayerTowerPreview.jpg',
  Garden: '/images/GardenPreview.jpg',
  Recreation: '/images/RecreationPreview.jpg',
  'Basketball Court': '/images/RecreationPreview.jpg',
  'Childrens Playground': '/images/RecreationPreview.jpg',
  'Recreational Center': '/images/RecreationPreview.jpg',
};

/** Canonical amenity previews for guest dashboard / landing (same paths as venue details). */
export const LANDING_AMENITY_IMAGE = {
  garden: VENUE_CATEGORY_IMAGE.Garden,
  prayerMountain: VENUE_CATEGORY_IMAGE['Prayer Mountain'],
  prayerTower: VENUE_CATEGORY_IMAGE['Prayer Tower'],
  recreation: VENUE_CATEGORY_IMAGE.Recreation,
};

/**
 * Exact venue name / room code / package overrides.
 * Add real campus photos here as they become available (same pattern as ROOM_NUMBER_IMAGE).
 */
export const VENUE_NAME_IMAGE = {
  'GMC Chapel': 'https://images.unsplash.com/photo-1438032455732-1033d28535fd?auto=format&fit=crop&w=1200&q=80',
  'Burdine Commons': 'https://images.unsplash.com/photo-1517502884422-41eaead166d4?auto=format&fit=crop&w=1200&q=80',
  'Prayer Mountain': '/images/PrayerMountainPreview.jpg',
  'Prayer Tower': '/images/PrayerTowerPreview.jpg',
  Garden: '/images/GardenPreview.jpg',
  'Osgood Hall': '/images/GardenPreview.jpg',
  'Osgood Garden': '/images/GardenPreview.jpg',
  'Basketball Court': '/images/RecreationPreview.jpg',
  'Childrens Playground': '/images/RecreationPreview.jpg',
  'Recreational Center': '/images/RecreationPreview.jpg',
  'A-101': 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1200&q=80',
  'A-504': 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=80',
  'A-505': 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=80',
  'A-506': 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80',
  'A-507': 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80',
};

const DEFAULT_VENUE_IMAGE =
  'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=80';

/** @type {Record<string, { label: string, badge: string }>} */
const AVAIL_BADGES = {
  available: { label: 'Available', badge: 'fac-badge--available' },
  booked: { label: 'Booked', badge: 'fac-badge--booked' },
  occupied: { label: 'Occupied', badge: 'fac-badge--booked' },
  dirty: { label: 'Being cleaned', badge: 'fac-badge--dirty' },
  maintenance: { label: 'Out of order', badge: 'fac-badge--blocked' },
  too_small: { label: 'Too small', badge: 'fac-badge--blocked' },
  dorm_min_guests: { label: 'Min 5 pax', badge: 'fac-badge--blocked' },
};

/** @type {Record<string, { label: string, badge: string }>} */
const LIVE_BADGES = {
  Available: { label: 'Vacant', badge: 'fac-badge--available' },
  Occupied: { label: 'Occupied', badge: 'fac-badge--booked' },
  Dirty: { label: 'Being cleaned', badge: 'fac-badge--dirty' },
  Maintenance: { label: 'Out of order', badge: 'fac-badge--blocked' },
};

export function roomTypeIcon(roomType) {
  return ROOM_TYPE_ICON[roomType] || 'meeting_room';
}

export function roomTypeImage(roomType) {
  return ROOM_TYPE_IMAGE[roomType] || DEFAULT_ROOM_IMAGE;
}

function normalizeRoomNumber(value) {
  return String(value ?? '').trim().replace(/^room\s+/i, '');
}

export function roomPreviewImage({
  roomNumber, room_number, roomType, room_type, room_type_label, bed_count,
} = {}) {
  const num = normalizeRoomNumber(roomNumber ?? room_number);
  if (num && ROOM_NUMBER_IMAGE[num]) return ROOM_NUMBER_IMAGE[num];
  const tier = resolveRoomVisualKey({
    room_type: room_type ?? roomType,
    room_type_label,
    bed_count,
    room_number: num,
  });
  return roomTypeImage(tier);
}

/** Extra gallery shots per room type until multi-upload exists. */
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

/** Optional multi-photo overrides keyed by room number (extend as uploads arrive). */
export const ROOM_NUMBER_GALLERY = {
  '204': [
    '/images/204Preview.jpg',
    '/images/204Preview2.jpg',
  ],
  '207': [
    '/images/207Preview.jpg',
    '/images/207Preview2.jpg',
  ],
  '301': [
    '/images/301Preview.jpg',
    '/images/301Preview2.jpg',
  ],
  '401': [
    '/images/401Preview.jpg',
    '/images/401Preview2.jpg',
    '/images/401Preview3.jpg',
    '/images/401Preview4.jpg',
    '/images/401Preview5.jpg',
  ],
  '404': [
    '/images/404Preview.jpg',
    '/images/404Preview2.jpg',
    '/images/404Preview3.jpg',
    '/images/404Preview4.jpg',
    '/images/404Preview5.jpg',
    '/images/404Preview6.jpg',
  ],
  '410': [
    '/images/410Preview.jpg',
    '/images/410Preview2.jpg',
    '/images/410Preview3.jpg',
    '/images/410Preview4.jpg',
  ],
  '411': [
    '/images/411Preview.jpg',
    '/images/411Preview2.jpg',
    '/images/411Preview3.jpg',
  ],
  '413': [
    '/images/413Preview.jpg',
    '/images/413Preview2.jpg',
    '/images/413Preview3.jpg',
    '/images/413Preview4.jpg',
  ],
  '416': [
    '/images/416Preview.jpg',
    '/images/416Preview2.jpg',
    '/images/416Preview3.jpg',
    '/images/416Preview4.jpg',
    '/images/416Preview5.jpg',
  ],
  'A-501': [
    '/images/501Preview.jpg',
    '/images/501Preview2.jpg',
    '/images/501Preview3.jpg',
    '/images/501Preview4.jpg',
    '/images/501Preview5.jpg',
  ],
};

const VENUE_CATEGORY_GALLERY = {
  'GMC Chapel': [
    'https://images.unsplash.com/photo-1438032455732-1033d28535fd?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1519167758481-83f29da8e3a3?auto=format&fit=crop&w=1400&q=80',
    '/images/PrayerTowerPreview.jpg',
  ],
  'Burdine Commons': [
    'https://images.unsplash.com/photo-1517502884422-41eaead166d4?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1400&q=80',
  ],
  'GMC Conference Rooms': [
    'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1400&q=80',
  ],
  'Prayer Mountain': [
    '/images/PrayerMountainPreview.jpg',
    '/images/PrayerMountainPreview2.jpg',
    '/images/PrayerMountainPreview3.jpg',
    '/images/HutPreview.jpg',
  ],
  'Prayer Tower': [
    '/images/PrayerTowerPreview.jpg',
    '/images/PrayerTowerPreview2.jpg',
    '/images/PrayerTowerPreview3.jpg',
  ],
  Garden: [
    '/images/GardenPreview.jpg',
    '/images/GardenPreview2.jpg',
    '/images/GardenPreview3.jpg',
    '/images/GardenPreview4.jpg',
  ],
  Recreation: [
    '/images/RecreationPreview.jpg',
    '/images/RecreationPreview2.jpg',
    '/images/RecreationPreview3.jpg',
    '/images/RecreationPreview4.jpg',
    '/images/RecreationPreview5.jpg',
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
 * Gallery list for a room card/detail modal.
 * Uses room-specific photos first, then type gallery placeholders.
 */
export function roomGalleryImages(room = {}) {
  const num = normalizeRoomNumber(room.roomNumber ?? room.room_number);
  const roomGallery = ROOM_NUMBER_GALLERY[num];
  if (roomGallery?.length) {
    return uniqueUrls(roomGallery).slice(0, 5);
  }

  const tier = resolveRoomVisualKey({
    room_type: room.room_type ?? room.roomType,
    room_type_label: room.room_type_label,
    bed_count: room.bed_count,
    room_number: num,
  });
  const primary = roomPreviewImage(room);
  const extras = [
    ...(ROOM_TYPE_GALLERY[tier] || [roomTypeImage(tier)]),
    DEFAULT_ROOM_IMAGE,
  ];
  return uniqueUrls([primary, ...extras]).slice(0, 5);
}

/**
 * Gallery list for a venue card/detail modal.
 */
export function venueGalleryImages(venue = {}) {
  const code = normalizeVenueKey(venue.room_code ?? venue.roomCode);
  const candidates = [venue.name, venue.label, venue.item, venue.facility_group, venue.category]
    .map(normalizeVenueKey)
    .filter(Boolean);

  let categoryKey = '';
  for (const key of candidates) {
    if (VENUE_CATEGORY_GALLERY[key] || VENUE_CATEGORY_IMAGE[key]) {
      categoryKey = key;
      break;
    }
  }
  if (!categoryKey) {
    const blob = candidates.join(' ').toLowerCase();
    if (/chapel|church|wedding|baptism/.test(blob)) categoryKey = 'GMC Chapel';
    else if (/prayer mountain|retreat|hut/.test(blob)) categoryKey = 'Prayer Mountain';
    else if (/prayer tower/.test(blob)) categoryKey = 'Prayer Tower';
    else if (/garden|osgood/.test(blob)) categoryKey = 'Garden';
    else if (/basketball|playground|recreation|sport|court|gym/.test(blob)) categoryKey = 'Recreation';
    else if (/conference|classroom|commons|meeting|a-\d{3}/.test(blob)) categoryKey = 'GMC Conference Rooms';
  }

  const categoryGallery = VENUE_CATEGORY_GALLERY[categoryKey];
  if (categoryGallery?.length) {
    return uniqueUrls(categoryGallery).slice(0, 5);
  }

  const primary = venuePreviewImage(venue);
  const extras = [
    code && VENUE_NAME_IMAGE[code],
    VENUE_CATEGORY_IMAGE[categoryKey],
    DEFAULT_VENUE_IMAGE,
  ].filter(Boolean);

  return uniqueUrls([primary, ...extras]).slice(0, 5);
}

function normalizeVenueKey(value) {
  return String(value ?? '').trim();
}

/**
 * Resolve a venue photo placeholder.
 * Priority: room_code → exact name/item/label → facility_group/category → default.
 */
export function venuePreviewImage({
  name, label, item, category, facility_group, room_code, roomCode,
} = {}) {
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

  const blob = candidates.join(' ').toLowerCase();
  if (/chapel|church|wedding|baptism/.test(blob)) {
    return VENUE_CATEGORY_IMAGE['GMC Chapel'];
  }
  if (/prayer mountain|retreat|hut/.test(blob)) {
    return VENUE_CATEGORY_IMAGE['Prayer Mountain'];
  }
  if (/prayer tower/.test(blob)) {
    return VENUE_CATEGORY_IMAGE['Prayer Tower'];
  }
  if (/garden|osgood/.test(blob)) {
    return VENUE_CATEGORY_IMAGE.Garden;
  }
  if (/basketball|playground|recreation|sport|court|gym/.test(blob)) {
    return VENUE_CATEGORY_IMAGE.Recreation;
  }
  if (/conference|classroom|commons|meeting|a-\d{3}/.test(blob)) {
    return VENUE_CATEGORY_IMAGE['GMC Conference Rooms'];
  }

  return DEFAULT_VENUE_IMAGE;
}

export function availabilityBadge(status) {
  return AVAIL_BADGES[status] || AVAIL_BADGES.booked;
}

export function liveStatusBadge(status) {
  return LIVE_BADGES[status] || LIVE_BADGES.Occupied;
}

export function formatPeso(n) {
  return `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 0 })}`;
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

export function roomHasCustomHighlights(room = {}) {
  return parseHighlightLines(roomInclusionsText(room)).length > 0;
}
