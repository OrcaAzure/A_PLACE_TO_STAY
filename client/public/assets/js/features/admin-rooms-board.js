/**
 * Admin rooms board — grouped by building, search, live status or date availability.
 */

import { getRoomsOverview, getRoomAvailability } from '/assets/js/services/api.js';
import { getRoomSetupMeta } from '/assets/js/features/manage-facilities.js';
import { roomStatusLabel, roomStatusMeta } from '/assets/js/features/room-status.js';

const AVAIL_LABELS = {
  available: { label: 'Available', tone: 'vacant' },
  booked: { label: 'Booked', tone: 'occupied' },
  dirty: { label: 'Being cleaned', tone: 'dirty' },
  maintenance: { label: 'Out of order', tone: 'out-of-order' },
  occupied: { label: 'Occupied', tone: 'occupied' },
  too_small: { label: 'Too small', tone: 'out-of-order' },
};

const state = {
  overview: null,
  filter: { search: '', status: '', setup: 'all', availFilter: 'all' },
  collapsed: new Set(),
  loading: false,
  dateMode: false,
  datesPanelOpen: false,
  checkIn: '',
  checkOut: '',
  guestCount: 1,
  availabilityByRoomId: null,
  dateSummary: null,
};

let boardInitialized = false;

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

function addDays(iso, days) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDateRange(checkIn, checkOut) {
  const opts = { month: 'short', day: 'numeric', year: 'numeric' };
  const a = new Date(`${checkIn}T12:00:00`).toLocaleDateString('en-US', opts);
  const b = new Date(`${checkOut}T12:00:00`).toLocaleDateString('en-US', opts);
  return `${a} → ${b}`;
}

function statusTokens(status) {
  const tone = roomStatusMeta(status).tone;
  return {
    pill: `rooms-status rooms-status--${tone}`,
    dot: `rooms-status-dot rooms-status-dot--${tone}`,
  };
}

function availTokens(availStatus) {
  const meta = AVAIL_LABELS[availStatus] || AVAIL_LABELS.booked;
  return {
    label: meta.label,
    pill: `rooms-status rooms-status--${meta.tone}`,
    dot: `rooms-status-dot rooms-status-dot--${meta.tone}`,
  };
}

function matchesSetupFilter(room, setupId) {
  if (setupId === 'all') return true;
  const meta = getRoomSetupMeta(room);
  if (setupId === 'sleep') return meta.tone === 'sleep';
  if (setupId === 'meeting') return meta.tone === 'meeting';
  if (setupId === 'guest') return meta.tone === 'guest';
  return true;
}

function matchesAvailFilter(room) {
  if (!state.dateMode || state.filter.availFilter === 'all') return true;
  const avail = state.availabilityByRoomId?.get(room.id)?.availability_status;
  if (state.filter.availFilter === 'available') return avail === 'available';
  if (state.filter.availFilter === 'booked') {
    return avail && avail !== 'available';
  }
  return true;
}

function filterRoomsClient(rooms) {
  const q = state.filter.search.trim().toLowerCase();
  return (rooms || []).filter((room) => {
    if (!matchesSetupFilter(room, state.filter.setup)) return false;
    if (!matchesAvailFilter(room)) return false;
    if (!q) return true;
    const avail = state.availabilityByRoomId?.get(room.id);
    const hay = [
      room.room_number,
      room.building_name,
      room.room_type,
      getRoomSetupMeta(room).label,
      state.dateMode ? (AVAIL_LABELS[avail?.availability_status]?.label || '') : roomStatusLabel(room.status),
    ].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

function setDateModeUi(on) {
  state.dateMode = on;
  document.getElementById('rooms-live-filters')?.classList.toggle('hidden', on);
  document.getElementById('rooms-date-filters')?.classList.toggle('hidden', !on);
  updateViewUi();
}

function updateViewUi() {
  const liveBtn = document.getElementById('rooms-view-live');
  const datesBtn = document.getElementById('rooms-view-dates');
  const dateBar = document.getElementById('rooms-date-bar');
  const onDates = state.datesPanelOpen;

  liveBtn?.classList.toggle('is-active', !onDates);
  liveBtn?.setAttribute('aria-selected', onDates ? 'false' : 'true');
  datesBtn?.classList.toggle('is-active', onDates);
  datesBtn?.setAttribute('aria-selected', onDates ? 'true' : 'false');
  dateBar?.classList.toggle('hidden', !onDates);
}

function setViewMode(mode) {
  if (mode === 'live') {
    state.datesPanelOpen = false;
    if (state.dateMode) clearDateMode();
    else updateViewUi();
    return;
  }
  state.datesPanelOpen = true;
  updateViewUi();
}

function renderStats(summary) {
  const mount = document.getElementById('rooms-board-stats');
  if (!mount || !summary) return;

  if (state.dateMode && state.dateSummary) {
    const s = state.dateSummary;
    mount.innerHTML = `
      <article class="rooms-stat">
        <span class="rooms-stat__value">${s.total}</span>
        <span class="rooms-stat__label">All rooms</span>
      </article>
      <article class="rooms-stat rooms-stat--vacant">
        <span class="rooms-stat__value">${s.available}</span>
        <span class="rooms-stat__label">Available for dates</span>
      </article>
      <article class="rooms-stat rooms-stat--busy">
        <span class="rooms-stat__value">${s.booked}</span>
        <span class="rooms-stat__label">Booked / blocked</span>
      </article>
      <article class="rooms-stat rooms-stat--dirty">
        <span class="rooms-stat__value">${s.dirty || 0}</span>
        <span class="rooms-stat__label">Being cleaned</span>
      </article>
      <article class="rooms-stat rooms-stat--repair">
        <span class="rooms-stat__value">${s.maintenance || 0}</span>
        <span class="rooms-stat__label">Out of order</span>
      </article>`;
    return;
  }

  mount.innerHTML = `
    <article class="rooms-stat">
      <span class="rooms-stat__value">${summary.total}</span>
      <span class="rooms-stat__label">All rooms</span>
    </article>
    <article class="rooms-stat rooms-stat--vacant">
      <span class="rooms-stat__value">${summary.available}</span>
      <span class="rooms-stat__label">Vacant</span>
    </article>
    <article class="rooms-stat rooms-stat--busy">
      <span class="rooms-stat__value">${summary.occupied}</span>
      <span class="rooms-stat__label">Occupied</span>
    </article>
    <article class="rooms-stat rooms-stat--dirty">
      <span class="rooms-stat__value">${summary.dirty || 0}</span>
      <span class="rooms-stat__label">Dirty</span>
    </article>
    <article class="rooms-stat rooms-stat--repair">
      <span class="rooms-stat__value">${summary.maintenance}</span>
      <span class="rooms-stat__label">Out of order</span>
    </article>`;
}

function renderRoomCard(room) {
  const setup = getRoomSetupMeta(room);
  let pillHtml;

  if (state.dateMode && state.availabilityByRoomId) {
    const avail = state.availabilityByRoomId.get(room.id);
    const tokens = availTokens(avail?.availability_status || 'booked');
    pillHtml = `<span class="${tokens.pill}"><span class="${tokens.dot}" aria-hidden="true"></span>${escapeHtml(tokens.label)}</span>`;
  } else {
    const tokens = statusTokens(room.status);
    pillHtml = `<span class="${tokens.pill}"><span class="${tokens.dot}" aria-hidden="true"></span>${escapeHtml(roomStatusLabel(room.status))}</span>`;
  }

  const avail = state.availabilityByRoomId?.get(room.id);
  const priceHint = state.dateMode && avail?.estimated_total
    ? `<p class="rooms-card__price">Est. ${escapeHtml(formatPeso(avail.estimated_total))} for stay</p>`
    : '';

  return `
    <button type="button" class="rooms-card" data-room-id="${room.id}" aria-label="Open room ${escapeHtml(room.room_number)}">
      <div class="rooms-card__top">
        <span class="rooms-card__number">${escapeHtml(room.room_number)}</span>
        ${pillHtml}
      </div>
      <p class="rooms-card__setup">
        <span class="material-symbols-outlined rooms-card__setup-icon" aria-hidden="true">${escapeHtml(setup.icon)}</span>
        ${escapeHtml(setup.label)}
      </p>
      <p class="rooms-card__meta">Up to ${room.capacity_max} guests · ${escapeHtml(room.room_type || 'Room')}</p>
      ${priceHint}
    </button>`;
}

function formatPeso(n) {
  return `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 0 })}`;
}

function renderBuildingSection(building) {
  const rooms = filterRoomsClient(building.rooms);
  if (!rooms.length) return '';

  const key = building.id ?? 'none';
  const collapsed = state.collapsed.has(String(key));
  const s = building.summary || {};

  let countsHtml;
  if (state.dateMode) {
    countsHtml = `
      <span class="rooms-building__count rooms-building__count--vacant">${s.available ?? 0} available</span>
      <span class="rooms-building__count rooms-building__count--busy">${s.booked ?? 0} booked</span>
      <span class="rooms-building__total">${rooms.length} shown</span>`;
  } else {
    countsHtml = `
      <span class="rooms-building__count rooms-building__count--vacant">${s.available ?? 0} vacant</span>
      <span class="rooms-building__count rooms-building__count--busy">${s.occupied ?? 0} occupied</span>
      ${s.dirty ? `<span class="rooms-building__count rooms-building__count--dirty">${s.dirty} dirty</span>` : ''}
      ${s.maintenance ? `<span class="rooms-building__count rooms-building__count--repair">${s.maintenance} out of order</span>` : ''}
      <span class="rooms-building__total">${rooms.length} shown</span>`;
  }

  return `
    <section class="rooms-building${collapsed ? ' is-collapsed' : ''}" data-building-key="${escapeHtml(String(key))}">
      <button type="button" class="rooms-building__header" data-building-toggle="${escapeHtml(String(key))}" aria-expanded="${collapsed ? 'false' : 'true'}">
        <div class="rooms-building__title-wrap">
          <span class="material-symbols-outlined rooms-building__icon" aria-hidden="true">apartment</span>
          <div>
            <h3 class="rooms-building__name">${escapeHtml(building.name)}</h3>
            ${building.description ? `<p class="rooms-building__desc">${escapeHtml(building.description)}</p>` : ''}
          </div>
        </div>
        <div class="rooms-building__counts">
          ${countsHtml}
          <span class="material-symbols-outlined rooms-building__chevron" aria-hidden="true">expand_more</span>
        </div>
      </button>
      <div class="rooms-building__grid">
        ${rooms.map(renderRoomCard).join('')}
      </div>
    </section>`;
}

function renderBoard() {
  const mount = document.getElementById('rooms-board-mount');
  if (!mount) return;

  const overview = state.overview;
  if (!overview) {
    mount.innerHTML = '<p class="rooms-board-message">Loading rooms…</p>';
    return;
  }

  renderStats(overview.summary);

  const sections = (overview.buildings || [])
    .map(renderBuildingSection)
    .filter(Boolean);

  const resultCount = overview.buildings.reduce((n, b) => n + filterRoomsClient(b.rooms).length, 0);

  const countEl = document.getElementById('rooms-board-result-count');
  if (countEl) {
    if (state.dateMode && state.checkIn && state.checkOut) {
      const range = formatDateRange(state.checkIn, state.checkOut);
      const avail = state.dateSummary?.available;
      const availNote = avail != null ? ` · ${avail} available` : '';
      countEl.textContent = resultCount
        ? `${range} · ${resultCount} room${resultCount === 1 ? '' : 's'} shown${availNote}`
        : `${range} · no rooms match`;
    } else {
      countEl.textContent = resultCount
        ? `${resultCount} room${resultCount === 1 ? '' : 's'} shown`
        : 'No rooms match your filters';
    }
  }

  if (!sections.length) {
    mount.innerHTML = `
      <div class="rooms-board-empty">
        <span class="material-symbols-outlined" aria-hidden="true">search_off</span>
        <p class="rooms-board-empty__title">No rooms found</p>
        <p class="rooms-board-empty__text">${state.dateMode ? 'Try different dates or clear the availability filter.' : 'Try a different search, status filter, or setup type.'}</p>
        <button type="button" class="admin-crud-btn-ghost" data-rooms-clear-filters>Clear filters</button>
      </div>`;
    return;
  }

  mount.innerHTML = `<div class="rooms-board-sections">${sections.join('')}</div>`;
}

function groupAvailabilityByBuilding(rooms) {
  const byBuilding = new Map();
  for (const room of rooms) {
    const name = room.building_name || 'Unassigned';
    if (!byBuilding.has(name)) {
      byBuilding.set(name, { id: name, name, description: null, rooms: [], summary: { total: 0, available: 0, booked: 0, dirty: 0, maintenance: 0 } });
    }
    const group = byBuilding.get(name);
    group.rooms.push(room);
    group.summary.total += 1;
    const st = room.availability_status;
    if (st === 'available') group.summary.available += 1;
    else if (st === 'dirty') group.summary.dirty += 1;
    else if (st === 'maintenance') group.summary.maintenance += 1;
    else group.summary.booked += 1;
  }
  return [...byBuilding.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function computeDateSummary(rooms) {
  let available = 0;
  let booked = 0;
  let dirty = 0;
  let maintenance = 0;
  for (const r of rooms) {
    const st = r.availability_status;
    if (st === 'available') available += 1;
    else if (st === 'dirty') dirty += 1;
    else if (st === 'maintenance') maintenance += 1;
    else booked += 1;
  }
  return { total: rooms.length, available, booked, dirty, maintenance };
}

async function loadBoard() {
  if (state.dateMode) {
    await checkDateAvailability();
    return;
  }

  const mount = document.getElementById('rooms-board-mount');
  if (mount) mount.innerHTML = '<p class="rooms-board-message">Loading rooms…</p>';

  state.loading = true;
  try {
    state.overview = await getRoomsOverview({
      status: state.filter.status || undefined,
      search: state.filter.search.trim() || undefined,
    });
  } catch (err) {
    if (mount) {
      mount.innerHTML = `<p class="rooms-board-message rooms-board-message--error">${escapeHtml(err.message || 'Could not load rooms.')}</p>`;
    }
    state.loading = false;
    return;
  }
  state.loading = false;
  renderBoard();
}

async function checkDateAvailability() {
  const checkIn = document.getElementById('rooms-avail-check-in')?.value || state.checkIn;
  const checkOut = document.getElementById('rooms-avail-check-out')?.value || state.checkOut;

  if (!checkIn || !checkOut) {
    alert('Please pick check-in and check-out dates.');
    return;
  }
  if (checkOut <= checkIn) {
    alert('Check-out must be after check-in.');
    return;
  }

  state.checkIn = checkIn;
  state.checkOut = checkOut;
  state.datesPanelOpen = true;
  setDateModeUi(true);

  const mount = document.getElementById('rooms-board-mount');
  const btn = document.getElementById('rooms-avail-check-btn');
  if (mount) mount.innerHTML = '<p class="rooms-board-message">Checking availability…</p>';
  if (btn) { btn.disabled = true; btn.textContent = '…'; }

  try {
    const data = await getRoomAvailability({
      check_in: checkIn,
      check_out: checkOut,
      guest_count: state.guestCount,
    });
    const rooms = data.rooms || [];
    state.availabilityByRoomId = new Map(rooms.map((r) => [r.id, r]));
    state.dateSummary = computeDateSummary(rooms);
    state.overview = {
      summary: state.dateSummary,
      buildings: groupAvailabilityByBuilding(rooms),
    };
    renderBoard();
  } catch (err) {
    if (mount) {
      mount.innerHTML = `<p class="rooms-board-message rooms-board-message--error">${escapeHtml(err.message || 'Could not check availability.')}</p>`;
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Go';
    }
  }
}

function clearDateMode() {
  state.dateMode = false;
  state.datesPanelOpen = false;
  state.availabilityByRoomId = null;
  state.dateSummary = null;
  state.filter.availFilter = 'all';
  setDateModeUi(false);
  document.querySelectorAll('[data-rooms-avail-filter]').forEach((btn) => {
    const active = btn.getAttribute('data-rooms-avail-filter') === 'all';
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  loadBoard();
}

function setStatusFilter(status) {
  if (state.dateMode) return;
  state.filter.status = status;
  document.querySelectorAll('[data-rooms-status]').forEach((btn) => {
    const active = btn.getAttribute('data-rooms-status') === status;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  loadBoard();
}

function setSetupFilter(setup) {
  state.filter.setup = setup;
  document.querySelectorAll('[data-rooms-setup]').forEach((btn) => {
    const active = btn.getAttribute('data-rooms-setup') === setup;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  renderBoard();
}

function setAvailFilter(filter) {
  state.filter.availFilter = filter;
  document.querySelectorAll('[data-rooms-avail-filter]').forEach((btn) => {
    const active = btn.getAttribute('data-rooms-avail-filter') === filter;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  renderBoard();
}

function clearFilters() {
  state.filter = { search: '', status: '', setup: 'all', availFilter: 'all' };
  const search = document.getElementById('rooms-board-search');
  if (search) search.value = '';
  setSetupFilter('all');
  if (state.dateMode) {
    setAvailFilter('all');
    renderBoard();
  } else {
    setStatusFilter('');
  }
}

function checkToday() {
  setViewMode('dates');
  const checkIn = dateOnly();
  const checkOut = addDays(checkIn, 1);
  const inEl = document.getElementById('rooms-avail-check-in');
  const outEl = document.getElementById('rooms-avail-check-out');
  if (inEl) inEl.value = checkIn;
  if (outEl) outEl.value = checkOut;
  checkDateAvailability();
}

function initDateInputs() {
  const today = dateOnly();
  const inEl = document.getElementById('rooms-avail-check-in');
  const outEl = document.getElementById('rooms-avail-check-out');
  if (inEl) {
    inEl.min = today;
    inEl.value = today;
  }
  if (outEl) {
    outEl.min = addDays(today, 1);
    outEl.value = addDays(today, 1);
  }
}

function toggleBuilding(key) {
  const id = String(key);
  if (state.collapsed.has(id)) state.collapsed.delete(id);
  else state.collapsed.add(id);
  renderBoard();
}

function expandAll() {
  state.collapsed.clear();
  renderBoard();
}

function collapseAll() {
  (state.overview?.buildings || []).forEach((b) => {
    state.collapsed.add(String(b.id ?? b.name ?? 'none'));
  });
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

  initDateInputs();

  const debouncedSearch = debounce(() => {
    const input = document.getElementById('rooms-board-search');
    state.filter.search = input?.value || '';
    if (state.dateMode) renderBoard();
    else loadBoard();
  });

  const searchInput = document.getElementById('rooms-board-search');
  searchInput?.addEventListener('input', debouncedSearch);
  searchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      state.filter.search = searchInput.value || '';
      if (state.dateMode) renderBoard();
      else loadBoard();
    }
  });

  document.querySelectorAll('[data-rooms-status]').forEach((btn) => {
    btn.addEventListener('click', () => setStatusFilter(btn.getAttribute('data-rooms-status') || ''));
  });

  document.querySelectorAll('[data-rooms-setup]').forEach((btn) => {
    btn.addEventListener('click', () => setSetupFilter(btn.getAttribute('data-rooms-setup') || 'all'));
  });

  document.querySelectorAll('[data-rooms-avail-filter]').forEach((btn) => {
    btn.addEventListener('click', () => setAvailFilter(btn.getAttribute('data-rooms-avail-filter') || 'all'));
  });

  document.getElementById('rooms-avail-check-btn')?.addEventListener('click', checkDateAvailability);
  document.getElementById('rooms-avail-today-btn')?.addEventListener('click', checkToday);
  document.getElementById('rooms-view-live')?.addEventListener('click', () => setViewMode('live'));
  document.getElementById('rooms-view-dates')?.addEventListener('click', () => setViewMode('dates'));

  updateViewUi();

  document.getElementById('rooms-board-expand-all')?.addEventListener('click', expandAll);
  document.getElementById('rooms-board-collapse-all')?.addEventListener('click', collapseAll);

  document.getElementById('rooms-board-mount')?.addEventListener('click', (e) => {
    const toggle = e.target.closest('[data-building-toggle]');
    if (toggle) {
      toggleBuilding(toggle.getAttribute('data-building-toggle'));
      return;
    }
    const clear = e.target.closest('[data-rooms-clear-filters]');
    if (clear) {
      clearFilters();
      return;
    }
    const card = e.target.closest('[data-room-id]');
    if (card) openRoom(card.getAttribute('data-room-id'));
  });

  window.addEventListener('rooms:changed', () => {
    if (state.dateMode) checkDateAvailability();
    else loadBoard();
  });

  window.addEventListener('booking:updated', () => {
    if (state.dateMode) checkDateAvailability();
  });
}

export async function bootstrapRoomsBoard() {
  initRoomsBoard();
  await loadBoard();
}

export function refreshRoomsBoard() {
  return loadBoard();
}
