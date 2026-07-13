/**
 * Client-side draft booking request (rooms + venues) before submit.
 */

const STORAGE_KEY = 'aptspace.guest.booking-request.v1';

function defaultState() {
  return {
    version: 1,
    updatedAt: null,
    items: [],
    groupTotalGuests: null,
    extras: {
      meals: {},
      fees: [],
      meal_allergen_notes: '',
    },
  };
}

export function loadBookingRequest() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items)) return defaultState();
    return { ...defaultState(), ...parsed, items: parsed.items };
  } catch {
    return defaultState();
  }
}

function saveState(state) {
  const next = { ...state, updatedAt: new Date().toISOString() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('aptspace:booking-request-changed', { detail: next }));
  return next;
}

export function clearBookingRequest() {
  return saveState(defaultState());
}

export function bookingRequestCount(state = loadBookingRequest()) {
  return state.items.length;
}

export function addBookingRequestItem(item) {
  const state = loadBookingRequest();
  const id = item.id || (typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `br-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);

  const duplicate = state.items.find((row) => {
    if (item.kind === 'room' && row.kind === 'room') {
      return String(row.roomId) === String(item.roomId)
        && row.checkIn === item.checkIn
        && row.checkOut === item.checkOut;
    }
    if (item.kind === 'venue' && row.kind === 'venue') {
      return String(row.facilityId) === String(item.facilityId)
        && row.eventDate === item.eventDate
        && row.startTime === item.startTime
        && row.endTime === item.endTime;
    }
    return false;
  });
  if (duplicate) {
    const err = new Error('This item is already in your booking request.');
    err.code = 'DUPLICATE';
    throw err;
  }

  state.items.push({ ...item, id });
  return saveState(state);
}

export function removeBookingRequestItem(id) {
  const state = loadBookingRequest();
  state.items = state.items.filter((row) => row.id !== id);
  return saveState(state);
}

export function updateBookingRequestItem(id, patch) {
  const state = loadBookingRequest();
  const idx = state.items.findIndex((row) => row.id === id);
  if (idx === -1) return state;
  state.items[idx] = { ...state.items[idx], ...patch };
  return saveState(state);
}

export function roomItems(state = loadBookingRequest()) {
  return state.items.filter((row) => row.kind === 'room');
}

export function assignedRoomGuests(state = loadBookingRequest()) {
  return roomItems(state).reduce((sum, row) => sum + Math.max(1, Number(row.guestCount) || 1), 0);
}

export function getGroupTotalGuests(state = loadBookingRequest()) {
  const n = state.groupTotalGuests;
  return n == null ? null : Math.max(1, Number(n) || 1);
}

export function setGroupTotalGuests(count, state = loadBookingRequest()) {
  state.groupTotalGuests = Math.max(1, Number(count) || 1);
  return saveState(state);
}

export function roomGuestLimits(row, state = loadBookingRequest()) {
  const minGuests = row.isDorm
    ? Math.max(Number(row.capacityMin) || 1, Number(row.dormBookingMinimum) || 5)
    : Math.max(1, Number(row.capacityMin) || 1);
  const capacityMax = Math.max(minGuests, Number(row.capacityMax) || 99);
  const groupTotal = getGroupTotalGuests(state);
  const rooms = roomItems(state);

  if (!groupTotal || rooms.length < 2) {
    return { min: minGuests, max: capacityMax };
  }

  const current = Math.max(1, Number(row.guestCount) || 1);
  const others = assignedRoomGuests(state) - current;
  const max = Math.min(capacityMax, Math.max(minGuests, groupTotal - others));
  return { min: minGuests, max };
}

export function groupGuestAssignmentStatus(state = loadBookingRequest()) {
  const rooms = roomItems(state);
  const assigned = assignedRoomGuests(state);
  const groupTotal = getGroupTotalGuests(state);
  if (rooms.length < 2 || groupTotal == null) {
    return { assigned, groupTotal, matches: true, remaining: null };
  }
  return {
    assigned,
    groupTotal,
    matches: assigned === groupTotal,
    remaining: groupTotal - assigned,
  };
}

export function venueItems(state = loadBookingRequest()) {
  return state.items.filter((row) => row.kind === 'venue');
}

export function sharedStayDates(state = loadBookingRequest()) {
  const rooms = roomItems(state);
  if (!rooms.length) return null;
  return { checkIn: rooms[0].checkIn, checkOut: rooms[0].checkOut };
}

export function getBookingRequestExtras(state = loadBookingRequest()) {
  return state.extras || defaultState().extras;
}

export function saveBookingRequestExtras(patch, state = loadBookingRequest()) {
  state.extras = { ...getBookingRequestExtras(state), ...patch };
  return saveState(state);
}

export function estimatedRequestTotal(state = loadBookingRequest()) {
  const lodging = state.items.reduce((sum, row) => sum + Number(row.estimatedTotal || 0), 0);
  const extras = getBookingRequestExtras(state);
  const fees = (extras.fees || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  return lodging + fees;
}
