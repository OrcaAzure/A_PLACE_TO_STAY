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
  '413': '/images/413Preview.jpg',
  '416': '/images/416Preview.jpg',
};

const DEFAULT_ROOM_IMAGE =
  'https://images.unsplash.com/photo-1631049552057-403cdb8f0658?auto=format&fit=crop&w=1200&q=80';

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

export function availabilityBadge(status) {
  return AVAIL_BADGES[status] || AVAIL_BADGES.booked;
}

export function liveStatusBadge(status) {
  return LIVE_BADGES[status] || LIVE_BADGES.Occupied;
}

export function formatPeso(n) {
  return `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 0 })}`;
}
