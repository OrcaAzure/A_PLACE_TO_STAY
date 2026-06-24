/**
 * Manage Facilities modal — admin CRUD for rooms.
 */

import {
  getRooms,
  createRoom,
  updateRoom,
  deleteRoom,
} from '/assets/js/services/api.js';
import { animateModalOpen } from '/assets/js/layout/animations.js';

const ROOM_TYPES = [
  'Dorm',
  'Superior Guest Room',
  'Standard Apartment',
  'Deluxe 2 BR',
  'Deluxe 3 BR',
];

const ROOM_STATUSES = ['Available', 'Occupied', 'Maintenance'];

let initialized = false;
let previouslyFocused = null;
let dataChanged = false;

const state = {
  isOpen: false,
  loading: false,
  saving: false,
  mode: 'view',
  rooms: [],
  filtered: [],
  buildings: [],
  selectedId: null,
  filter: { search: '', status: 'all' },
  form: {},
  error: null,
  message: null,
  mobileForm: false,
};

function debounce(fn, ms = 300) {
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

function roomStatusBadge(status) {
  const key = String(status || 'available').toLowerCase();
  return `admin-crud-badge admin-crud-badge--${key}`;
}

function emptyForm() {
  return {
    building_id: '',
    room_number: '',
    room_type: ROOM_TYPES[0],
    capacity_min: 1,
    capacity_max: 2,
    occupancy: 0,
    status: 'Available',
  };
}

function roomToForm(r) {
  return {
    building_id: r.building_id ?? '',
    room_number: r.room_number ?? '',
    room_type: r.room_type ?? ROOM_TYPES[0],
    capacity_min: r.capacity_min ?? 1,
    capacity_max: r.capacity_max ?? 2,
    occupancy: r.occupancy ?? 0,
    status: r.status ?? 'Available',
  };
}

function extractBuildings(rooms) {
  const map = new Map();
  rooms.forEach((r) => {
    if (r.building_id && !map.has(r.building_id)) {
      map.set(r.building_id, r.building_name || `Building ${r.building_id}`);
    }
  });
  return [...map.entries()].map(([id, name]) => ({ id, name }));
}

function filterRooms() {
  const q = state.filter.search.trim().toLowerCase();
  const st = state.filter.status;
  state.filtered = state.rooms.filter((r) => {
    if (st !== 'all' && r.status !== st) return false;
    if (!q) return true;
    const hay = [r.room_number, r.building_name, r.room_type, r.status].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

function getSelected() {
  return state.rooms.find((r) => String(r.id) === String(state.selectedId)) || null;
}

function renderList() {
  const mount = document.getElementById('manage-facilities-list');
  const countEl = document.getElementById('manage-facilities-footer-count');
  if (!mount) return;

  if (state.loading && !state.rooms.length) {
    mount.innerHTML = '<p class="text-body-sm text-on-surface-variant p-4 text-center">Loading rooms…</p>';
    return;
  }

  if (!state.filtered.length) {
    mount.innerHTML = `
      <div class="admin-crud-empty">
        <span class="material-symbols-outlined">meeting_room</span>
        <p class="font-semibold text-on-surface">No rooms found</p>
        <p class="text-body-sm mt-1">Adjust filters or add a new room.</p>
      </div>`;
  } else {
    mount.innerHTML = state.filtered.map((r) => {
      const sel = String(r.id) === String(state.selectedId);
      return `
        <button type="button" data-room-id="${r.id}" class="admin-crud-list-item${sel ? ' is-selected' : ''}" role="option" aria-selected="${sel}">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="text-label-md font-bold text-on-surface truncate">${escapeHtml(r.room_number)}</p>
              <p class="text-body-sm text-on-surface-variant truncate">${escapeHtml(r.building_name || 'Building')}</p>
            </div>
            <span class="${roomStatusBadge(r.status)}">${escapeHtml(r.status)}</span>
          </div>
          <p class="text-body-sm text-on-surface-variant mt-2">${escapeHtml(r.room_type)}</p>
          <p class="text-[11px] text-on-surface-variant/70 mt-1">Cap. ${r.capacity_min}–${r.capacity_max} · Occ. ${r.occupancy ?? 0}</p>
        </button>`;
    }).join('');
  }

  if (countEl) {
    countEl.textContent = `Showing ${state.filtered.length} of ${state.rooms.length} rooms`;
  }
}

function renderFormFields() {
  const bldgOpts = state.buildings.map((b) =>
    `<option value="${b.id}"${String(b.id) === String(state.form.building_id) ? ' selected' : ''}>${escapeHtml(b.name)}</option>`
  ).join('');

  const typeOpts = ROOM_TYPES.map((t) =>
    `<option value="${t}"${state.form.room_type === t ? ' selected' : ''}>${escapeHtml(t)}</option>`
  ).join('');

  const statusOpts = ROOM_STATUSES.map((s) =>
    `<option value="${s}"${state.form.status === s ? ' selected' : ''}>${s}</option>`
  ).join('');

  return `
    <form id="manage-facilities-form" class="admin-crud-form-grid" novalidate>
      <div class="admin-crud-field">
        <label for="mf-building">Building</label>
        <select id="mf-building" name="building_id" required>
          <option value="">Select building…</option>
          ${bldgOpts}
        </select>
      </div>
      <div class="admin-crud-field">
        <label for="mf-room-number">Room number</label>
        <input id="mf-room-number" name="room_number" type="text" required value="${escapeHtml(state.form.room_number)}" placeholder="e.g. 101" />
      </div>
      <div class="admin-crud-field span-full">
        <label for="mf-room-type">Room type</label>
        <select id="mf-room-type" name="room_type" required>${typeOpts}</select>
      </div>
      <div class="admin-crud-field">
        <label for="mf-cap-min">Min capacity</label>
        <input id="mf-cap-min" name="capacity_min" type="number" min="1" required value="${escapeHtml(state.form.capacity_min)}" />
      </div>
      <div class="admin-crud-field">
        <label for="mf-cap-max">Max capacity</label>
        <input id="mf-cap-max" name="capacity_max" type="number" min="1" required value="${escapeHtml(state.form.capacity_max)}" />
      </div>
      <div class="admin-crud-field">
        <label for="mf-occupancy">Current occupancy</label>
        <input id="mf-occupancy" name="occupancy" type="number" min="0" required value="${escapeHtml(state.form.occupancy)}" />
      </div>
      <div class="admin-crud-field">
        <label for="mf-status">Status</label>
        <select id="mf-status" name="status">${statusOpts}</select>
      </div>
    </form>`;
}

function renderDetailView(r) {
  return `
    <div class="space-y-5">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Room ${escapeHtml(r.room_number)}</p>
          <h3 class="font-headline-sm text-on-surface mt-1">${escapeHtml(r.building_name || 'Building')}</h3>
          <p class="text-body-sm text-on-surface-variant">${escapeHtml(r.room_type)}</p>
        </div>
        <span class="${roomStatusBadge(r.status)}">${escapeHtml(r.status)}</span>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="admin-panel p-4 rounded-lg">
          <p class="text-[11px] font-bold uppercase text-on-surface-variant">Capacity</p>
          <p class="font-semibold text-on-surface mt-1">${r.capacity_min} – ${r.capacity_max} guests</p>
        </div>
        <div class="admin-panel p-4 rounded-lg">
          <p class="text-[11px] font-bold uppercase text-on-surface-variant">Occupancy</p>
          <p class="font-semibold text-on-surface mt-1">${r.occupancy ?? 0} currently occupied</p>
        </div>
      </div>
    </div>`;
}

function renderDetail() {
  const mount = document.getElementById('manage-facilities-detail');
  const actions = document.getElementById('manage-facilities-footer-actions');
  const feedback = document.getElementById('manage-facilities-feedback');
  const body = document.getElementById('manage-facilities-body');
  if (!mount || !actions) return;

  body?.classList.toggle('is-mobile-form', state.mobileForm && state.mode !== 'view');

  if (state.error) {
    feedback?.classList.remove('hidden');
    feedback.className = 'text-body-sm mt-1 text-error';
    feedback.textContent = state.error;
  } else if (state.message) {
    feedback?.classList.remove('hidden');
    feedback.className = 'text-body-sm mt-1 text-secondary';
    feedback.textContent = state.message;
  } else {
    feedback?.classList.add('hidden');
  }

  if (state.mode === 'create') {
    mount.innerHTML = `
      <div class="mb-4">
        <button type="button" id="manage-facilities-back" class="admin-crud-btn-ghost md:hidden mb-3">
          <span class="material-symbols-outlined text-[18px]">arrow_back</span> Back
        </button>
        <h3 class="font-headline-sm text-on-surface">Add Room</h3>
        <p class="text-body-sm text-on-surface-variant">Register a new facility unit in an existing building.</p>
      </div>
      ${renderFormFields()}`;
    actions.innerHTML = `
      <button type="button" id="manage-facilities-cancel" class="admin-crud-btn-ghost">Cancel</button>
      <button type="button" id="manage-facilities-save" class="admin-crud-btn-primary"${state.saving ? ' disabled' : ''}>
        <span class="material-symbols-outlined text-[18px]">save</span>
        ${state.saving ? 'Saving…' : 'Add Room'}
      </button>`;
    return;
  }

  if (state.mode === 'edit') {
    const r = getSelected();
    mount.innerHTML = `
      <div class="mb-4">
        <button type="button" id="manage-facilities-back" class="admin-crud-btn-ghost md:hidden mb-3">
          <span class="material-symbols-outlined text-[18px]">arrow_back</span> Back
        </button>
        <h3 class="font-headline-sm text-on-surface">Edit Room ${escapeHtml(r?.room_number || '')}</h3>
        <p class="text-body-sm text-on-surface-variant">Update room details and operational status.</p>
      </div>
      ${renderFormFields()}`;
    actions.innerHTML = `
      <button type="button" id="manage-facilities-cancel" class="admin-crud-btn-ghost">Cancel</button>
      <button type="button" id="manage-facilities-delete" class="admin-crud-btn-danger"${state.saving ? ' disabled' : ''}>
        <span class="material-symbols-outlined text-[18px]">delete</span> Delete
      </button>
      <button type="button" id="manage-facilities-save" class="admin-crud-btn-primary"${state.saving ? ' disabled' : ''}>
        <span class="material-symbols-outlined text-[18px]">save</span>
        ${state.saving ? 'Saving…' : 'Save Changes'}
      </button>`;
    return;
  }

  const selected = getSelected();
  if (!selected) {
    mount.innerHTML = `
      <div class="admin-crud-empty h-full min-h-[280px]">
        <span class="material-symbols-outlined">touch_app</span>
        <p class="font-semibold text-on-surface">Select a room</p>
        <p class="text-body-sm mt-1">Pick a room from the list or add a new one.</p>
      </div>`;
    actions.innerHTML = `
      <button type="button" id="manage-facilities-footer-close" class="admin-crud-btn-ghost">Close</button>`;
    return;
  }

  mount.innerHTML = renderDetailView(selected);
  actions.innerHTML = `
    <button type="button" id="manage-facilities-footer-close" class="admin-crud-btn-ghost">Close</button>
    <button type="button" id="manage-facilities-edit" class="admin-crud-btn-primary">
      <span class="material-symbols-outlined text-[18px]">edit</span> Edit
    </button>`;
}

function render() {
  renderList();
  renderDetail();
}

function readFormFromDom() {
  const form = document.getElementById('manage-facilities-form');
  if (!form) return state.form;
  const fd = new FormData(form);
  return {
    building_id: fd.get('building_id'),
    room_number: fd.get('room_number'),
    room_type: fd.get('room_type'),
    capacity_min: Number(fd.get('capacity_min')) || 1,
    capacity_max: Number(fd.get('capacity_max')) || 1,
    occupancy: Number(fd.get('occupancy')) || 0,
    status: fd.get('status') || 'Available',
  };
}

async function loadData() {
  state.loading = true;
  state.error = null;
  document.getElementById('manage-facilities-loading')?.classList.remove('hidden');
  render();

  try {
    state.rooms = await getRooms();
    state.buildings = extractBuildings(state.rooms);
    filterRooms();
    if (!state.selectedId && state.filtered.length) {
      state.selectedId = state.filtered[0].id;
    }
  } catch (err) {
    state.error = err.message || 'Failed to load rooms.';
  } finally {
    state.loading = false;
    document.getElementById('manage-facilities-loading')?.classList.add('hidden');
    render();
  }
}

function showModal() {
  const overlay = document.getElementById('manage-facilities-overlay');
  const modal = document.getElementById('manage-facilities-modal');
  previouslyFocused = document.activeElement;
  overlay?.classList.remove('hidden');
  modal?.classList.remove('hidden');
  overlay?.setAttribute('aria-hidden', 'false');
  modal?.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  const shell = modal?.querySelector('.admin-crud-shell');
  animateModalOpen(shell).catch(() => {});
  document.getElementById('manage-facilities-close')?.focus();
}

function hideModal() {
  const overlay = document.getElementById('manage-facilities-overlay');
  const modal = document.getElementById('manage-facilities-modal');
  overlay?.classList.add('hidden');
  modal?.classList.add('hidden');
  overlay?.setAttribute('aria-hidden', 'true');
  modal?.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  previouslyFocused?.focus?.();
  previouslyFocused = null;
}

function resetState() {
  state.mode = 'view';
  state.selectedId = null;
  state.form = emptyForm();
  state.error = null;
  state.message = null;
  state.mobileForm = false;
  state.filter = { search: '', status: 'all' };
  const search = document.getElementById('manage-facilities-search');
  const status = document.getElementById('manage-facilities-status-filter');
  if (search) search.value = '';
  if (status) status.value = 'all';
}

export function isManageFacilitiesModalOpen() {
  return state.isOpen;
}

export async function openManageFacilitiesModal() {
  if (state.isOpen) return;
  dataChanged = false;
  state.isOpen = true;
  showModal();
  await loadData();
  if (state.buildings.length && state.mode === 'create') {
    state.form.building_id = state.buildings[0].id;
  }
  window.dispatchEvent(new CustomEvent('manage-facilities:opened'));
}

export function closeManageFacilitiesModal() {
  if (!state.isOpen) return;
  state.isOpen = false;
  hideModal();
  resetState();
  render();
  if (dataChanged) {
    window.dispatchEvent(new CustomEvent('rooms:changed'));
  }
  window.dispatchEvent(new CustomEvent('manage-facilities:closed'));
}

function selectRoom(id) {
  state.selectedId = id;
  state.mode = 'view';
  state.mobileForm = true;
  state.error = null;
  state.message = null;
  render();
}

function startCreate() {
  state.mode = 'create';
  state.selectedId = null;
  state.form = emptyForm();
  if (state.buildings.length) state.form.building_id = state.buildings[0].id;
  state.mobileForm = true;
  state.error = null;
  state.message = null;
  render();
}

function startEdit() {
  const r = getSelected();
  if (!r) return;
  state.mode = 'edit';
  state.form = roomToForm(r);
  state.mobileForm = true;
  state.error = null;
  state.message = null;
  render();
}

function cancelForm() {
  state.mode = 'view';
  state.mobileForm = false;
  state.error = null;
  render();
}

async function saveForm() {
  state.form = readFormFromDom();
  state.saving = true;
  state.error = null;
  render();

  const payload = {
    building_id: Number(state.form.building_id),
    room_number: state.form.room_number,
    room_type: state.form.room_type,
    capacity_min: state.form.capacity_min,
    capacity_max: state.form.capacity_max,
    occupancy: state.form.occupancy,
    status: state.form.status,
  };

  try {
    if (state.mode === 'create') {
      await createRoom(payload);
      state.message = 'Room added successfully.';
      state.mode = 'view';
    } else if (state.mode === 'edit' && state.selectedId) {
      await updateRoom(state.selectedId, payload);
      state.message = 'Room updated successfully.';
      state.mode = 'view';
    }
    dataChanged = true;
    await loadData();
  } catch (err) {
    state.error = err.message || 'Could not save room.';
    render();
  } finally {
    state.saving = false;
    render();
  }
}

async function removeRoom() {
  if (!state.selectedId || state.saving) return;
  const r = getSelected();
  if (!r) return;
  if (!window.confirm(`Delete room ${r.room_number} in ${r.building_name}? This cannot be undone.`)) return;

  state.saving = true;
  state.error = null;
  render();

  try {
    await deleteRoom(state.selectedId);
    state.message = 'Room deleted.';
    state.selectedId = null;
    state.mode = 'view';
    state.mobileForm = false;
    dataChanged = true;
    await loadData();
  } catch (err) {
    state.error = err.message || 'Could not delete room.';
  } finally {
    state.saving = false;
    render();
  }
}

function handleClick(e) {
  const card = e.target.closest('[data-room-id]');
  if (card) {
    selectRoom(Number(card.getAttribute('data-room-id')));
    return;
  }
  if (e.target.closest('#manage-facilities-new')) {
    startCreate();
    return;
  }
  if (e.target.closest('#manage-facilities-edit')) {
    startEdit();
    return;
  }
  if (e.target.closest('#manage-facilities-save')) {
    saveForm();
    return;
  }
  if (e.target.closest('#manage-facilities-cancel') || e.target.closest('#manage-facilities-back')) {
    cancelForm();
    return;
  }
  if (e.target.closest('#manage-facilities-delete')) {
    removeRoom();
    return;
  }
  if (e.target.closest('#manage-facilities-footer-close')) {
    closeManageFacilitiesModal();
  }
}

export function initManageFacilitiesModal() {
  if (initialized) return;
  initialized = true;

  const debouncedSearch = debounce((val) => {
    state.filter.search = val;
    filterRooms();
    render();
  });

  document.getElementById('manage-facilities-close')?.addEventListener('click', closeManageFacilitiesModal);
  document.getElementById('manage-facilities-overlay')?.addEventListener('click', closeManageFacilitiesModal);

  document.getElementById('manage-facilities-search')?.addEventListener('input', (e) => {
    debouncedSearch(e.target.value);
  });

  document.getElementById('manage-facilities-status-filter')?.addEventListener('change', (e) => {
    state.filter.status = e.target.value;
    filterRooms();
    render();
  });

  document.getElementById('manage-facilities-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'manage-facilities-modal') {
      closeManageFacilitiesModal();
      return;
    }
    handleClick(e);
  });

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-open-manage-facilities]');
    if (trigger) {
      e.preventDefault();
      openManageFacilitiesModal();
    }
  });
}
