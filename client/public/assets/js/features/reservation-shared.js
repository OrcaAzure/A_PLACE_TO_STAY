/** Shared reservation UI helpers */

export const MEAL_TYPE_LIST = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

export const WIZARD_STEPS = [
  { id: 1, label: 'Guest Info', short: 'Who is staying?' },
  { id: 2, label: 'Dates & Guests', short: 'When and how many?' },
  { id: 3, label: 'Pick a Room', short: 'Choose a room' },
  { id: 4, label: 'Meals & Extras', short: 'Add meals or fees' },
  { id: 5, label: 'Confirm', short: 'Review and save' },
];

export const QUICK_FEES = [
  { name: 'Extra Mattress', amount: 500 },
  { name: 'Extra Bed', amount: 450 },
  { name: 'Extra Chair', amount: 150 },
  { name: 'Cleaning Fee', amount: 300 },
];

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

export function cutoffDaysError(cutoffDays) {
  const days = Number(cutoffDays);
  if (days <= 0) return null;
  if (days === 1) return 'Cancellations must be made at least 1 day before check-in or the event date.';
  return `Cancellations must be made at least ${days} days before check-in or the event date.`;
}

export function canGuestCancelRoomBooking(booking, { todayStr = localDateStr(), cutoffDays = 1 } = {}) {
  const status = normStatus(booking.status);
  if (!['pending', 'approved'].includes(status)) return false;
  if (roomStayPhase(booking.startDate || booking.check_in, booking.endDate || booking.check_out, todayStr) !== 'upcoming') {
    return false;
  }
  return daysUntilDate(booking.startDate || booking.check_in, todayStr) >= Number(cutoffDays);
}

export function canGuestCancelVenueBooking(booking, { now = new Date(), cutoffDays = 1 } = {}) {
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
  const todayStr = localDateStr(now);
  return daysUntilDate(booking.eventDate || booking.startDate || booking.event_date, todayStr) >= Number(cutoffDays);
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

export function servicesToQuickFees(services = []) {
  const fees = [];
  for (const group of services) {
    for (const item of group.items || []) {
      fees.push({ name: item.item, amount: item.rate, category: group.category });
    }
  }
  return fees.length ? fees : QUICK_FEES;
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
    guestName: '', contactPhone: '', email: '', userId: '',
    checkIn: '', checkOut: '', guestCount: 2, roomId: '', selectedRoom: null,
    originalRoomId: '', originalCheckIn: '', originalCheckOut: '',
    originalRoomLabel: '', guestMessage: '',
    roomSearch: '', buildingFilter: '', showRecommendations: false,
    meals: { Breakfast: 0, Lunch: 0, Dinner: 0, Snack: 0 },
    fees: [], notes: '',
    availableRooms: [], availableCount: 0,
    mealRates: { Breakfast: 175, Lunch: 225, Dinner: 225, Snack: 85 },
    roomTotal: 0, loadingRooms: false, saving: false, error: null,
  };
}

export function filterRoomsList(rooms, { search = '', building = '', status = 'available' } = {}) {
  const q = String(search || '').trim().toLowerCase();
  return (rooms || []).filter((room) => {
    if (status && room.availability_status !== status) return false;
    if (building && room.building_name !== building) return false;
    if (!q) return true;
    const hay = [room.building_name, room.room_number, room.room_type, String(room.id)].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

export function mealsFromBooking(mealsArr = []) {
  const out = { Breakfast: 0, Lunch: 0, Dinner: 0, Snack: 0 };
  mealsArr.forEach((m) => { if (out[m.meal_type] != null) out[m.meal_type] = Number(m.quantity) || 0; });
  return out;
}

export function calcMealsSubtotal(meals, rates) {
  return Object.entries(meals || {}).reduce((s, [t, q]) => s + (Number(rates[t]) || 0) * (Number(q) || 0), 0);
}

export function calcFeesSubtotal(fees = []) {
  return (fees || []).reduce((s, f) => s + Number(f.amount || 0), 0);
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
    groupName: '', contactName: '', contactPhone: '', email: '', userId: '',
    checkIn: '', checkOut: '', totalGuests: 10, roomsRequested: null,
    guestMessage: '',
    selectedRooms: [], availableRooms: [], availableCount: 0,
    roomSearch: '', buildingFilter: '',
    meals: { Breakfast: 0, Lunch: 0, Dinner: 0, Snack: 0 },
    fees: [], notes: '',
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
    booked: { text: 'Already Booked', cls: 'res-pill--rejected' },
    too_small: { text: 'Too Small', cls: 'res-pill--pending' },
    maintenance: { text: 'Maintenance', cls: 'res-pill--cancelled' },
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

export function formatFiscalYearHint(bounds) {
  if (!bounds?.currentFiscalYear) return '';
  const fy = bounds.currentFiscalYear;
  const parts = [`Current fiscal year: ${fy.label} (${formatDate(fy.startDate)} – ${formatDate(fy.endDate)})`];
  if (bounds.maxCheckInDate) {
    parts.push(`Book up to ${bounds.bookingAdvanceMonths} month(s) ahead (latest check-in: ${formatDate(bounds.maxCheckInDate)})`);
  }
  return parts.join(' · ');
}
