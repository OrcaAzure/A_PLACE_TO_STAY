/**
 * Shared guest booking flow — URLs, disclaimers, availability, browse access.
 */

import { isInternalGuest } from '/assets/js/services/auth.js';
import {
  canGuestAccessRoom,
  EXTERNAL_ROOM_BUILDINGS,
  GUEST_BLOCKED_BUILDINGS,
} from '/assets/js/config/guest-access.js';
import { isRoomListVisible } from '/assets/js/features/reservation-shared.js';

export { isInternalGuest, canGuestAccessRoom as roomAllowedForGuest };
export { EXTERNAL_ROOM_BUILDINGS, GUEST_BLOCKED_BUILDINGS };

export const PRICE_DISCLAIMER =
  'Prices shown are estimates. Your final total will be confirmed by housing after reviewing your request.';

export const BROWSE_CATEGORIES = [
  {
    id: 'guest-houses',
    label: 'Guest Houses',
    externalLabel: 'Global Missions Center Guest Rooms',
    description: 'Overnight stays',
    externalDescription: 'Global Missions Center only',
    image: '/images/RoomsPreview.jpg',
    showsRooms: true,
  },
  {
    id: 'conference-classrooms',
    label: 'Conference & Classrooms',
    description: 'Meetings and events',
    image: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80',
    showsRooms: false,
  },
  {
    id: 'chapel-garden',
    label: 'Chapel & Garden',
    description: 'Services and outdoor events',
    image: 'https://images.unsplash.com/photo-1438032455732-1033d28535fd?auto=format&fit=crop&w=1200&q=80',
    showsRooms: false,
  },
  {
    id: 'prayer-mountain',
    label: 'Prayer Mountain',
    description: 'Retreat spaces',
    image: '/images/PrayerMountainPreview.jpg',
    showsRooms: false,
  },
  {
    id: 'sports-rec',
    label: 'Sports & Rec',
    description: 'Courts and recreation',
    image: '/images/RecEntrancePreview.jpg',
    showsRooms: false,
  },
];

export function priceNoticeHtml(className = '') {
  return `
    <div class="guest-price-notice flex items-start gap-2 rounded-xl border border-amber-200/80 bg-amber-50 px-4 py-3 text-body-sm text-amber-950 ${className}" role="note">
      <span class="material-symbols-outlined text-[18px] text-amber-600 shrink-0 mt-0.5">info</span>
      <p>${PRICE_DISCLAIMER}</p>
    </div>`;
}

export function buildBookReservationUrl({ roomId, checkIn, checkOut, guests } = {}) {
  const params = new URLSearchParams();
  params.set('book', '1');
  if (roomId != null && roomId !== '') params.set('room_id', String(roomId));
  if (checkIn) params.set('check_in', checkIn);
  if (checkOut) params.set('check_out', checkOut);
  if (guests != null && guests !== '') params.set('guests', String(guests));
  return `/guest/reservations.html?${params.toString()}`;
}

export function buildBrowseUrl(category, extra = {}) {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (extra.checkIn) params.set('check_in', extra.checkIn);
  if (extra.checkOut) params.set('check_out', extra.checkOut);
  if (extra.eventDate) params.set('event_date', extra.eventDate);
  if (extra.guests) params.set('guests', String(extra.guests));
  const qs = params.toString();
  return `/guest/facilities.html${qs ? `?${qs}` : ''}`;
}

export function parseBookQuery() {
  const params = new URLSearchParams(window.location.search);
  return {
    book: params.get('book') === '1',
    roomId: params.get('room_id') || '',
    checkIn: params.get('check_in') || '',
    checkOut: params.get('check_out') || '',
    guests: params.get('guests') || '',
  };
}

/** True when browse already picked a specific room and date range. */
export function hasCompleteBookIntent({ roomId, checkIn, checkOut } = {}) {
  return Boolean(roomId && checkIn && checkOut);
}

export function isDbStatusBookable(status) {
  return String(status || '').trim() === 'Available';
}

export function isAvailabilityBookable(status) {
  return String(status || '').trim() === 'available';
}

export function isAvailabilityVisible(status) {
  return isRoomListVisible(status);
}

export function readBrowseQuery() {
  const params = new URLSearchParams(window.location.search);
  return {
    checkIn: params.get('check_in') || '',
    checkOut: params.get('check_out') || '',
    eventDate: params.get('event_date') || '',
    guests: params.get('guests') || '1',
    category: params.get('category') || '',
    focus: params.get('focus') || '',
  };
}


export function getBrowseCategories() {
  return BROWSE_CATEGORIES;
}

export function resolveBrowseCategory(categoryId) {
  const categories = getBrowseCategories();
  if (categories.some((cat) => cat.id === categoryId)) return categoryId;
  return categories[0]?.id || 'guest-houses';
}

export function getBrowseCategoryMeta(categoryId, isInternal = isInternalGuest()) {
  const cat = BROWSE_CATEGORIES.find((c) => c.id === categoryId)
    || getBrowseCategories()[0];
  if (!cat) return { id: 'guest-houses', label: 'Guest Houses', description: '', showsRooms: true };
  return {
    ...cat,
    label: !isInternal && cat.externalLabel ? cat.externalLabel : cat.label,
    description: !isInternal && cat.externalDescription ? cat.externalDescription : cat.description,
  };
}

export function categoryShowsRooms(categoryId) {
  return BROWSE_CATEGORIES.find((c) => c.id === categoryId)?.showsRooms === true;
}

export function categoryUsesEventDate(categoryId) {
  return !categoryShowsRooms(categoryId);
}


export function parsePackageHours(itemName) {
  if (!itemName) return null;
  const s = String(itemName);
  const explicit = s.match(/(\d+)\s*hr/i);
  if (explicit) return Number(explicit[1]);
  const word = s.match(/(\d+)\s*[- ]?\s*hour/i);
  if (/minimum|min\./i.test(s) && word) return Number(word[1]);
  return null;
}

export function formatVenueRateLabel(space) {
  const rate = space.regularRate ?? space.peakRate;
  if (rate == null) return '—';
  const pkg = parsePackageHours(space.item);
  const fmt = (n) => `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 0 })}`;
  if (pkg) return `${pkg}-hr package · ${fmt(rate)}`;
  if (space.regularRate != null && space.peakRate != null && space.peakRate !== space.regularRate) {
    return `${fmt(space.regularRate)} / hr · Peak dates may differ`;
  }
  return `${fmt(rate)} / hr`;
}

export function venueCapacityLabel(space) {
  const min = space.capacity_min ?? space.capacityMin;
  const max = space.capacity_max ?? space.capacityMax;
  if (min != null && max != null) return `${min}–${max} guests`;
  if (max != null) return `Up to ${max} guests`;
  if (min != null) return `From ${min} guests`;
  return '';
}

/** Map DB facility category → guest browse tab(s). */
const VENUE_BROWSE_BY_CATEGORY = {
  GMC: 'conference-classrooms',
  'GMC Conference Rooms': 'conference-classrooms',
  'Burdine Commons': 'conference-classrooms',
  'GMC Chapel': 'chapel-garden',
  Garden: 'chapel-garden',
  'Prayer Mountain': 'prayer-mountain',
  'Prayer Tower': 'prayer-mountain',
  Recreation: 'sports-rec',
  'Basketball Court': 'sports-rec',
  'Childrens Playground': 'sports-rec',
  'Recreational Center': 'sports-rec',
};

/** Item keywords that also belong on the chapel & garden tab. */
const CHAPEL_GARDEN_ITEM = /wedding|reception|church|chapel|baptism|aircon|garden|osgood/i;

/** Item keywords that belong on conference tab even when category defaults elsewhere. */
const CONFERENCE_ITEM = /conference|classroom|meeting|multi-purpose|seminar|educational|russ turney|commons/i;

export function venueBrowseCategoryIds(space) {
  const ids = new Set();
  const dbCategory = String(space?.category || '').trim();
  const item = String(space?.item || '');
  const itemLower = item.toLowerCase();

  const mapped = VENUE_BROWSE_BY_CATEGORY[dbCategory];
  if (mapped) ids.add(mapped);

  if (CHAPEL_GARDEN_ITEM.test(itemLower) || dbCategory === 'Garden' || dbCategory === 'GMC Chapel') {
    ids.add('chapel-garden');
  }
  if (
    CONFERENCE_ITEM.test(itemLower)
    || dbCategory === 'GMC'
    || dbCategory === 'GMC Conference Rooms'
    || /^A-\d{3}$/i.test(item)
  ) {
    ids.add('conference-classrooms');
  }
  if (/prayer mountain|prayer tower|retreat|baptism/i.test(`${dbCategory} ${item}`)) {
    ids.add('prayer-mountain');
  }
  if (/sport|basketball|playground|rec center|court|gym/i.test(`${dbCategory} ${item}`)) {
    ids.add('sports-rec');
  }

  if (ids.has('conference-classrooms') && /wedding|reception/i.test(itemLower)) {
    ids.delete('conference-classrooms');
  }

  return [...ids];
}

export function venueMatchesBrowseCategory(space, categoryId) {
  return venueBrowseCategoryIds(space).includes(categoryId);
}

export function guestAccessNoticeHtml(isInternal = isInternalGuest()) {
  if (isInternal) return '';
  return `
    <div class="guest-access-notice flex items-start gap-3 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3.5 text-body-sm text-on-surface" role="status">
      <span class="material-symbols-outlined text-primary text-[20px] shrink-0">verified_user</span>
      <p class="m-0 leading-relaxed">
        <strong class="text-primary">External guest access.</strong>
        You can browse and request all campus facilities. Overnight guest rooms are available in Global Missions Center.
      </p>
    </div>`;
}

/** Update Global Missions Center copy on guest home for external users. */
export function applyGuestLandingAccess(root = document, isInternal = isInternalGuest()) {
  const guestHouseCard = root.querySelector('[data-browse-category="guest-houses"]');
  if (guestHouseCard && !isInternal) {
    const tag = guestHouseCard.querySelector('.lp-facility-tag');
    const title = guestHouseCard.querySelector('.lp-facility-body h3');
    if (tag) tag.textContent = 'Global Missions Center';
    if (title) title.textContent = 'Global Missions Center Guest Rooms';
    const desc = guestHouseCard.querySelector('.lp-facility-body p.mb-5, .lp-facility-body p.mb-4, .lp-facility-body p.mb-3');
    if (desc) {
      desc.textContent = 'Overnight rooms in Global Missions Center for visiting partners — plus conference and event spaces below.';
    }
  }
}
