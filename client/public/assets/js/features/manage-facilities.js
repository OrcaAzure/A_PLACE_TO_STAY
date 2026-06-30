/**
 * Manage Facilities modal — admin CRUD for rooms.
 * Designed for simple room setup changes (e.g. conference → group sleep with mattresses).
 */

import {
  getRooms,
  getBuildings,
  createRoom,
  updateRoom,
  deleteRoom,
} from '/assets/js/services/api.js';
import { animateModalOpen } from '/assets/js/layout/animations.js';
import { roomStatusLabel, roomStatusOptions, roomStatusMeta } from '/assets/js/features/room-status.js';

const ROOM_TYPE_OPTIONS = [
  {
    value: 'Dorm',
    label: 'Group Sleep Room',
    subtitle: 'Mattresses on the floor',
    icon: 'night_shelter',
    capacity: { min: 5, max: 12 },
  },
  {
    value: 'Superior Guest Room',
    label: 'Superior Guest Room',
    subtitle: 'Standard beds, 1–4 people',
    icon: 'king_bed',
    capacity: { min: 1, max: 4 },
  },
  {
    value: 'Standard Apartment',
    label: 'Apartment',
    subtitle: 'Self-contained unit',
    icon: 'apartment',
    capacity: { min: 1, max: 4 },
  },
  {
    value: 'Deluxe Apartment',
    label: 'Deluxe Apartment',
    subtitle: '2 or 3 beds — set below',
    icon: 'holiday_village',
    capacity: { min: 1, max: 6 },
  },
];

const QUICK_SETUPS = [
  {
    id: 'group-sleep',
    label: 'Group Sleep',
    short: 'Mattresses for a big group',
    icon: 'night_shelter',
    type: 'Dorm',
    capacityMin: 5,
    capacityMax: 12,
  },
  {
    id: 'guest-room',
    label: 'Guest Room',
    short: 'Normal beds (1–4 guests)',
    icon: 'king_bed',
    type: 'Superior Guest Room',
    capacityMin: 1,
    capacityMax: 4,
  },
  {
    id: 'meeting-space',
    label: 'Meeting',
    short: 'Chairs & tables only',
    icon: 'groups',
    type: 'Superior Guest Room',
    capacityMin: 1,
    capacityMax: 15,
  },
];

const ROOM_STATUSES = roomStatusOptions().map((opt) => ({
  value: opt.value,
  label: opt.label,
  icon: opt.icon,
  tone: opt.tone,
}));

const FLEX_SPACE_PATTERN = /^(commons|chapel|conf(erence)?)/i;

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
  activeQuickSetup: null,
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
  const tone = roomStatusMeta(status).tone;
  return `admin-crud-badge admin-crud-badge--${tone}`;
}

function getTypeOption(value) {
  return ROOM_TYPE_OPTIONS.find((t) => t.value === value) || null;
}

function getTypeLabel(value, room) {
  if (room?.room_type === 'Deluxe Apartment' || value === 'Deluxe Apartment') {
    const r = room || { room_type: value, bed_count: null, room_number: '' };
    const beds = r.bed_count ?? (['201', '304'].includes(String(r.room_number)) ? 3 : 2);
    return beds >= 3 ? 'Deluxe Apartment (3 beds)' : 'Deluxe Apartment';
  }
  return getTypeOption(value)?.label || value || 'Room';
}

/** Human-friendly label for how a room is currently set up (grid, list, detail). */
export function getRoomSetupMeta(room) {
  if (!room) return { label: 'Room', icon: 'meeting_room', tone: 'guest', presetId: null };
  const flex = isFlexOrMeetingSpace(room);
  if (room.room_type === 'Dorm') {
    return { label: 'Group Sleep', icon: 'night_shelter', tone: 'sleep', presetId: 'group-sleep' };
  }
  if (flex && Number(room.capacity_max) > 6) {
    return { label: 'Meeting Space', icon: 'groups_3', tone: 'meeting', presetId: 'meeting-space' };
  }
  if (flex) {
    return { label: 'Meeting / Conference', icon: 'groups_3', tone: 'meeting', presetId: 'meeting-space' };
  }
  const opt = getTypeOption(room.room_type);
  const label = room.room_type === 'Deluxe Apartment'
    ? getTypeLabel('Deluxe Apartment', room)
    : (opt?.label || room.room_type || 'Guest Room');
  return {
    label,
    icon: opt?.icon || 'king_bed',
    tone: 'guest',
    presetId: room.room_type === 'Superior Guest Room' ? 'guest-room' : null,
  };
}

function getActivePresetId(room) {
  return getRoomSetupMeta(room).presetId;
}

function isFlexOrMeetingSpace(room) {
  if (!room) return false;
  const num = String(room.room_number || '');
  return FLEX_SPACE_PATTERN.test(num) || /conference|commons|chapel|meeting/i.test(num);
}

function emptyForm() {
  const first = ROOM_TYPE_OPTIONS[1];
  return {
    building_id: '',
    room_number: '',
    room_type: first.value,
    bed_count: 2,
    capacity_min: first.capacity.min,
    capacity_max: first.capacity.max,
    occupancy: 0,
    status: 'Available',
  };
}

function roomToForm(r) {
  const fallback = ROOM_TYPE_OPTIONS[1];
  const typeOpt = getTypeOption(r.room_type);
  return {
    building_id: r.building_id ?? '',
    room_number: r.room_number ?? '',
    room_type: r.room_type ?? fallback.value,
    bed_count: r.bed_count ?? (['201', '304'].includes(String(r.room_number)) ? 3 : 2),
    capacity_min: r.capacity_min ?? typeOpt?.capacity.min ?? fallback.capacity.min,
    capacity_max: r.capacity_max ?? typeOpt?.capacity.max ?? fallback.capacity.max,
    occupancy: r.occupancy ?? 0,
    status: r.status ?? 'Available',
  };
}

function extractBuildingsFromRooms(rooms) {
  const map = new Map();
  rooms.forEach((r) => {
    if (r.building_id && !map.has(r.building_id)) {
      map.set(r.building_id, r.building_name || `Building ${r.building_id}`);
    }
  });
  return [...map.entries()].map(([id, name]) => ({ id, name }));
}

function mergeBuildings(apiBuildings, roomBuildings) {
  const map = new Map();
  (apiBuildings || []).forEach((b) => map.set(String(b.id), { id: b.id, name: b.name }));
  roomBuildings.forEach((b) => {
    if (!map.has(String(b.id))) map.set(String(b.id), b);
  });
  return [...map.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function filterRooms() {
  const q = state.filter.search.trim().toLowerCase();
  const st = state.filter.status;
  state.filtered = state.rooms.filter((r) => {
    if (st !== 'all' && r.status !== st) return false;
    if (!q) return true;
    const hay = [r.room_number, r.building_name, r.room_type, getTypeLabel(r.room_type), r.status].join(' ').toLowerCase();
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
        <p class="text-body-sm mt-1">Try a different search, or add a new room.</p>
      </div>`;
  } else {
    mount.innerHTML = state.filtered.map((r) => {
      const sel = String(r.id) === String(state.selectedId);
      const setup = getRoomSetupMeta(r);
      return `
        <button type="button" data-room-id="${r.id}" class="admin-crud-list-item${sel ? ' is-selected' : ''}" role="option" aria-selected="${sel}">
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0">
              <p class="text-label-md font-bold text-on-surface truncate">${escapeHtml(r.room_number)}</p>
              <p class="text-body-sm text-on-surface-variant truncate">${escapeHtml(r.building_name || 'Building')} · ${escapeHtml(setup.label)}</p>
            </div>
            <span class="${roomStatusBadge(r.status)}">${escapeHtml(roomStatusLabel(r.status))}</span>
          </div>
        </button>`;
    }).join('');
  }

  if (countEl) {
    countEl.textContent = `Showing ${state.filtered.length} of ${state.rooms.length} rooms`;
  }
}

function renderRoomTypeCards() {
  const current = state.form.room_type;
  const knownValues = new Set(ROOM_TYPE_OPTIONS.map((t) => t.value));
  const extraOption = current && !knownValues.has(current)
    ? [{ value: current, label: current, subtitle: 'Current type', icon: 'meeting_room', capacity: { min: 1, max: state.form.capacity_max || 4 } }]
    : [];

  const options = [...ROOM_TYPE_OPTIONS, ...extraOption];

  return `
    <div class="admin-crud-field span-full">
      <label class="mf-field-label">What kind of space is this?</label>
      <p class="mf-field-hint">Choose the setup that matches how the room is being used right now.</p>
      <div class="mf-type-grid" role="radiogroup" aria-label="Room type">
        ${options.map((opt) => {
          const active = state.form.room_type === opt.value;
          return `
            <button
              type="button"
              class="mf-type-card${active ? ' is-selected' : ''}"
              data-room-type="${escapeHtml(opt.value)}"
              role="radio"
              aria-checked="${active}"
            >
              <span class="material-symbols-outlined mf-type-icon">${opt.icon}</span>
              <span class="mf-type-label">${escapeHtml(opt.label)}</span>
              <span class="mf-type-sub">${escapeHtml(opt.subtitle)}</span>
            </button>`;
        }).join('')}
      </div>
      <input type="hidden" id="mf-room-type" name="room_type" value="${escapeHtml(state.form.room_type)}" />
    </div>`;
}

function renderStatusPills() {
  return `
    <div class="admin-crud-field span-full">
      <label class="mf-field-label">Room status</label>
      <div class="mf-status-pills" role="radiogroup" aria-label="Room status">
        ${ROOM_STATUSES.map((s) => {
          const active = state.form.status === s.value;
          return `
            <button
              type="button"
              class="mf-status-pill mf-status-pill--${s.tone}${active ? ' is-selected' : ''}"
              data-room-status="${s.value}"
              role="radio"
              aria-checked="${active}"
            >
              <span class="material-symbols-outlined text-[18px]">${s.icon}</span>
              <span>${escapeHtml(s.label)}</span>
            </button>`;
        }).join('')}
      </div>
      <input type="hidden" id="mf-status" name="status" value="${escapeHtml(state.form.status)}" />
    </div>`;
}

function renderCapacityStepper() {
  const max = state.form.capacity_max ?? 4;
  const occ = state.form.occupancy ?? 0;
  return `
    <div class="admin-crud-field span-full">
      <label class="mf-field-label" for="mf-cap-max">How many people can stay here?</label>
      <p class="mf-field-hint">Include everyone — beds, extra mattresses, or floor mats.</p>
      <div class="mf-stepper">
        <button type="button" class="mf-stepper-btn" data-step="capacity_max" data-delta="-1" aria-label="Decrease capacity">
          <span class="material-symbols-outlined">remove</span>
        </button>
        <input
          id="mf-cap-max"
          name="capacity_max"
          type="number"
          min="1"
          max="50"
          required
          class="mf-stepper-input"
          value="${escapeHtml(max)}"
        />
        <button type="button" class="mf-stepper-btn" data-step="capacity_max" data-delta="1" aria-label="Increase capacity">
          <span class="material-symbols-outlined">add</span>
        </button>
      </div>
      <p class="mf-capacity-note">
        <span class="material-symbols-outlined text-[16px]">group</span>
        Currently ${occ} guest${occ === 1 ? '' : 's'} checked in
      </p>
      <input type="hidden" id="mf-cap-min" name="capacity_min" value="${escapeHtml(state.form.capacity_min ?? 1)}" />
      <input type="hidden" id="mf-occupancy" name="occupancy" value="${escapeHtml(occ)}" />
    </div>`;
}

function renderBedField() {
  if (state.form.room_type !== 'Deluxe Apartment') return '';
  const beds = state.form.bed_count ?? 2;
  return `
    <div class="admin-crud-field span-full">
      <label class="mf-field-label">Beds</label>
      <div class="mf-type-grid mf-type-grid--compact">
        ${[2, 3].map((n) => `
          <button type="button" class="mf-type-card${beds === n ? ' is-selected' : ''}" data-bed-count="${n}">
            <span class="mf-type-label">${n} beds</span>
            <span class="mf-type-sub">${n === 3 ? 'Rooms 201 & 304' : 'Most deluxe units'}</span>
          </button>`).join('')}
      </div>
      <input type="hidden" id="mf-bed-count" name="bed_count" value="${beds}" />
    </div>`;
}

function renderAdvancedFields(bldgOpts) {
  return `
      ${renderRoomTypeCards()}
      ${renderBedField()}

      <div class="admin-crud-field">
        <label for="mf-building">Building</label>
        <select id="mf-building" name="building_id" required>
          <option value="">Select building…</option>
          ${bldgOpts}
        </select>
      </div>
      <div class="admin-crud-field">
        <label for="mf-room-number">Room name / number</label>
        <input id="mf-room-number" name="room_number" type="text" required value="${escapeHtml(state.form.room_number)}" placeholder="e.g. 201, COMMONS, CHAPEL" />
      </div>

      ${renderCapacityStepper()}
      ${renderStatusPills()}`;
}

function renderFormFields() {
  const bldgOpts = state.buildings.map((b) =>
    `<option value="${b.id}"${String(b.id) === String(state.form.building_id) ? ' selected' : ''}>${escapeHtml(b.name)}</option>`
  ).join('');

  return `
    <form id="manage-facilities-form" class="admin-crud-form-grid mf-form" novalidate>
      ${renderAdvancedFields(bldgOpts)}
    </form>`;
}

function renderDetailQuickActions(r) {
  const currentPreset = getActivePresetId(r);
  return `
    <div class="mf-switch-row" aria-label="Change room setup">
      ${QUICK_SETUPS.map((preset) => {
        const isCurrent = currentPreset === preset.id;
        return `
          <button
            type="button"
            class="mf-switch-btn${isCurrent ? ' is-current' : ''}"
            data-quick-setup="${preset.id}"
            data-quick-instant="1"
            ${isCurrent ? 'disabled aria-current="true"' : ''}
          >
            <span class="material-symbols-outlined">${preset.icon}</span>
            <span class="mf-switch-label">${escapeHtml(preset.label)}</span>
          </button>`;
      }).join('')}
    </div>`;
}

function renderDetailView(r) {
  const setup = getRoomSetupMeta(r);
  const flex = isFlexOrMeetingSpace(r);

  return `
    <div class="mf-detail">
      <div class="mf-detail-head">
        <div>
          <h3 class="mf-detail-title">${escapeHtml(r.room_number)}</h3>
          <p class="mf-detail-sub">${escapeHtml(r.building_name || 'Building')}</p>
        </div>
        <span class="${roomStatusBadge(r.status)}">${escapeHtml(roomStatusLabel(r.status))}</span>
      </div>

      <p class="mf-detail-meta">
        <span class="material-symbols-outlined text-[18px]">${setup.icon}</span>
        ${escapeHtml(setup.label)} · up to ${r.capacity_max} guests · ${r.occupancy ?? 0} checked in
      </p>

      ${flex ? `
        <p class="mf-detail-note">This room can be used for meetings or group sleep. Pick a setup below:</p>
        ${renderDetailQuickActions(r)}` : `
        <p class="mf-detail-note">Need to change capacity or status? Use <strong>Customize</strong> below.</p>`}
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
    feedback.className = 'text-body-sm mt-1 text-error font-medium';
    feedback.textContent = state.error;
  } else if (state.message) {
    feedback?.classList.remove('hidden');
    feedback.className = 'text-body-sm mt-1 text-secondary font-medium';
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
        <h3 class="font-headline-sm text-on-surface">Add a New Room</h3>
        <p class="text-body-sm text-on-surface-variant">Fill in the details below for a new facility unit.</p>
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
        <h3 class="font-headline-sm text-on-surface">Edit Room — ${escapeHtml(r?.room_number || '')}</h3>
        <p class="text-body-sm text-on-surface-variant">Adjust capacity, status, or building details.</p>
      </div>
      ${renderFormFields()}`;
    actions.innerHTML = `
      <button type="button" id="manage-facilities-cancel" class="admin-crud-btn-ghost">Cancel</button>
      <button type="button" id="manage-facilities-delete" class="admin-crud-btn-danger"${state.saving ? ' disabled' : ''}>
        <span class="material-symbols-outlined text-[18px]">delete</span> Delete Room
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
        <p class="font-semibold text-on-surface">Select a room from the list</p>
        <p class="text-body-sm mt-1">Click any room on the left to see details, or tap a room card on the Facilities page.</p>
      </div>`;
    actions.innerHTML = `
      <button type="button" id="manage-facilities-footer-close" class="admin-crud-btn-ghost">Close</button>`;
    return;
  }

  mount.innerHTML = renderDetailView(selected);
  actions.innerHTML = `
    <button type="button" id="manage-facilities-footer-close" class="admin-crud-btn-ghost">Close</button>
    <button type="button" id="manage-facilities-edit" class="admin-crud-btn-ghost">
      <span class="material-symbols-outlined text-[18px]">tune</span> Customize
    </button>`;
}

function render() {
  renderList();
  renderDetail();
}

function syncFormHiddenFields() {
  const typeInput = document.getElementById('mf-room-type');
  const statusInput = document.getElementById('mf-status');
  const minInput = document.getElementById('mf-cap-min');
  if (typeInput) typeInput.value = state.form.room_type;
  if (statusInput) statusInput.value = state.form.status;
  if (minInput) minInput.value = state.form.capacity_min ?? 1;
  const maxInput = document.getElementById('mf-cap-max');
  if (maxInput) maxInput.value = state.form.capacity_max ?? 4;
}

function readFormFromDom() {
  const form = document.getElementById('manage-facilities-form');
  if (!form) return state.form;
  const fd = new FormData(form);
  const roomType = fd.get('room_type') || state.form.room_type;
  const typeOpt = getTypeOption(roomType);
  let capacityMax = Number(fd.get('capacity_max')) || state.form.capacity_max || 4;
  let capacityMin = Number(fd.get('capacity_min')) || state.form.capacity_min || 1;

  if (roomType === 'Dorm' && capacityMin < 2) {
    capacityMin = Math.min(5, capacityMax);
  } else if (roomType !== 'Dorm' && capacityMin > capacityMax) {
    capacityMin = 1;
  }

  return {
    building_id: fd.get('building_id'),
    room_number: fd.get('room_number'),
    room_type: roomType,
    bed_count: roomType === 'Deluxe Apartment' ? Number(fd.get('bed_count') || state.form.bed_count || 2) : null,
    capacity_min: capacityMin,
    capacity_max: capacityMax,
    occupancy: Number(fd.get('occupancy')) || state.form.occupancy || 0,
    status: fd.get('status') || state.form.status || 'Available',
  };
}

function validateForm(form) {
  if (!form.building_id) return 'Please choose a building.';
  if (!String(form.room_number || '').trim()) return 'Please enter a room name or number.';
  if (!form.room_type) return 'Please choose what kind of space this is.';
  if (form.capacity_max < 1) return 'Capacity must be at least 1 guest.';
  if (form.capacity_min > form.capacity_max) return 'Minimum capacity cannot be greater than maximum.';
  if (form.occupancy > form.capacity_max) {
    return `There are ${form.occupancy} guests checked in — raise capacity to at least ${form.occupancy}, or lower occupancy first.`;
  }
  return null;
}

function applyQuickSetup(presetId, { previewOnly = false } = {}) {
  const preset = QUICK_SETUPS.find((p) => p.id === presetId);
  if (!preset) return;
  state.activeQuickSetup = presetId;
  state.form = {
    ...state.form,
    room_type: preset.type,
    capacity_min: preset.capacityMin,
    capacity_max: preset.capacityMax,
  };
  if (previewOnly) {
    state.message = `Previewing "${preset.label}" — tap Save Changes when ready.`;
    state.error = null;
    render();
    return;
  }
  state.message = `Applied "${preset.label}" — review below, then save.`;
  state.error = null;
  render();
}

async function applyAndSaveQuickSetup(presetId) {
  const preset = QUICK_SETUPS.find((p) => p.id === presetId);
  const room = getSelected();
  if (!preset || !room || state.saving) return;

  const currentPreset = getActivePresetId(room);
  if (currentPreset === presetId) {
    state.message = `"${preset.label}" is already active for ${room.room_number}.`;
    state.error = null;
    render();
    return;
  }

  const confirmed = window.confirm(
    `Switch ${room.room_number} to "${preset.label}"?\n\n${preset.short}`
  );
  if (!confirmed) return;

  state.form = {
    ...roomToForm(room),
    room_type: preset.type,
    capacity_min: preset.capacityMin,
    capacity_max: preset.capacityMax,
  };
  state.activeQuickSetup = presetId;
  state.mode = state.mode === 'view' ? 'view' : 'edit';
  await persistRoomForm({ successMessage: `"${preset.label}" saved for ${room.room_number}.` });
}

function applyRoomType(typeValue) {
  const opt = getTypeOption(typeValue);
  state.form.room_type = typeValue;
  state.activeQuickSetup = null;
  if (opt) {
    state.form.capacity_min = opt.capacity.min;
    state.form.capacity_max = opt.capacity.max;
  }
  if (typeValue === 'Deluxe Apartment' && !state.form.bed_count) {
    state.form.bed_count = 2;
  }
  state.message = null;
  render();
}

function applyStatus(statusValue) {
  state.form.status = statusValue;
  render();
}

function adjustStepper(field, delta) {
  const current = Number(state.form[field]) || 1;
  const next = Math.max(1, Math.min(50, current + delta));
  state.form[field] = next;
  if (field === 'capacity_max' && state.form.room_type !== 'Dorm') {
    state.form.capacity_min = 1;
  }
  state.activeQuickSetup = null;
  syncFormHiddenFields();
  const input = document.getElementById('mf-cap-max');
  if (input) input.value = next;
}

async function loadData() {
  state.loading = true;
  state.error = null;
  document.getElementById('manage-facilities-loading')?.classList.remove('hidden');
  render();

  try {
    const [rooms, apiBuildings] = await Promise.all([getRooms(), getBuildings()]);
    state.rooms = rooms;
    state.buildings = mergeBuildings(apiBuildings, extractBuildingsFromRooms(rooms));
    filterRooms();
    if (state.selectedId && !getSelected()) {
      state.selectedId = state.filtered.length ? state.filtered[0].id : null;
    } else if (!state.selectedId && state.filtered.length) {
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
  state.activeQuickSetup = null;
  state.filter = { search: '', status: 'all' };
  const search = document.getElementById('manage-facilities-search');
  const status = document.getElementById('manage-facilities-status-filter');
  if (search) search.value = '';
  if (status) status.value = 'all';
}

export function isManageFacilitiesModalOpen() {
  return state.isOpen;
}

export async function openManageFacilitiesModal(options = {}) {
  const roomId = options.roomId != null ? Number(options.roomId) : null;

  if (options.create) {
    state.mode = 'create';
    state.selectedId = null;
    state.form = emptyForm();
    state.mobileForm = true;
    state.error = null;
    state.message = null;
    state.activeQuickSetup = null;
  }

  if (state.isOpen) {
    if (options.create) {
      state.mode = 'create';
      state.selectedId = null;
      state.form = emptyForm();
      state.mobileForm = true;
      state.error = null;
      state.message = null;
      state.activeQuickSetup = null;
      if (state.buildings.length) {
        state.form.building_id = options.buildingId ?? state.buildings[0].id;
      }
      render();
      return;
    }
    if (roomId) {
      const match = state.rooms.find((r) => Number(r.id) === roomId);
      if (match) {
        state.selectedId = match.id;
        state.mobileForm = true;
        state.error = null;
        state.message = null;
        state.activeQuickSetup = null;
        if (options.edit !== false) {
          state.mode = 'edit';
          state.form = roomToForm(match);
        } else {
          state.mode = 'view';
        }
        render();
      }
    }
    return;
  }

  dataChanged = false;
  state.isOpen = true;
  showModal();
  await loadData();

  if (roomId) {
    const match = state.rooms.find((r) => Number(r.id) === roomId);
    if (match) {
      state.selectedId = match.id;
      state.mobileForm = true;
      if (options.edit !== false) {
        state.mode = 'edit';
        state.form = roomToForm(match);
        state.activeQuickSetup = null;
      } else {
        state.mode = 'view';
      }
      render();
    }
  }

  if (options.create && state.buildings.length) {
    state.form.building_id = options.buildingId ?? state.buildings[0].id;
    render();
  } else if (state.buildings.length && state.mode === 'create') {
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
  state.activeQuickSetup = null;
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
  state.activeQuickSetup = null;
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
  state.activeQuickSetup = null;
  render();
}

function cancelForm() {
  state.mode = 'view';
  state.mobileForm = false;
  state.error = null;
  state.message = null;
  state.activeQuickSetup = null;
  render();
}

async function persistRoomForm({ successMessage } = {}) {
  state.form = readFormFromDom();
  const validationError = validateForm(state.form);
  if (validationError) {
    state.error = validationError;
    state.message = null;
    render();
    return false;
  }

  state.saving = true;
  state.error = null;
  render();

  const payload = {
    building_id: Number(state.form.building_id),
    room_number: String(state.form.room_number).trim(),
    room_type: state.form.room_type,
    bed_count: state.form.room_type === 'Deluxe Apartment' ? state.form.bed_count : null,
    capacity_min: state.form.capacity_min,
    capacity_max: state.form.capacity_max,
    occupancy: state.form.occupancy,
    status: state.form.status,
  };

  try {
    if (state.mode === 'create') {
      await createRoom(payload);
      state.message = successMessage || 'Room added successfully.';
      state.mode = 'view';
    } else if (state.selectedId) {
      await updateRoom(state.selectedId, payload);
      const preset = QUICK_SETUPS.find((p) => p.id === state.activeQuickSetup);
      state.message = successMessage || (preset
        ? `"${preset.label}" saved for room ${payload.room_number}.`
        : `Room ${payload.room_number} updated successfully.`);
      state.mode = 'view';
      state.activeQuickSetup = null;
    }
    dataChanged = true;
    await loadData();
    return true;
  } catch (err) {
    state.error = err.message || 'Could not save room. Please try again.';
    render();
    return false;
  } finally {
    state.saving = false;
    render();
  }
}

async function saveForm() {
  await persistRoomForm();
}

async function removeRoom() {
  if (!state.selectedId || state.saving) return;
  const r = getSelected();
  if (!r) return;
  if (!window.confirm(`Delete room "${r.room_number}" in ${r.building_name}?\n\nThis cannot be undone.`)) return;

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
  if (card && card.closest('#manage-facilities-list')) {
    selectRoom(Number(card.getAttribute('data-room-id')));
    return;
  }

  const quickBtn = e.target.closest('[data-quick-setup]');
  if (quickBtn) {
    const presetId = quickBtn.getAttribute('data-quick-setup');
    const instant = quickBtn.getAttribute('data-quick-instant') === '1';
    if (instant) {
      applyAndSaveQuickSetup(presetId);
    } else {
      applyQuickSetup(presetId, { previewOnly: true });
    }
    return;
  }

  const typeCard = e.target.closest('[data-room-type]');
  if (typeCard) {
    applyRoomType(typeCard.getAttribute('data-room-type'));
    return;
  }

  const bedBtn = e.target.closest('[data-bed-count]');
  if (bedBtn) {
    state.form.bed_count = Number(bedBtn.getAttribute('data-bed-count'));
    state.message = null;
    render();
    return;
  }

  const statusPill = e.target.closest('[data-room-status]');
  if (statusPill) {
    applyStatus(statusPill.getAttribute('data-room-status'));
    return;
  }

  const stepBtn = e.target.closest('[data-step]');
  if (stepBtn) {
    adjustStepper(stepBtn.getAttribute('data-step'), Number(stepBtn.getAttribute('data-delta')));
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

function handleInput(e) {
  if (e.target.id === 'mf-cap-max') {
    state.form.capacity_max = Math.max(1, Number(e.target.value) || 1);
    state.activeQuickSetup = null;
    syncFormHiddenFields();
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

  document.getElementById('manage-facilities-modal')?.addEventListener('input', handleInput);

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-open-manage-facilities]');
    if (trigger) {
      e.preventDefault();
      openManageFacilitiesModal();
    }
  });

  window.addEventListener('manage-facilities:open', (e) => {
    const { roomId, edit, create, buildingId } = e.detail || {};
    openManageFacilitiesModal({
      roomId,
      edit: edit !== false,
      create: !!create,
      buildingId,
    });
  });
}
