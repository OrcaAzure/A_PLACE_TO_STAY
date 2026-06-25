/**
 * Admin rooms board — grouped by building, search & filters, click to manage.
 */

import { getRoomsOverview } from '/assets/js/services/api.js';
import { getRoomSetupMeta } from '/assets/js/features/manage-facilities.js';
import { roomStatusLabel, roomStatusMeta, ROOM_STATUS_VALUES } from '/assets/js/features/room-status.js';

const state = {
  overview: null,
  filter: { search: '', status: '', setup: 'all' },
  collapsed: new Set(),
  loading: false,
};

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

function statusTokens(status) {
  const tone = roomStatusMeta(status).tone;
  return {
    pill: `rooms-status rooms-status--${tone}`,
    dot: `rooms-status-dot rooms-status-dot--${tone}`,
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
      roomStatusLabel(room.status),
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
      <span class="rooms-stat__label">Check-out / dirty</span>
    </article>
    <article class="rooms-stat rooms-stat--repair">
      <span class="rooms-stat__value">${summary.maintenance}</span>
      <span class="rooms-stat__label">Out of order</span>
    </article>`;
}

function renderRoomCard(room) {
  const setup = getRoomSetupMeta(room);
  const tokens = statusTokens(room.status);
  const label = roomStatusLabel(room.status);

  return `
    <button type="button" class="rooms-card" data-room-id="${room.id}" aria-label="Open room ${escapeHtml(room.room_number)}">
      <div class="rooms-card__top">
        <span class="rooms-card__number">${escapeHtml(room.room_number)}</span>
        <span class="${tokens.pill}">
          <span class="${tokens.dot}" aria-hidden="true"></span>
          ${escapeHtml(label)}
        </span>
      </div>
      <p class="rooms-card__setup">
        <span class="material-symbols-outlined rooms-card__setup-icon" aria-hidden="true">${escapeHtml(setup.icon)}</span>
        ${escapeHtml(setup.label)}
      </p>
      <p class="rooms-card__meta">Up to ${room.capacity_max} guests · ${escapeHtml(room.room_type || 'Room')}</p>
    </button>`;
}

function renderBuildingSection(building) {
  const rooms = filterRoomsClient(building.rooms);
  if (!rooms.length) return '';

  const key = building.id ?? 'none';
  const collapsed = state.collapsed.has(String(key));
  const s = building.summary || {};

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
          <span class="rooms-building__count rooms-building__count--vacant">${s.available ?? 0} vacant</span>
          <span class="rooms-building__count rooms-building__count--busy">${s.occupied ?? 0} occupied</span>
          ${s.dirty ? `<span class="rooms-building__count rooms-building__count--dirty">${s.dirty} dirty</span>` : ''}
          ${s.maintenance ? `<span class="rooms-building__count rooms-building__count--repair">${s.maintenance} out of order</span>` : ''}
          <span class="rooms-building__total">${rooms.length} shown</span>
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

  const resultCount = sections.length
    ? (overview.buildings || []).reduce((n, b) => n + filterRoomsClient(b.rooms).length, 0)
    : 0;

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

  mount.innerHTML = `<div class="rooms-board-sections">${sections.join('')}</div>`;
}

async function loadBoard() {
  const mount = document.getElementById('rooms-board-mount');
  if (mount) mount.innerHTML = '<p class="rooms-board-message">Loading rooms…</p>';

  state.loading = true;
  try {
    state.overview = await getRoomsOverview({
      status: state.filter.status || undefined,
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
    state.collapsed.add(String(b.id ?? 'none'));
  });
  renderBoard();
}

function openRoom(roomId) {
  window.dispatchEvent(new CustomEvent('manage-facilities:open', {
    detail: { roomId: Number(roomId), edit: false },
  }));
}

function openAddRoom(buildingId = null) {
  window.dispatchEvent(new CustomEvent('manage-facilities:open', {
    detail: { create: true, buildingId },
  }));
}

export function initRoomsBoard() {
  const debouncedSearch = debounce(() => {
    const input = document.getElementById('rooms-board-search');
    state.filter.search = input?.value || '';
    renderBoard();
  });

  document.getElementById('rooms-board-search')?.addEventListener('input', debouncedSearch);

  document.querySelectorAll('[data-rooms-status]').forEach((btn) => {
    btn.addEventListener('click', () => setStatusFilter(btn.getAttribute('data-rooms-status') || ''));
  });

  document.querySelectorAll('[data-rooms-setup]').forEach((btn) => {
    btn.addEventListener('click', () => setSetupFilter(btn.getAttribute('data-rooms-setup') || 'all'));
  });

  document.getElementById('rooms-board-expand-all')?.addEventListener('click', expandAll);
  document.getElementById('rooms-board-collapse-all')?.addEventListener('click', collapseAll);
  document.getElementById('rooms-board-add')?.addEventListener('click', () => openAddRoom());

  document.getElementById('rooms-board-mount')?.addEventListener('click', (e) => {
    const toggle = e.target.closest('[data-building-toggle]');
    if (toggle) {
      toggleBuilding(toggle.getAttribute('data-building-toggle'));
      return;
    }
    const clear = e.target.closest('[data-rooms-clear-filters]');
    if (clear) {
      clearFilters();
      loadBoard();
      return;
    }
    const card = e.target.closest('[data-room-id]');
    if (card) openRoom(card.getAttribute('data-room-id'));
  });

  window.addEventListener('rooms:changed', loadBoard);
}

export async function bootstrapRoomsBoard() {
  initRoomsBoard();
  await loadBoard();
}

export { ROOM_STATUS_VALUES };
