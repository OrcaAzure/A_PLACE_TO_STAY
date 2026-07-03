/**
 * Admin rooms board — housekeeping status + optional stay-date availability.
 */

import { getRoomsOverview, getRoomAvailability } from '/assets/js/services/api.js';
import {
  liveStatusBadge,
  roomTypeImage,
  availabilityBadge,
} from '/assets/js/features/facility-display.js';
import { createBookingPoll } from '/assets/js/layout/booking-poll.js';

const state = {
  overview: null,
  filter: { search: '', status: '', roomType: '' },
  loading: false,
  viewMode: 'today',
  datePanelOpen: false,
  checkIn: '',
  checkOut: '',
  /** @type {Map<string, object> | null} */
  availability: null,
  availabilityLoading: false,
  availabilityError: '',
};

/** @type {Map<string, string>} */
let roomTypeLabels = new Map();

let boardInitialized = false;
/** @type {(() => void) | null} */
let onRoomsChanged = null;
/** @type {(() => void) | null} */
let stopBookingPoll = null;

function debounce(fn, ms = 280) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function dateOnly(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function formatShortDate(iso) {
  if (!iso) return '';
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function hasValidDateRange() {
  return Boolean(
    state.checkIn
    && state.checkOut
    && state.checkOut > state.checkIn,
  );
}

function isDateViewActive() {
  return state.viewMode === 'dates' && hasValidDateRange() && state.availability;
}

function normalizeRoomTypeFilterLabel(room) {
  const key = room.room_type || 'Room';
  if (key === 'Deluxe Apartment') return 'Deluxe Apartment';
  const raw = room.room_type_label || key;
  return String(raw).replace(/\s*\(\d+\s*(beds?|bedrooms?)\)/i, '').trim() || key;
}

function collectRoomTypes(overview) {
  const types = new Map();
  for (const building of overview?.buildings || []) {
    for (const room of building.rooms || []) {
      const key = room.room_type || 'Room';
      if (!types.has(key)) types.set(key, normalizeRoomTypeFilterLabel(room));
    }
  }
  roomTypeLabels = types;
  return [...types.entries()].sort((a, b) => a[1].localeCompare(b[1]));
}

function renderRoomTypeFilters() {
  const mount = document.getElementById('rooms-type-filter-options');
  if (!mount || !state.overview) return;

  const types = collectRoomTypes(state.overview);
  const current = state.filter.roomType;

  mount.innerHTML = `
    <button type="button" class="fac-filter-option${!current ? ' is-active' : ''}" data-rooms-type="" role="menuitem">All types</button>
    ${types.map(([key, label]) => `
      <button type="button" class="fac-filter-option${current === key ? ' is-active' : ''}" data-rooms-type="${escapeHtml(key)}" role="menuitem">${escapeHtml(label)}</button>
    `).join('')}`;
}

function availabilityForRoom(roomId) {
  return state.availability?.get(String(roomId)) || null;
}

function matchesStatusFilter(room) {
  const f = state.filter.status;
  if (!f) return true;

  if (isDateViewActive()) {
    const st = availabilityForRoom(room.id)?.availability_status || 'booked';
    if (f === 'avail-available') return st === 'available';
    if (f === 'avail-booked') return st === 'booked' || st === 'occupied';
    if (f === 'avail-blocked') return st === 'maintenance' || st === 'dirty';
    if (f === 'avail-too_small') return st === 'too_small';
    return true;
  }

  return room.status === f;
}

function filterRoomsClient(rooms, { includeStatus = true } = {}) {
  const q = state.filter.search.trim().toLowerCase();
  const typeFilter = state.filter.roomType;
  return (rooms || []).filter((room) => {
    if (typeFilter && (room.room_type || 'Room') !== typeFilter) return false;
    if (includeStatus && !matchesStatusFilter(room)) return false;
    if (!q) return true;

    const avail = availabilityForRoom(room.id);
    const availLabel = avail ? availabilityBadge(avail.availability_status).label : '';

    const hay = [
      room.room_number,
      room.building_name,
      room.room_type,
      room.room_type_label,
      liveStatusBadge(room.status).label,
      availLabel,
    ].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

function computeAvailabilitySummary(rooms) {
  const counts = {
    total: rooms.length,
    available: 0,
    booked: 0,
    blocked: 0,
    too_small: 0,
  };

  for (const room of rooms) {
    const st = availabilityForRoom(room.id)?.availability_status || 'booked';
    if (st === 'available') counts.available += 1;
    else if (st === 'booked' || st === 'occupied') counts.booked += 1;
    else if (st === 'maintenance' || st === 'dirty') counts.blocked += 1;
    else if (st === 'too_small') counts.too_small += 1;
    else counts.booked += 1;
  }

  return counts;
}

function renderStats(summary) {
  const mount = document.getElementById('rooms-board-stats');
  if (!mount) return;

  const current = state.filter.status;

  function statCard(filter, value, label, toneClass) {
    const active = filter === current;
    return `
      <button type="button" class="rooms-stat ${toneClass}${active ? ' is-active' : ''}" data-rooms-stat-filter="${filter}" aria-pressed="${active ? 'true' : 'false'}" aria-label="${label}: ${value}. Tap to filter the list.">
        <span class="rooms-stat__value">${value}</span>
        <span class="rooms-stat__label">${label}</span>
      </button>`;
  }

  if (isDateViewActive()) {
    mount.innerHTML = `
      ${statCard('', summary.total, 'All rooms', '')}
      ${statCard('avail-available', summary.available, 'Available', 'rooms-stat--vacant')}
      ${statCard('avail-booked', summary.booked, 'Booked', 'rooms-stat--busy')}
      ${statCard('avail-blocked', summary.blocked, 'Blocked', 'rooms-stat--dirty')}
      ${statCard('avail-too_small', summary.too_small, 'Too small', 'rooms-stat--repair')}`;
    return;
  }

  if (!summary.total && summary.total !== 0) return;

  mount.innerHTML = `
    ${statCard('', summary.total, 'All rooms', '')}
    ${statCard('Available', summary.available, 'Vacant', 'rooms-stat--vacant')}
    ${statCard('Occupied', summary.occupied, 'Occupied', 'rooms-stat--busy')}
    ${statCard('Dirty', summary.dirty || 0, 'Dirty', 'rooms-stat--dirty')}
    ${statCard('Maintenance', summary.maintenance, 'Out of order', 'rooms-stat--repair')}`;
}

function availNoteHtml(room) {
  if (!isDateViewActive()) return '';

  const avail = availabilityForRoom(room.id);
  const st = avail?.availability_status || 'booked';
  const badge = availabilityBadge(st);

  let tone = 'fac-room-card__avail-note--warn';
  if (st === 'available') tone = 'fac-room-card__avail-note--ok';
  if (st === 'booked' || st === 'maintenance') tone = 'fac-room-card__avail-note--bad';

    return `<p class="fac-room-card__avail-note ${tone}">${escapeHtml(badge.label)} for selected dates</p>`;
}

function roomCardTypeLabel(room) {
  const key = room.room_type || 'Room';
  const friendly = {
    Dorm: 'Group sleep',
    'Standard Apartment': 'Apartment',
    'Superior Guest Room': 'Superior guest room',
    'Deluxe Apartment': 'Deluxe apartment',
  };
  return friendly[key] || normalizeRoomTypeFilterLabel(room);
}

function renderRoomCard(room) {
  const roomType = roomCardTypeLabel(room);
  const img = roomTypeImage(room.room_type_label || room.room_type || roomType);
  const badge = liveStatusBadge(room.status);

  const capMin = room.capacity_min ?? 1;
  const capMax = room.capacity_max ?? capMin;
  const capLabel = capMin === capMax ? `${capMin} guests` : `${capMin}–${capMax} guests`;

  return `
    <button type="button" class="fac-room-card fac-room-card--board" data-room-id="${room.id}" aria-label="Room ${escapeHtml(room.room_number)}, ${escapeHtml(badge.label)}. Tap to update status.">
      <div class="fac-room-card__media">
        <img src="${img}" alt="" loading="lazy" />
        <div class="fac-room-card__overlay" aria-hidden="true"></div>
        <span class="fac-room-card__badge ${badge.badge}">${escapeHtml(badge.label)}</span>
      </div>
      <div class="fac-room-card__body">
        <h3 class="fac-room-card__title">Room ${escapeHtml(room.room_number)}</h3>
        <p class="fac-room-card__meta">${escapeHtml(roomType)} · ${capLabel}</p>
        ${availNoteHtml(room)}
        <div class="fac-room-card__links">
          <a href="calendar.html?q=${encodeURIComponent(room.room_number || '')}" class="fac-room-card__link">Calendar</a>
          <a href="reservations.html?tab=rooms" class="fac-room-card__link">Bookings</a>
        </div>
      </div>
    </button>`;
}

function renderBuildingSection(building, rooms, { singleBuilding = false } = {}) {
  if (!rooms.length) return '';

  const list = `
      <div class="fac-room-list fac-room-list--grid">
        ${rooms.map((room) => renderRoomCard(room)).join('')}
      </div>`;

  if (singleBuilding) {
    return `<section class="fac-building-group fac-building-group--flat">${list}</section>`;
  }

  return `
    <section class="fac-building-group">
      <div class="fac-building-group__head">
        <h4>${escapeHtml(building.name)}</h4>
        <span class="fac-building-group__count">${rooms.length} room${rooms.length === 1 ? '' : 's'}</span>
        <div class="fac-building-group__rule" aria-hidden="true"></div>
      </div>
      ${list}
    </section>`;
}

function collectVisibleRooms(overview) {
  const out = [];
  for (const building of overview?.buildings || []) {
    for (const room of filterRoomsClient(building.rooms)) {
      out.push({ building, room });
    }
  }
  return out;
}

function groupPaginatedRooms(entries) {
  const byBuilding = new Map();
  for (const { building, room } of entries) {
    const key = building.id ?? building.name;
    if (!byBuilding.has(key)) byBuilding.set(key, { building, rooms: [] });
    byBuilding.get(key).rooms.push(room);
  }
  return [...byBuilding.values()];
}

function updateBoardChrome(visibleCount, totalInView) {
  const countEl = document.getElementById('rooms-board-result-count');

  if (countEl) {
    if (state.availabilityLoading) {
      countEl.textContent = 'Checking availability…';
    } else if (isDateViewActive()) {
      const range = `${formatShortDate(state.checkIn)} – ${formatShortDate(state.checkOut)}`;
      countEl.textContent = visibleCount
        ? `${visibleCount} of ${totalInView} rooms · ${range}`
        : `No rooms match · ${range}`;
    } else {
      countEl.textContent = visibleCount
        ? `${visibleCount} room${visibleCount === 1 ? '' : 's'} · Housekeeping today`
        : 'No rooms match your filters';
    }
  }
}

function updateDatePlanUi() {
  const prompt = document.getElementById('rooms-plan-prompt');
  const panel = document.getElementById('rooms-date-plan');
  const feedback = document.getElementById('rooms-date-plan-feedback');
  const checkInEl = document.getElementById('rooms-plan-check-in');
  const checkOutEl = document.getElementById('rooms-plan-check-out');
  const closeBtn = document.getElementById('rooms-date-plan-close');

  const showPanel = state.datePanelOpen || isDateViewActive();
  prompt?.classList.toggle('hidden', showPanel);
  panel?.classList.toggle('hidden', !showPanel);

  if (closeBtn) {
    closeBtn.innerHTML = isDateViewActive()
      ? '<span class="material-symbols-outlined" aria-hidden="true">today</span> Back to today'
      : '<span class="material-symbols-outlined" aria-hidden="true">close</span> Close';
  }

  if (checkInEl && checkInEl.value !== state.checkIn) checkInEl.value = state.checkIn;
  if (checkOutEl && checkOutEl.value !== state.checkOut) checkOutEl.value = state.checkOut;

  if (!feedback) return;

  if (state.availabilityLoading) {
    feedback.classList.remove('hidden', 'is-error');
    feedback.classList.add('is-loading');
    feedback.textContent = 'Checking which rooms are open or booked…';
    return;
  }

  if (state.availabilityError) {
    feedback.classList.remove('hidden', 'is-loading');
    feedback.classList.add('is-error');
    feedback.textContent = state.availabilityError;
    return;
  }

  if (state.datePanelOpen && state.checkIn && state.checkOut && state.checkOut <= state.checkIn) {
    feedback.classList.remove('hidden', 'is-loading');
    feedback.classList.add('is-error');
    feedback.textContent = 'Check-out must be after check-in.';
    return;
  }

  if (isDateViewActive()) {
    const summary = computeAvailabilitySummary(
      (state.overview?.buildings || []).flatMap((b) => filterRoomsClient(b.rooms, { includeStatus: false })),
    );
    feedback.classList.remove('hidden', 'is-error', 'is-loading');
    feedback.textContent = `${summary.available} room${summary.available === 1 ? '' : 's'} open for these dates.`;
    return;
  }

  if (state.datePanelOpen) {
    feedback.classList.remove('hidden', 'is-error', 'is-loading');
    feedback.textContent = 'Choose check-in and check-out — the board updates automatically.';
    return;
  }

  feedback.classList.add('hidden');
  feedback.textContent = '';
}

function setDatePanelOpen(open) {
  state.datePanelOpen = open;
  updateDatePlanUi();
}

function readDateInputs() {
  const checkInEl = document.getElementById('rooms-plan-check-in');
  const checkOutEl = document.getElementById('rooms-plan-check-out');
  state.checkIn = checkInEl?.value || '';
  state.checkOut = checkOutEl?.value || '';

  if (state.checkIn && checkOutEl && !state.checkOut) {
    const next = new Date(`${state.checkIn}T12:00:00`);
    next.setDate(next.getDate() + 1);
    state.checkOut = dateOnly(next);
    checkOutEl.value = state.checkOut;
    checkOutEl.min = state.checkOut;
  }

  if (state.checkIn && checkOutEl) {
    checkOutEl.min = state.checkIn;
  }
}

async function loadAvailability() {
  if (!hasValidDateRange()) {
    state.availability = null;
    state.viewMode = 'today';
    state.availabilityError = '';
    return;
  }

  state.viewMode = 'dates';
  state.availabilityLoading = true;
  state.availabilityError = '';
  updateDatePlanUi();
  updateBoardChrome(0, 0);

  try {
    const data = await getRoomAvailability({
      check_in: state.checkIn,
      check_out: state.checkOut,
      guest_count: 1,
    });
    state.availability = new Map((data.rooms || []).map((r) => [String(r.id), r]));
    state.datePanelOpen = true;
  } catch (err) {
    state.availability = null;
    state.viewMode = 'today';
    state.availabilityError = err.message || 'Could not check availability for these dates.';
  } finally {
    state.availabilityLoading = false;
  }
}

function clearDatePlan({ closePanel = false } = {}) {
  state.checkIn = '';
  state.checkOut = '';
  state.viewMode = 'today';
  state.availability = null;
  state.availabilityError = '';
  state.filter.status = '';

  const checkInEl = document.getElementById('rooms-plan-check-in');
  const checkOutEl = document.getElementById('rooms-plan-check-out');
  if (checkInEl) checkInEl.value = '';
  if (checkOutEl) checkOutEl.value = '';

  if (closePanel) setDatePanelOpen(false);
  updateDatePlanUi();
}

async function onDateInputsChanged() {
  readDateInputs();
  state.filter.status = '';

  if (!state.checkIn && !state.checkOut) {
    state.viewMode = 'today';
    state.availability = null;
    state.availabilityError = '';
    updateDatePlanUi();
    await loadOverview();
    return;
  }

  if (!hasValidDateRange()) {
    state.viewMode = 'today';
    state.availability = null;
    updateDatePlanUi();
    renderBoard();
    return;
  }

  await loadAvailability();
  await loadOverview();
}

const debouncedDateChange = debounce(() => { onDateInputsChanged(); }, 350);

function renderBoard() {
  const mount = document.getElementById('rooms-board-mount');
  if (!mount) return;

  const overview = state.overview;
  updateDatePlanUi();

  if (state.loading && !overview) {
    mount.innerHTML = '<p class="rooms-board-message">Loading rooms…</p>';
    return;
  }

  if (!overview) {
    mount.innerHTML = '<p class="rooms-board-message">Loading rooms…</p>';
    return;
  }

  renderRoomTypeFilters();

  const candidateRooms = (overview.buildings || []).flatMap((b) => filterRoomsClient(b.rooms, { includeStatus: false }));

  const summary = isDateViewActive()
    ? computeAvailabilitySummary(candidateRooms)
    : overview.summary;

  renderStats(summary);

  const allVisible = collectVisibleRooms(overview);
  const resultCount = allVisible.length;
  const totalInView = isDateViewActive()
    ? candidateRooms.length
    : overview.buildings.reduce((n, b) => n + filterRoomsClient(b.rooms).length, 0);

  updateBoardChrome(resultCount, totalInView);

  if (state.availabilityLoading) {
    mount.innerHTML = '<p class="rooms-board-message">Checking availability…</p>';
    return;
  }

  if (!resultCount) {
    mount.innerHTML = `
      <div class="rooms-board-empty">
        <span class="material-symbols-outlined" aria-hidden="true">search_off</span>
        <p class="rooms-board-empty__title">No rooms found</p>
        <p class="rooms-board-empty__text">${isDateViewActive()
    ? 'Try different dates, clear filters, or close the date range filter.'
    : 'Try a different search, room type, or tap a stat above to change status.'}</p>
        <button type="button" class="admin-crud-btn-ghost" data-rooms-clear-filters>Clear filters</button>
      </div>`;
    return;
  }

  const singleBuilding = (overview.buildings || []).length <= 1;
  const grouped = groupPaginatedRooms(allVisible);
  const sections = grouped
    .map(({ building, rooms }) => renderBuildingSection(building, rooms, { singleBuilding }))
    .filter(Boolean);

  mount.innerHTML = `<div class="fac-board-sections">${sections.join('')}</div>`;
  highlightRoomFromQuery();
}

function highlightRoomFromQuery() {
  const roomId = new URLSearchParams(window.location.search).get('room');
  if (!roomId) return;
  requestAnimationFrame(() => {
    const card = document.querySelector(`.fac-room-card[data-room-id="${CSS.escape(roomId)}"]`);
    if (!card) return;
    card.classList.add('fac-room-card--highlighted');
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => card.classList.remove('fac-room-card--highlighted'), 6000);
  });
}

async function loadOverview({ background = false } = {}) {
  const mount = document.getElementById('rooms-board-mount');
  if (!background && mount && !state.overview) {
    mount.innerHTML = '<p class="rooms-board-message">Loading rooms…</p>';
  }

  if (!background) state.loading = true;
  try {
    const useServerStatus = !isDateViewActive() && state.filter.status && !state.filter.status.startsWith('avail-');
    state.overview = await getRoomsOverview({
      status: useServerStatus ? state.filter.status : undefined,
      search: state.filter.search.trim() || undefined,
    });
  } catch (err) {
    if (mount) {
      mount.innerHTML = `<p class="rooms-board-message rooms-board-message--error">${escapeHtml(err.message || 'Could not load rooms.')}</p>`;
    }
    state.loading = false;
    return false;
  }
  state.loading = false;
  renderBoard();
  return true;
}

async function loadBoard({ background = false } = {}) {
  if (isDateViewActive() || (state.datePanelOpen && hasValidDateRange())) {
    if (hasValidDateRange() && !state.availability && !state.availabilityLoading) {
      await loadAvailability();
    }
  }
  await loadOverview({ background });
}

function setRoomsFilterPanelOpen(open) {
  const panel = document.getElementById('rooms-filter-panel');
  const toggle = document.getElementById('rooms-filter-toggle');
  if (!panel) return;
  panel.classList.toggle('hidden', !open);
  toggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function updateRoomsFilterUi() {
  const label = document.getElementById('rooms-filter-label');
  const toggle = document.getElementById('rooms-filter-toggle');
  const clearBtn = document.querySelector('[data-rooms-clear-type-filter]');
  const active = Boolean(state.filter.roomType);

  if (label) {
    label.textContent = active
      ? (roomTypeLabels.get(state.filter.roomType) || state.filter.roomType)
      : 'Room type';
  }

  toggle?.classList.toggle('fac-filter-btn--active', active);
  clearBtn?.classList.toggle('hidden', !active);
}

function setRoomTypeFilter(roomType) {
  state.filter.roomType = roomType;
  updateRoomsFilterUi();
  renderBoard();
}

function setStatusFilter(status) {
  state.filter.status = status;
  if (isDateViewActive() || (state.filter.status && state.filter.status.startsWith('avail-'))) {
    renderBoard();
    return;
  }
  loadBoard();
}

function clearTypeFilter() {
  state.filter.roomType = '';
  updateRoomsFilterUi();
  renderRoomTypeFilters();
  setRoomsFilterPanelOpen(false);
  renderBoard();
}

function clearFilters() {
  state.filter = { search: '', status: '', roomType: '' };
  const search = document.getElementById('rooms-board-search');
  if (search) search.value = '';
  updateRoomsFilterUi();
  setRoomsFilterPanelOpen(false);
  loadBoard();
}

function openDatePlanPanel() {
  state.datePanelOpen = true;
  updateDatePlanUi();
  document.getElementById('rooms-date-plan')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeDatePlanPanel() {
  if (isDateViewActive()) {
    clearDatePlan({ closePanel: true });
    loadBoard();
    return;
  }
  state.datePanelOpen = false;
  updateDatePlanUi();
  renderBoard();
}

function openRoom(roomId) {
  window.dispatchEvent(new CustomEvent('manage-facilities:open', {
    detail: { roomId: Number(roomId), edit: false },
  }));
}

export function initRoomsBoard() {
  if (boardInitialized) return;
  boardInitialized = true;

  const today = dateOnly();
  const checkInEl = document.getElementById('rooms-plan-check-in');
  const checkOutEl = document.getElementById('rooms-plan-check-out');
  if (checkInEl) checkInEl.min = today;
  if (checkOutEl) checkOutEl.min = today;

  const debouncedSearch = debounce(() => {
    const input = document.getElementById('rooms-board-search');
    state.filter.search = input?.value || '';
    loadBoard();
  });

  const searchInput = document.getElementById('rooms-board-search');
  searchInput?.addEventListener('input', debouncedSearch);
  searchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      state.filter.search = searchInput.value || '';
      loadBoard();
    }
  });

  checkInEl?.addEventListener('change', debouncedDateChange);
  checkOutEl?.addEventListener('change', debouncedDateChange);

  document.getElementById('rooms-date-plan-open')?.addEventListener('click', openDatePlanPanel);
  document.getElementById('rooms-date-plan-close')?.addEventListener('click', closeDatePlanPanel);

  document.getElementById('rooms-date-plan-clear')?.addEventListener('click', () => {
    clearDatePlan();
    loadBoard();
  });

  document.getElementById('rooms-filter-panel')?.addEventListener('click', (e) => {
    const typeBtn = e.target.closest('[data-rooms-type]');
    if (typeBtn) {
      setRoomTypeFilter(typeBtn.getAttribute('data-rooms-type') || '');
      setRoomsFilterPanelOpen(false);
    }
  });

  document.querySelector('[data-rooms-clear-type-filter]')?.addEventListener('click', () => {
    clearTypeFilter();
  });

  document.getElementById('rooms-filter-toggle')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const panel = document.getElementById('rooms-filter-panel');
    setRoomsFilterPanelOpen(panel?.classList.contains('hidden'));
  });

  document.getElementById('rooms-board-stats')?.addEventListener('click', (e) => {
    const stat = e.target.closest('[data-rooms-stat-filter]');
    if (!stat) return;
    const next = stat.getAttribute('data-rooms-stat-filter') || '';
    setStatusFilter(next === state.filter.status ? '' : next);
    document.getElementById('rooms-board-mount')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  document.addEventListener('click', (e) => {
    if (!document.getElementById('fac-panel-rooms') || document.getElementById('fac-panel-rooms')?.classList.contains('hidden')) return;
    if (e.target.closest('.fac-filter-wrap')) return;
    setRoomsFilterPanelOpen(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setRoomsFilterPanelOpen(false);
  });

  document.getElementById('rooms-board-mount')?.addEventListener('click', (e) => {
    const clear = e.target.closest('[data-rooms-clear-filters]');
    if (clear) {
      clearFilters();
      return;
    }
    const card = e.target.closest('[data-room-id]');
    if (e.target.closest('.fac-room-card__link')) return;
    if (card) openRoom(card.getAttribute('data-room-id'));
  });

  onRoomsChanged = () => loadBoard();
  window.addEventListener('rooms:changed', onRoomsChanged);
  updateRoomsFilterUi();
}

export function teardownRoomsBoard() {
  stopBookingPoll?.();
  stopBookingPoll = null;
  if (onRoomsChanged) {
    window.removeEventListener('rooms:changed', onRoomsChanged);
    onRoomsChanged = null;
  }
  boardInitialized = false;
}

export async function bootstrapRoomsBoard() {
  initRoomsBoard();
  await loadBoard();
  stopBookingPoll?.();
  stopBookingPoll = createBookingPoll(() => loadBoard({ background: true }));
}

export function refreshRoomsBoard() {
  return loadBoard();
}
