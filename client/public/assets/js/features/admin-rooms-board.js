/**
 * Admin rooms board — live housekeeping status, grouped by building.
 */

import { getRoomsOverview } from '/assets/js/services/api.js';
import {
  liveStatusBadge,
  roomTypeImage,
} from '/assets/js/features/facility-display.js';

const state = {
  overview: null,
  filter: { search: '', status: '', roomType: '' },
  loading: false,
};

/** @type {Map<string, string>} */
let roomTypeLabels = new Map();

let boardInitialized = false;
/** @type {(() => void) | null} */
let onRoomsChanged = null;

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

function filterRoomsClient(rooms) {
  const q = state.filter.search.trim().toLowerCase();
  const typeFilter = state.filter.roomType;
  return (rooms || []).filter((room) => {
    if (typeFilter && (room.room_type || 'Room') !== typeFilter) return false;
    if (!q) return true;
    const hay = [
      room.room_number,
      room.building_name,
      room.room_type,
      room.room_type_label,
      liveStatusBadge(room.status).label,
    ].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

function renderStats(summary) {
  const mount = document.getElementById('rooms-board-stats');
  if (!mount || !summary) return;

  const current = state.filter.status;

  function statCard(filter, value, label, toneClass) {
    const active = filter === current;
    return `
      <button type="button" class="rooms-stat ${toneClass}${active ? ' is-active' : ''}" data-rooms-stat-filter="${filter}" aria-pressed="${active ? 'true' : 'false'}" aria-label="${label}: ${value}. Tap to filter the list.">
        <span class="rooms-stat__value">${value}</span>
        <span class="rooms-stat__label">${label}</span>
      </button>`;
  }

  mount.innerHTML = `
    ${statCard('', summary.total, 'All rooms', '')}
    ${statCard('Available', summary.available, 'Vacant', 'rooms-stat--vacant')}
    ${statCard('Occupied', summary.occupied, 'Occupied', 'rooms-stat--busy')}
    ${statCard('Dirty', summary.dirty || 0, 'Dirty', 'rooms-stat--dirty')}
    ${statCard('Maintenance', summary.maintenance, 'Out of order', 'rooms-stat--repair')}`;
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
        <div class="fac-room-card__links">
          <a href="calendar.html?q=${encodeURIComponent(room.room_number || '')}" class="fac-room-card__link">Calendar</a>
          <a href="reservations.html?tab=rooms" class="fac-room-card__link">Bookings</a>
        </div>
      </div>
    </button>`;
}

function renderBuildingSection(building, { singleBuilding = false } = {}) {
  const rooms = filterRoomsClient(building.rooms);
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

function renderBoard() {
  const mount = document.getElementById('rooms-board-mount');
  if (!mount) return;

  const overview = state.overview;
  if (!overview) {
    mount.innerHTML = '<p class="rooms-board-message">Loading rooms…</p>';
    return;
  }

  renderStats(overview.summary);
  renderRoomTypeFilters();

  const singleBuilding = (overview.buildings || []).length <= 1;
  const sections = (overview.buildings || [])
    .map((b) => renderBuildingSection(b, { singleBuilding }))
    .filter(Boolean);

  const resultCount = overview.buildings.reduce((n, b) => n + filterRoomsClient(b.rooms).length, 0);

  const countEl = document.getElementById('rooms-board-result-count');
  if (countEl) {
    countEl.textContent = resultCount
      ? `${resultCount} room${resultCount === 1 ? '' : 's'} shown`
      : 'No rooms match your filters';
  }

  if (!sections.length) {
    mount.innerHTML = `
      <div class="rooms-board-empty">
        <span class="material-symbols-outlined" aria-hidden="true">search_off</span>
        <p class="rooms-board-empty__title">No rooms found</p>
        <p class="rooms-board-empty__text">Try a different search, room type, or tap a stat above to change status.</p>
        <button type="button" class="admin-crud-btn-ghost" data-rooms-clear-filters>Clear filters</button>
      </div>`;
    return;
  }

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

async function loadBoard() {
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

function openRoom(roomId) {
  window.dispatchEvent(new CustomEvent('manage-facilities:open', {
    detail: { roomId: Number(roomId), edit: false },
  }));
}

export function initRoomsBoard() {
  if (boardInitialized) return;
  boardInitialized = true;

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
  if (onRoomsChanged) {
    window.removeEventListener('rooms:changed', onRoomsChanged);
    onRoomsChanged = null;
  }
  boardInitialized = false;
}

export async function bootstrapRoomsBoard() {
  initRoomsBoard();
  await loadBoard();
}

export function refreshRoomsBoard() {
  return loadBoard();
}
