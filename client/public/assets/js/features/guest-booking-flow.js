/**
 * Shared guest booking flow — URLs, disclaimers, availability, browse access.
 */

import { isInternalGuest } from '/assets/js/services/auth.js';

export { isInternalGuest };

export const PRICE_DISCLAIMER =
  'Prices shown are estimates only. Your final total may change after staff review — seasonal rates, meals, fees, occupancy adjustments, or special arrangements can apply.';

export const BROWSE_CATEGORIES = [
  {
    id: 'guest-houses',
    label: 'Guest Houses',
    externalLabel: 'PCALM Guest Rooms',
    description: 'Overnight stays',
    externalDescription: 'PCALM building only',
    image: 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&w=1200&q=80',
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
    image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1200&q=80',
    showsRooms: false,
    internalOnly: true,
  },
  {
    id: 'sports-rec',
    label: 'Sports & Rec',
    description: 'Courts and recreation',
    image: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=1200&q=80',
    showsRooms: false,
    internalOnly: true,
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

export function readBrowseQuery() {
  const params = new URLSearchParams(window.location.search);
  return {
    checkIn: params.get('check_in') || '',
    checkOut: params.get('check_out') || '',
    guests: params.get('guests') || '1',
    category: params.get('category') || '',
    focus: params.get('focus') || '',
  };
}

const BLOCKED_BUILDINGS = ['House'];
const EXTERNAL_ROOM_BUILDINGS = ['PCALM'];

export function getBrowseCategories(isInternal = isInternalGuest()) {
  return BROWSE_CATEGORIES.filter((cat) => isInternal || !cat.internalOnly);
}

export function resolveBrowseCategory(categoryId, isInternal = isInternalGuest()) {
  const categories = getBrowseCategories(isInternal);
  if (categories.some((cat) => cat.id === categoryId)) return categoryId;
  return categories[0]?.id || 'guest-houses';
}

export function getBrowseCategoryMeta(categoryId, isInternal = isInternalGuest()) {
  const cat = BROWSE_CATEGORIES.find((c) => c.id === categoryId)
    || getBrowseCategories(isInternal)[0];
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

export function roomAllowedForGuest(room, isInternal = isInternalGuest()) {
  const building = String(room?.building || room?.building_name || '').trim();
  if (BLOCKED_BUILDINGS.includes(building)) return false;
  if (isInternal) return true;
  return EXTERNAL_ROOM_BUILDINGS.includes(building);
}

export function venueMatchesBrowseCategory(space, categoryId) {
  const haystack = `${space.category} ${space.item}`.toLowerCase();
  if (categoryId === 'conference-classrooms') {
    return /conference|classroom|russ turney|multi-purpose|meeting|seminar|hall/.test(haystack);
  }
  if (categoryId === 'chapel-garden') {
    return /chapel|garden|osgood|gmc|outdoor|function/.test(haystack);
  }
  if (categoryId === 'prayer-mountain') {
    return /prayer mountain|prayer tower|retreat/.test(haystack);
  }
  if (categoryId === 'sports-rec') {
    return /sports|rec|basketball|playground|court|gym/.test(haystack);
  }
  return false;
}

export function guestAccessNoticeHtml(isInternal = isInternalGuest()) {
  if (isInternal) return '';
  return `
    <div class="guest-access-notice flex items-start gap-3 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3.5 text-body-sm text-on-surface" role="status">
      <span class="material-symbols-outlined text-primary text-[20px] shrink-0">verified_user</span>
      <p class="m-0 leading-relaxed">
        <strong class="text-primary">External guest access.</strong>
        You can browse PCALM guest rooms, conference spaces, and selected campus facilities.
        Full campus housing (Thesda, Sampaguita, Peranza) is reserved for APTS community members.
      </p>
    </div>`;
}

/** Hide internal-only facility cards on guest home landing. */
export function applyGuestLandingAccess(root = document, isInternal = isInternalGuest()) {
  root.querySelectorAll('[data-internal-only]').forEach((el) => {
    el.classList.toggle('hidden', !isInternal);
  });

  const guestHouseCard = root.querySelector('[data-browse-category="guest-houses"]');
  if (guestHouseCard && !isInternal) {
    const tag = guestHouseCard.querySelector('.lp-facility-body span.inline-block');
    const title = guestHouseCard.querySelector('.lp-facility-body h3');
    if (tag) tag.textContent = 'PCALM building';
    if (title) title.textContent = 'PCALM Guest Rooms';
    const desc = guestHouseCard.querySelector('.lp-facility-body p.mb-4, .lp-facility-body p.mb-3');
    if (desc) {
      desc.textContent = 'Overnight rooms in PCALM for visiting partners — plus conference and event spaces below.';
    }
  }
}
