/**
 * Admin rooms board — live housekeeping status, grouped by building.
 */

import { getRoomsOverview } from '/assets/js/services/api.js';
import { getRoomSetupMeta } from '/assets/js/features/manage-facilities.js';
import {
  liveStatusBadge,
  roomTypeIcon,
  roomTypeImage,
} from '/assets/js/features/facility-display.js';

const state = {
  overview: null,
  filter: { search: '', status: '', setup: 'all' },
  loading: false,
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

function matchesSetupFilter(room, setupId) {
  if (setupId === 'all') return true;
  const meta = getRoomSetupMeta(room);
  if (setupId === 'sleep') return meta.tone === 'sleep';
  if (setupId === 'meeting') return meta.tone === 'meeting';
  if (setupId === 'guest') return meta.tone === 'guest';
  return true;
}

function filterRoomsClient(rooms) {
  const q = state.filter.search.trim().toLowerCase();
  return (rooms || []).filter((room) => {
    if (!matchesSetupFilter(room, state.filter.setup)) return false;
    if (!q) return true;
    const hay = [
      room.room_number,
      room.building_name,
      room.room_type,
      getRoomSetupMeta(room).label,
      liveStatusBadge(room.status).label,
    ].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

function renderStats(summary) {
  const mount = document.getElementById('rooms-board-stats');
  if (!mount || !summary) return;

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
  const roomType = room.room_type_label || room.room_type || 'Room';
  const icon = roomTypeIcon(roomType);
  const img = roomTypeImage(roomType);
  const badge = liveStatusBadge(room.status);

  const capMin = room.capacity_min ?? 1;
  const capMax = room.capacity_max ?? capMin;

  return `
    <button type="button" class="fac-room-card" data-room-id="${room.id}" aria-label="Update room ${escapeHtml(room.room_number)}">
      <div class="fac-room-card__media">
        <img src="${img}" alt="${escapeHtml(roomType)} room ${escapeHtml(room.room_number)}" loading="lazy" />
        <div class="fac-room-card__overlay" aria-hidden="true"></div>
        <span class="fac-room-card__badge ${badge.badge}">${escapeHtml(badge.label)}</span>
      </div>
      <div class="fac-room-card__body">
        <div class="fac-room-card__title-row">
          <div>
            <p class="fac-room-card__building">${escapeHtml(room.building_name || 'Building')}</p>
            <h3 class="fac-room-card__title">
              <span class="material-symbols-outlined" aria-hidden="true">${escapeHtml(icon)}</span>
              Room ${escapeHtml(room.room_number)}
            </h3>
          </div>
          <span class="fac-room-card__capacity">
            <span class="material-symbols-outlined" aria-hidden="true">group</span>
            ${capMin}-${capMax}
          </span>
        </div>
        <p class="fac-room-card__type">${escapeHtml(roomType)}</p>
        <p class="fac-room-card__setup">
          <span class="material-symbols-outlined" aria-hidden="true">${escapeHtml(setup.icon)}</span>
          ${escapeHtml(setup.label)}
        </p>
        <p class="fac-room-card__hint">Tap to update setup or status</p>
        <div class="fac-room-card__links">
          <a href="calendar.html?q=${encodeURIComponent(room.room_number || room.building_name || '')}" class="fac-room-card__link">View on calendar</a>
          <a href="reservations.html?tab=rooms" class="fac-room-card__link">Manage bookings</a>
        </div>
      </div>
    </button>`;
}

function renderBuildingSection(building) {
  const rooms = filterRoomsClient(building.rooms);
  if (!rooms.length) return '';

  return `
    <section class="fac-building-group">
      <div class="fac-building-group__head">
        <h4>${escapeHtml(building.name)}</h4>
        <span class="fac-building-group__count">${rooms.length} room${rooms.length === 1 ? '' : 's'}</span>
        <div class="fac-building-group__rule" aria-hidden="true"></div>
      </div>
      <div class="fac-room-list">
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
    countEl.textContent = resultCount
      ? `${resultCount} room${resultCount === 1 ? '' : 's'} shown`
      : 'No rooms match your filters';
  }

  if (!sections.length) {
    mount.innerHTML = `
      <div class="rooms-board-empty">
        <span class="material-symbols-outlined" aria-hidden="true">search_off</span>
        <p class="rooms-board-empty__title">No rooms found</p>
        <p class="rooms-board-empty__text">Try a different search, status filter, or setup type.</p>
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

function setStatusFilter(status) {
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

function clearFilters() {
  state.filter = { search: '', status: '', setup: 'all' };
  const search = document.getElementById('rooms-board-search');
  if (search) search.value = '';
  setSetupFilter('all');
  setStatusFilter('');
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

  document.querySelectorAll('[data-rooms-status]').forEach((btn) => {
    btn.addEventListener('click', () => setStatusFilter(btn.getAttribute('data-rooms-status') || ''));
  });

  document.querySelectorAll('[data-rooms-setup]').forEach((btn) => {
    btn.addEventListener('click', () => setSetupFilter(btn.getAttribute('data-rooms-setup') || 'all'));
  });

  document.getElementById('rooms-board-mount')?.addEventListener('click', (e) => {
    const clear = e.target.closest('[data-rooms-clear-filters]');
    if (clear) {
      clearFilters();
      return;
    }
    const card = e.target.closest('[data-room-id]');
    if (card) openRoom(card.getAttribute('data-room-id'));
  });

  window.addEventListener('rooms:changed', () => loadBoard());
}

export async function bootstrapRoomsBoard() {
  initRoomsBoard();
  await loadBoard();
}

export function refreshRoomsBoard() {
  return loadBoard();
}
