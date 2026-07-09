/** Shared reservation UI helpers */

import { getCurrentUser } from '/assets/js/services/auth.js';

export const MEAL_TYPE_LIST = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
export const MEAL_MAX_QTY = 9999;
/** Dorm nightly rate — priced with the room, not as a booking add-on. */
export const PER_PERSON_NIGHT_EXTRA_ITEM = 'Per person per Night';

export function clampMealQty(value) {
  const n = Math.floor(Number(value));
  if (Number.isNaN(n) || n < 0) return 0;
  return Math.min(MEAL_MAX_QTY, n);
}

export function readMealQtyInput(input) {
  return clampMealQty(input?.value);
}

/** Admin wizard meal row with typeable quantity. */
export function renderAdminMealRow(type, qty, price, { idPrefix = 'wiz' } = {}) {
  const safeQty = clampMealQty(qty);
  const inputId = `${idPrefix}-meal-qty-${type.toLowerCase()}`;
  return `
    <div class="res-meal-row">
      <div>
        <strong>${type}</strong>
        <span class="res-meal-price">${formatMoney(price)} each</span>
      </div>
      <div class="res-meal-qty-wrap">
        <label class="res-sr-only" for="${inputId}">${type} quantity</label>
        <input type="number" id="${inputId}" class="res-meal-qty-input" data-meal-qty="${type}" min="0" max="${MEAL_MAX_QTY}" step="1" value="${safeQty}" inputmode="numeric" aria-label="${type} quantity" />
      </div>
      <span class="res-meal-sub" data-meal-sub="${type}">${formatMoney(price * safeQty)}</span>
    </div>`;
}

export function mealTypesOrdered(mealRates = {}) {
  const types = [...MEAL_TYPE_LIST];
  for (const key of Object.keys(mealRates || {})) {
    if (!types.includes(key)) types.push(key);
  }
  return types;
}

export function ensureMealsShape(meals = {}, mealRates = {}) {
  const next = { ...meals };
  for (const type of mealTypesOrdered(mealRates)) {
    if (next[type] == null) next[type] = 0;
  }
  return next;
}

export function syncAdminMealSubtotals(root, meals, mealRates) {
  if (!root) return;
  mealTypesOrdered(mealRates).forEach((type) => {
    const sub = root.querySelector(`[data-meal-sub="${type}"]`);
    if (sub) sub.textContent = formatMoney((Number(mealRates[type]) || 0) * clampMealQty(meals[type]));
  });
  const total = root.querySelector('[data-meals-total]');
  if (total) {
    const sum = mealTypesOrdered(mealRates).reduce(
      (s, t) => s + (Number(mealRates[t]) || 0) * clampMealQty(meals[t]),
      0
    );
    total.textContent = formatMoney(sum);
  }
}

export function readMealsFromInputs(root, meals) {
  const next = { ...meals };
  root?.querySelectorAll('[data-meal-qty]').forEach((input) => {
    const type = input.getAttribute('data-meal-qty');
    if (type) next[type] = readMealQtyInput(input);
  });
  return next;
}

/** FY26 pricelist — dorm bookings require at least this many guests. */
export const DORM_MIN_GUEST_COUNT = 5;

export function effectiveCapacityMin(room) {
  if (room?.room_type === 'Dorm') {
    return Math.max(Number(room.capacity_min) || 1, DORM_MIN_GUEST_COUNT);
  }
  return Number(room?.capacity_min) || 1;
}

export function dormPricingGuestCount(room, guestCount) {
  const count = Math.max(1, Number(guestCount) || 1);
  if (room?.room_type !== 'Dorm' && !room?.per_person_pricing) return count;
  return Math.max(count, room?.dorm_booking_minimum || DORM_MIN_GUEST_COUNT);
}

export function isRoomListVisible(status) {
  const s = String(status || '').trim();
  return s === 'available' || s === 'dorm_min_guests';
}

export function isRoomBookable(status) {
  return status === 'available';
}

export function dormMinGuestsNotice(guestCount) {
  const count = Number(guestCount) || 1;
  if (count >= DORM_MIN_GUEST_COUNT) return null;
  return `Dorm bookings require at least ${DORM_MIN_GUEST_COUNT} guests. Increase the guest count to book.`;
}

export function dormPriceLabel(room, guestCount, nights) {
  if (room?.room_type !== 'Dorm' && !room?.per_person_pricing) return null;
  const requested = Number(guestCount) || 1;
  const guests = dormPricingGuestCount(room, requested);
  const n = Number(nights) || 1;
  const total = Number(room.estimated_total);
  if (!total || !guests || !n) return null;
  const perPerson = Math.round((total / guests / n) * 100) / 100;
  const base = `${formatMoney(perPerson)}/person/night × ${guests} guest${guests === 1 ? '' : 's'}`;
  if (requested < (room?.dorm_booking_minimum || DORM_MIN_GUEST_COUNT)) {
    return `${base} (minimum ${room?.dorm_booking_minimum || DORM_MIN_GUEST_COUNT} pax)`;
  }
  return base;
}

export const WIZARD_STEPS = [
  { id: 1, label: 'Guest Info', short: 'Who is staying?' },
  { id: 2, label: 'Dates & Guests', short: 'When and how many?' },
  { id: 3, label: 'Pick a Room', short: 'Choose a room' },
  { id: 4, label: 'Meals & Extras', short: 'Add meals or fees' },
  { id: 5, label: 'Confirm', short: 'Review and save' },
];

export function servicesToQuickFees(services = []) {
  const fees = [];
  const seen = new Set();
  for (const group of services) {
    for (const item of group.items || []) {
      const key = `${item.item}|${Number(item.rate)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      fees.push({ name: item.item, amount: item.rate, category: group.category });
    }
  }
  return fees;
}

/** Fill missing guest contact fields from the logged-in portal user (guest modify). */
export function applyLoggedInGuestContact(state) {
  try {
    const user = getCurrentUser() || {};
    if (!state.guestName) state.guestName = user.full_name || user.name || '';
    if (!state.email) state.email = user.email || '';
    if (!state.contactPhone) state.contactPhone = user.phone || user.contact_phone || '';
  } catch { /* ignore */ }
  return state;
}

/** Fill missing group contact fields from the logged-in portal user (guest modify). */
export function applyLoggedInGroupContact(state) {
  try {
    const user = getCurrentUser() || {};
    if (!state.contactName) state.contactName = user.full_name || user.name || '';
    if (!state.email) state.email = user.email || '';
    if (!state.contactPhone) state.contactPhone = user.phone || user.contact_phone || '';
  } catch { /* ignore */ }
  return state;
}

export function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function formatDisplayId(id) { return `#APT-${id}`; }

/** Calendar date as YYYY-MM-DD in the user's local timezone. */
export function toLocalDateString(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'string') return value.slice(0, 10);
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatDate(d) {
  if (!d) return '—';
  const raw = String(d).slice(0, 10);
  return new Date(`${raw}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateLong(d) {
  if (!d) return '—';
  const raw = String(d).slice(0, 10);
  return new Date(`${raw}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function formatMoney(amount) {
  const val = Number(amount);
  if (Number.isNaN(val)) return '—';
  return val.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}

export function normStatus(s) { return String(s || 'pending').toLowerCase(); }

export function stayNights(checkIn, checkOut) {
  if (!checkIn || !checkOut) return null;
  const start = new Date(`${String(checkIn).slice(0, 10)}T00:00:00`);
  const end = new Date(`${String(checkOut).slice(0, 10)}T00:00:00`);
  const nights = Math.round((end - start) / 86400000);
  return nights > 0 ? nights : null;
}

export function formatSubmittedAt(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function statusBadge(status) {
  const key = normStatus(status);
  const labels = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled' };
  return `<span class="res-pill res-pill--${key}">${escapeHtml(labels[key] || status)}</span>`;
}

export function localDateStr(d = new Date()) {
  return toLocalDateString(d);
}

export function combineDateTime(dateStr, timeStr) {
  const date = String(dateStr).slice(0, 10);
  const raw = String(timeStr || '00:00:00').trim();
  const time = /^\d{1,2}:\d{2}$/.test(raw) ? `${raw}:00` : raw.slice(0, 8);
  return new Date(`${date}T${time}`);
}

export function roomStayPhase(checkIn, checkOut, todayStr = localDateStr()) {
  const ci = String(checkIn).slice(0, 10);
  const co = String(checkOut).slice(0, 10);
  if (todayStr > co) return 'past';
  if (todayStr >= ci) return 'active';
  return 'upcoming';
}

export function venueEventPhase(eventDate, startTime, endTime, now = new Date()) {
  const start = combineDateTime(eventDate, startTime);
  const end = combineDateTime(eventDate, endTime);
  if (now > end) return 'past';
  if (now >= start) return 'active';
  return 'upcoming';
}

export function daysUntilDate(targetDateStr, todayStr = localDateStr()) {
  const target = new Date(`${String(targetDateStr).slice(0, 10)}T00:00:00`);
  const today = new Date(`${todayStr}T00:00:00`);
  return Math.round((target - today) / 86400000);
}

export function hoursUntilCheckIn(checkIn, now = new Date()) {
  const start = new Date(`${String(checkIn).slice(0, 10)}T00:00:00`);
  return (start - now) / 3600000;
}

export function hoursUntilEventStart(eventDate, startTime, now = new Date()) {
  const start = combineDateTime(eventDate, startTime);
  return (start - now) / 3600000;
}

export function cutoffHoursError(cutoffHours) {
  const hours = Number(cutoffHours);
  if (hours <= 0) return null;
  if (hours === 1) return 'Cancellations must be made at least 1 hour before check-in or the event start.';
  return `Cancellations must be made at least ${hours} hours before check-in or the event start.`;
}

/** @deprecated Use cutoffHoursError */
export function cutoffDaysError(cutoffDays) {
  return cutoffHoursError(Number(cutoffDays) * 24);
}

export function canGuestCancelRoomBooking(booking, { now = new Date(), cutoffHours = 24 } = {}) {
  const status = normStatus(booking.status);
  if (!['pending', 'approved'].includes(status)) return false;
  const todayStr = localDateStr(now);
  if (roomStayPhase(booking.startDate || booking.check_in, booking.endDate || booking.check_out, todayStr) !== 'upcoming') {
    return false;
  }
  return hoursUntilCheckIn(booking.startDate || booking.check_in, now) >= Number(cutoffHours);
}

export function canGuestCancelVenueBooking(booking, { now = new Date(), cutoffHours = 24 } = {}) {
  const status = normStatus(booking.status);
  if (!['pending', 'approved'].includes(status)) return false;
  if (venueEventPhase(
    booking.eventDate || booking.startDate || booking.event_date,
    booking.startTime || booking.start_time,
    booking.endTime || booking.end_time,
    now,
  ) !== 'upcoming') {
    return false;
  }
  return hoursUntilEventStart(
    booking.eventDate || booking.startDate || booking.event_date,
    booking.startTime || booking.start_time,
    now,
  ) >= Number(cutoffHours);
}

export function canGuestModifyRoomBooking(booking, opts = {}) {
  return canGuestCancelRoomBooking(booking, opts);
}

export function canGuestModifyVenueBooking(booking, opts = {}) {
  return canGuestCancelVenueBooking(booking, opts);
}

export function canAdminCancelRoomBooking(booking, now = new Date()) {
  const status = normStatus(booking.status);
  if (!['pending', 'approved'].includes(status)) return false;
  return roomStayPhase(
    booking.check_in || booking.checkIn || booking.startDate,
    booking.check_out || booking.checkOut || booking.endDate,
    localDateStr(now),
  ) === 'upcoming';
}

export function canAdminCancelVenueBooking(booking, now = new Date()) {
  const status = normStatus(booking.status);
  if (!['pending', 'approved'].includes(status)) return false;
  return venueEventPhase(
    booking.eventDate || booking.event_date,
    booking.startTime || booking.start_time,
    booking.endTime || booking.end_time,
    now,
  ) === 'upcoming';
}

export function canAdminModifyVenueBooking(booking, now = new Date()) {
  return canAdminCancelVenueBooking(booking, now);
}

export function venuePhaseLabel(phase) {
  if (phase === 'active') return 'In progress';
  if (phase === 'past') return 'Completed';
  return 'Upcoming';
}

export function roomStayPhaseLabel(phase) {
  return venuePhaseLabel(phase);
}

export function lifecyclePhaseForBooking(booking, now = new Date()) {
  const status = normStatus(booking.status);
  if (['cancelled', 'rejected'].includes(status)) return null;
  const isVenue = booking.kind === 'venue'
    || booking.eventDate != null
    || booking.event_date != null
    || (booking.startTime != null && booking.endTime != null);
  if (isVenue) {
    return venueEventPhase(
      booking.eventDate || booking.event_date || booking.startDate,
      booking.startTime || booking.start_time,
      booking.endTime || booking.end_time,
      now,
    );
  }
  return roomStayPhase(
    booking.check_in || booking.checkIn || booking.startDate,
    booking.check_out || booking.checkOut || booking.endDate,
  );
}

export function lifecyclePhaseBadge(phase) {
  if (!phase) return '';
  const label = venuePhaseLabel(phase);
  const cls = {
    upcoming: 'res-pill--lifecycle-upcoming',
    active: 'res-pill--lifecycle-active',
    past: 'res-pill--lifecycle-completed',
  }[phase] || '';
  return `<span class="res-pill ${cls}">${escapeHtml(label)}</span>`;
}

export function lifecycleEventClass(phase) {
  if (phase === 'past') return 'mac-event--completed';
  if (phase === 'active') return 'mac-event--in-progress';
  return '';
}

export function recommendRooms(rooms, guestCount, limit = 3) {
  const count = Math.max(1, Number(guestCount) || 1);
  const available = (rooms || []).filter((r) => r.availability_status === 'available');

  return available
    .map((room) => {
      const waste = room.capacity_max - count;
      const overMin = count - room.capacity_min;
      return { room, waste, overMin };
    })
    .filter(({ waste, overMin }) => waste >= 0 && overMin >= 0)
    .sort((a, b) => {
      if (a.waste !== b.waste) return a.waste - b.waste;
      return (a.room.estimated_total || 0) - (b.room.estimated_total || 0);
    })
    .slice(0, limit)
    .map(({ room }, index) => ({ ...room, recommendation_rank: index + 1 }));
}

export function recommendationReason(room, guestCount) {
  const count = Math.max(1, Number(guestCount) || 1);
  const waste = room.capacity_max - count;
  if (waste === 0) return 'Fits your group exactly — no wasted space.';
  if (waste <= 1) return 'Best fit for your group size.';
  if (room.recommendation_rank === 1) return 'Lowest cost option that fits everyone.';
  return 'Good alternative if your first choice is taken.';
}

export function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function getReservationCategory(booking) {
  const status = normStatus(booking.status);
  if (status === 'cancelled') return 'cancelled';
  if (status !== 'approved') return null;
  const today = new Date().toISOString().slice(0, 10);
  const inDate = String(booking.check_in || '').slice(0, 10);
  const outDate = String(booking.check_out || '').slice(0, 10);
  if (outDate <= today) return 'completed';
  if (inDate > today) return 'upcoming';
  if (inDate <= today && outDate > today) return 'active';
  return 'upcoming';
}

export function emptyWizardState() {
  return {
    step: 1, mode: 'create', bookingId: null, fromRequestId: null, modifyRequest: false,
    guestModify: false, guestWasApproved: false,
    guestName: '', contactPhone: '', email: '', userId: '',
    checkIn: '', checkOut: '', guestCount: 2, roomId: '', selectedRoom: null,
    originalRoomId: '', originalCheckIn: '', originalCheckOut: '',
    originalRoomLabel: '', guestMessage: '',
    roomSearch: '', showRecommendations: false,
    meals: { Breakfast: 0, Lunch: 0, Dinner: 0, Snack: 0 },
    mealAllergenNotes: '',
    fees: [], originalFees: [], notes: '',
    expandedFeeGroupId: null,
    availableRooms: [], availableCount: 0,
    mealRates: { Breakfast: 175, Lunch: 225, Dinner: 225, Snack: 85 },
  };
}

export function filterRoomsList(rooms, { search = '', status = null, includeStatuses = null } = {}) {
  const q = String(search || '').trim().toLowerCase();
  const allowed = includeStatuses || (status ? (Array.isArray(status) ? status : [status]) : null);
  return (rooms || []).filter((room) => {
    if (allowed?.length && !allowed.includes(room.availability_status)) return false;
    if (!q) return true;
    const hay = [room.room_number, room.room_type, String(room.id)].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

export function mealsFromBooking(mealsArr = []) {
  const out = { Breakfast: 0, Lunch: 0, Dinner: 0, Snack: 0 };
  mealsArr.forEach((m) => {
    const type = m?.meal_type;
    if (!type) return;
    out[type] = Number(m.quantity) || 0;
  });
  return out;
}

export function calcMealsSubtotal(meals, rates) {
  return Object.entries(meals || {}).reduce((s, [t, q]) => s + (Number(rates[t]) || 0) * (Number(q) || 0), 0);
}

export function calcFeesSubtotal(fees = []) {
  return (fees || []).reduce((s, f) => s + Number(f.amount || 0), 0);
}

/** Guests may only keep existing fees or add catalog-listed extras (not custom lines). */
export function sanitizeGuestModifyFees(submitted = [], catalog = [], originalFees = []) {
  const catalogKeys = new Set(
    (catalog || []).map((f) => `${String(f.name || '').trim()}|${Number(f.amount)}`)
  );
  const originalKeys = new Set(
    (originalFees || []).map((f) => `${String(f.fee_name || '').trim()}|${Number(f.amount)}`)
  );
  return (submitted || []).filter((f) => {
    const key = `${String(f.fee_name || '').trim()}|${Number(f.amount)}`;
    return catalogKeys.has(key) || originalKeys.has(key);
  });
}

export function calcGrandTotal(roomTotal, meals, fees, rates) {
  return Math.round((Number(roomTotal || 0) + calcMealsSubtotal(meals, rates) + calcFeesSubtotal(fees)) * 100) / 100;
}

export const GROUP_WIZARD_STEPS = [
  { id: 1, label: 'Group Info', short: 'Who is visiting?' },
  { id: 2, label: 'Dates & Size', short: 'When and how many?' },
  { id: 3, label: 'Pick Rooms', short: 'Choose rooms' },
  { id: 4, label: 'Meals & Extras', short: 'Add meals or fees' },
  { id: 5, label: 'Confirm', short: 'Review and save' },
];

export function emptyGroupWizardState() {
  return {
    step: 1, mode: 'create', groupId: null, fromRequestId: null, modifyRequest: false,
    guestModify: false, guestWasApproved: false,
    groupName: '', contactName: '', contactPhone: '', email: '', userId: '',
    checkIn: '', checkOut: '', totalGuests: 10, roomsRequested: null,
    guestMessage: '',
    selectedRooms: [], availableRooms: [], availableCount: 0,
    roomSearch: '',
    meals: { Breakfast: 0, Lunch: 0, Dinner: 0, Snack: 0 },
    mealAllergenNotes: '',
    fees: [], originalFees: [], notes: '',
    expandedFeeGroupId: null,
    mealRates: { Breakfast: 175, Lunch: 225, Dinner: 225, Snack: 85 },
    loadingRooms: false, saving: false, error: null,
  };
}

export function assignedGuestTotal(rooms = []) {
  return rooms.reduce((s, r) => s + (Number(r.guest_count) || 0), 0);
}

export function calcGroupRoomTotal(rooms = [], availableRooms = []) {
  return rooms.reduce((sum, sel) => {
    const room = availableRooms.find((r) => String(r.id) === String(sel.room_id));
    const perGuest = sel.guest_count || 1;
    if (room?.estimated_total != null) {
      const baseGuests = Math.max(room.capacity_min, Math.min(perGuest, room.capacity_max));
      const ratio = room.estimated_total / (baseGuests || 1);
      return sum + ratio * perGuest;
    }
    return sum;
  }, 0);
}

export function calcGroupGrandTotal(state) {
  const roomTotal = state.selectedRooms.reduce((sum, sel) => {
    const room = state.availableRooms.find((r) => String(r.id) === String(sel.room_id));
    if (!room) return sum;
    const guests = sel.guest_count || 1;
    const est = room.estimated_total || 0;
    const refGuests = Math.max(room.capacity_min, Math.min(guests, room.capacity_max));
    return sum + (est / (refGuests || 1)) * guests;
  }, 0);
  return calcGrandTotal(roomTotal, state.meals, state.fees, state.mealRates);
}

export function availLabel(status) {
  const map = {
    available: { text: 'Available', cls: 'res-pill--approved' },
    dorm_min_guests: { text: 'Min 5 pax', cls: 'res-pill--pending' },
    booked: { text: 'Already Booked', cls: 'res-pill--rejected' },
    too_small: { text: 'Too Small', cls: 'res-pill--pending' },
    maintenance: { text: 'Maintenance', cls: 'res-pill--cancelled' },
    occupied: { text: 'Occupied', cls: 'res-pill--cancelled' },
    dirty: { text: 'Preparing', cls: 'res-pill--pending' },
  };
  return map[status] || map.booked;
}

let cachedFiscalYear = null;

export async function loadFiscalYearBounds(force = false) {
  if (cachedFiscalYear && !force) return cachedFiscalYear;
  const { getFiscalYear } = await import('/assets/js/services/api.js');
  cachedFiscalYear = await getFiscalYear();
  return cachedFiscalYear;
}

export function applyBookingDateBounds(checkInEl, checkOutEl, bounds) {
  if (!bounds) return;
  const min = bounds.minDate;
  const max = bounds.maxCheckInDate;
  if (checkInEl) {
    if (min) checkInEl.min = min;
    if (max) checkInEl.max = max;
    else checkInEl.removeAttribute('max');
  }
  if (checkOutEl && min) {
    checkOutEl.min = min;
    checkOutEl.removeAttribute('max');
  }
}

export function formatBookingWindowHint(bounds) {
  if (!bounds?.maxCheckInDate) return '';
  const months = bounds.bookingAdvanceMonths;
  return `Book up to ${months} month${months === 1 ? '' : 's'} ahead (latest check-in: ${formatDate(bounds.maxCheckInDate)}).`;
}
