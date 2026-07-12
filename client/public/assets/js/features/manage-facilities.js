/**
 * Manage Rooms modal — admin CRUD for lodging rooms.
 * Built for non-technical admins: pick a room, edit its type, capacity and status,
 * or add a brand-new room. Room types are flexible — admins can add new categories.
 */

import {
  getRooms,
  getBuildings,
  createRoom,
  updateRoom,
  deleteRoom,
} from '/assets/js/services/api.js';
import { animateModalOpen } from '/assets/js/layout/animations.js';
import { confirmModal } from '/assets/js/layout/ui.js';
import { roomStatusLabel, roomStatusOptions, roomStatusMeta } from '/assets/js/features/room-status.js';

/** Sentinel value used by the room-type <select> to reveal the "new type" field. */
const ADD_TYPE_VALUE = '__add_type__';

/** Built-in room categories that map to seasonal pricing tiers. */
const BUILTIN_ROOM_TYPES = [
  { value: 'Dorm', label: 'Dorm (shared bunk room)', icon: 'night_shelter', capacity: { min: 5, max: 12 } },
  { value: 'Superior Guest Room', label: 'Superior Guest Room (studio, no kitchen)', icon: 'king_bed', capacity: { min: 1, max: 4 } },
  { value: 'VIP', label: 'VIP Room', icon: 'workspace_premium', capacity: { min: 1, max: 4 } },
  { value: 'Standard Apartment', label: 'Standard Apartment (with kitchen)', icon: 'apartment', capacity: { min: 1, max: 4 } },
  { value: 'Deluxe Apartment', label: 'Deluxe Apartment (with kitchen, 2 or 3 BR)', icon: 'holiday_village', capacity: { min: 1, max: 6 } },
];

const ROOM_STATUSES = roomStatusOptions().map((opt) => ({
  value: opt.value,
  label: opt.label,
  icon: opt.icon,
  tone: opt.tone,
}));

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
  const tone = roomStatusMeta(status).tone;
  return `admin-crud-badge admin-crud-badge--${tone}`;
}

function builtinType(value) {
  return BUILTIN_ROOM_TYPES.find((t) => t.value === value) || null;
}

function typeIcon(value) {
  return builtinType(value)?.icon || 'meeting_room';
}

/** Every selectable room type: built-ins + any custom types already in use. */
function allRoomTypes() {
  const map = new Map();
  BUILTIN_ROOM_TYPES.forEach((t) => map.set(t.value, t.label));
  state.rooms.forEach((r) => {
    if (r.room_type && !map.has(r.room_type)) map.set(r.room_type, r.room_type);
  });
  const current = state.form.room_type;
  if (current && !state.form.addingType && !map.has(current)) map.set(current, current);
  return [...map.entries()].map(([value, label]) => ({ value, label }));
}

/** Human-friendly label + icon for a room (list rows, detail view). */
export function getRoomSetupMeta(room) {
  if (!room) return { label: 'Room', icon: 'meeting_room' };
  const label = room.room_type_label || room.room_type || 'Room';
  return { label, icon: typeIcon(room.room_type) };
}

/** Sensible default bedroom count for a room type (Dorm has none). */
function defaultBedrooms(roomType, roomNumber) {
  if (roomType === 'Dorm') return null;
  if (roomType === 'Deluxe Apartment') {
    return ['201', '304'].includes(String(roomNumber)) ? 3 : 2;
  }
  return 1;
}

function emptyForm() {
  const first = BUILTIN_ROOM_TYPES[1];
  return {
    building_id: '',
    room_number: '',
    room_type: first.value,
    addingType: false,
    newTypeName: '',
    bed_count: defaultBedrooms(first.value, ''),
    capacity_min: first.capacity.min,
    capacity_max: first.capacity.max,
    occupancy: 0,
    status: 'Available',
    description: '',
    inclusions: '',
    policies: '',
  };
}

function roomToForm(r) {
  const fallback = BUILTIN_ROOM_TYPES[1];
  const roomType = r.room_type ?? fallback.value;
  return {
    building_id: r.building_id ?? '',
    room_number: r.room_number ?? '',
    room_type: roomType,
    addingType: false,
    newTypeName: '',
    bed_count: r.bed_count ?? defaultBedrooms(roomType, r.room_number),
    capacity_min: r.capacity_min ?? 1,
    capacity_max: r.capacity_max ?? 1,
    occupancy: r.occupancy ?? 0,
    status: r.status ?? 'Available',
    description: r.description ?? '',
    inclusions: r.inclusions || r.highlights || '',
    policies: r.policies ?? '',
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
    const hay = [r.room_number, r.building_name, r.room_type, r.room_type_label, r.status].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

function getSelected() {
  return state.rooms.find((r) => String(r.id) === String(state.selectedId)) || null;
}

/* ── List panel ── */

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

/* ── Form fields ── */

function renderRoomTypeField() {
  const types = allRoomTypes();
  const adding = state.form.addingType;
  return `
    <div class="admin-crud-field span-full">
      <label class="mf-field-label" for="mf-room-type">Room type</label>
      <p class="mf-field-hint">Choose a category, or pick “Add a new type…” to create your own.</p>
      <select id="mf-room-type" class="mf-select">
        ${types.map((t) =>
          `<option value="${escapeHtml(t.value)}"${!adding && t.value === state.form.room_type ? ' selected' : ''}>${escapeHtml(t.label)}</option>`
        ).join('')}
        <option value="${ADD_TYPE_VALUE}"${adding ? ' selected' : ''}>+ Add a new type…</option>
      </select>
      ${adding ? `
        <input
          id="mf-new-type"
          type="text"
          class="mf-input mf-mt"
          placeholder="Name the new type (e.g. Family Suite, Cabin)"
          value="${escapeHtml(state.form.newTypeName || '')}"
          maxlength="100"
          autocomplete="off"
        />
        <p class="mf-field-hint mf-mt-sm">It becomes a reusable option for other rooms once you save.</p>` : ''}
    </div>`;
}

function renderBedField() {
  // Bedrooms don't apply to a shared dorm; every other type can record them.
  if (state.form.room_type === 'Dorm') return '';
  const bedrooms = state.form.bed_count === '' ? '' : (state.form.bed_count ?? 1);
  const isDeluxe = state.form.room_type === 'Deluxe Apartment';
  return `
    <div class="admin-crud-field span-full">
      <label class="mf-field-label" for="mf-bed_count">Bedrooms (BR)</label>
      <p class="mf-field-hint">How many separate bedrooms this unit has.${isDeluxe ? ' Deluxe 2&nbsp;BR and 3&nbsp;BR units use different nightly rates.' : ''}</p>
      <div class="mf-stepper mf-stepper--inline">
        <button type="button" class="mf-stepper-btn" data-step="bed_count" data-delta="-1" aria-label="Decrease bedrooms">
          <span class="material-symbols-outlined">remove</span>
        </button>
        <input
          id="mf-bed_count"
          name="bed_count"
          type="number"
          min="1"
          max="20"
          class="mf-stepper-input"
          value="${escapeHtml(bedrooms)}"
        />
        <button type="button" class="mf-stepper-btn" data-step="bed_count" data-delta="1" aria-label="Increase bedrooms">
          <span class="material-symbols-outlined">add</span>
        </button>
      </div>
    </div>`;
}

function capStepper(label, field, value) {
  const lower = label.toLowerCase();
  return `
    <div class="mf-cap-cell">
      <span class="mf-cap-label">${escapeHtml(label)}</span>
      <div class="mf-stepper">
        <button type="button" class="mf-stepper-btn" data-step="${field}" data-delta="-1" aria-label="Decrease ${lower} capacity">
          <span class="material-symbols-outlined">remove</span>
        </button>
        <input
          id="mf-${field}"
          name="${field}"
          type="number"
          min="1"
          max="200"
          required
          class="mf-stepper-input"
          value="${escapeHtml(value)}"
        />
        <button type="button" class="mf-stepper-btn" data-step="${field}" data-delta="1" aria-label="Increase ${lower} capacity">
          <span class="material-symbols-outlined">add</span>
        </button>
      </div>
    </div>`;
}

function renderCapacityFields() {
  const min = state.form.capacity_min ?? 1;
  const max = state.form.capacity_max ?? 1;
  const occ = state.form.occupancy ?? 0;
  return `
    <div class="admin-crud-field span-full">
      <label class="mf-field-label">Guest capacity</label>
      <p class="mf-field-hint">Set the smallest and largest number of guests this room can hold.</p>
      <div class="mf-cap-grid">
        ${capStepper('Minimum', 'capacity_min', min)}
        ${capStepper('Maximum', 'capacity_max', max)}
      </div>
      <p class="mf-capacity-note">
        <span class="material-symbols-outlined text-[16px]">group</span>
        ${occ} guest${occ === 1 ? '' : 's'} currently checked in
      </p>
      <input type="hidden" id="mf-occupancy" name="occupancy" value="${escapeHtml(occ)}" />
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

function renderGuestCopyFields() {
  return `
    <div class="admin-crud-field span-full">
      <label for="mf-description">Description <span class="text-slate-400 font-normal">(optional)</span></label>
      <textarea id="mf-description" name="description" rows="3" placeholder="Short overview of the room for guests.">${escapeHtml(state.form.description || '')}</textarea>
      <p class="mf-field-hint">Shown at the top of the guest details panel.</p>
    </div>
    <div class="admin-crud-field span-full">
      <label for="mf-inclusions">What's included <span class="text-slate-400 font-normal">(optional)</span></label>
      <textarea id="mf-inclusions" name="inclusions" rows="4" placeholder="One item per line, e.g.&#10;Private bathroom&#10;Air-conditioning&#10;Wi‑Fi">${escapeHtml(state.form.inclusions || '')}</textarea>
      <p class="mf-field-hint">Amenities and inclusions. One item per line shows as chips for guests.</p>
    </div>
    <div class="admin-crud-field span-full">
      <label for="mf-policies">Policies <span class="text-slate-400 font-normal">(optional)</span></label>
      <textarea id="mf-policies" name="policies" rows="3" placeholder="House rules, quiet hours, check-in notes…">${escapeHtml(state.form.policies || '')}</textarea>
      <p class="mf-field-hint">Rules guests should know before reserving.</p>
    </div>`;
}

function renderFormFields() {
  const singleBuilding = state.buildings.length <= 1;
  const bldgOpts = state.buildings.map((b) =>
    `<option value="${b.id}"${String(b.id) === String(state.form.building_id) ? ' selected' : ''}>${escapeHtml(b.name)}</option>`
  ).join('');

  const buildingField = singleBuilding
    ? `<input type="hidden" id="mf-building" name="building_id" value="${escapeHtml(String(state.form.building_id || state.buildings[0]?.id || ''))}" />`
    : `<div class="admin-crud-field">
        <label for="mf-building">Building</label>
        <select id="mf-building" name="building_id" required>
          <option value="">Select building…</option>
          ${bldgOpts}
        </select>
      </div>`;

  return `
    <form id="manage-facilities-form" class="admin-crud-form-grid mf-form" novalidate>
      ${buildingField}
      <div class="admin-crud-field${singleBuilding ? ' span-full' : ''}">
        <label for="mf-room-number">Room name or number</label>
        <input id="mf-room-number" name="room_number" type="text" required value="${escapeHtml(state.form.room_number)}" placeholder="e.g. 201, A-501" autocomplete="off" />
      </div>
      ${renderRoomTypeField()}
      ${renderBedField()}
      ${renderCapacityFields()}
      ${renderStatusPills()}
      ${renderGuestCopyFields()}
    </form>`;
}

/* ── Detail (view) ── */

function renderDetailView(r) {
  const setup = getRoomSetupMeta(r);
  const capMin = r.capacity_min ?? 1;
  const capMax = r.capacity_max ?? capMin;
  const capLabel = capMin === capMax ? `${capMax} guest${capMax === 1 ? '' : 's'}` : `${capMin}–${capMax} guests`;
  const bedrooms = r.room_type === 'Dorm' ? null : (r.bed_count != null ? Number(r.bed_count) : null);
  const inclusionLines = String(r.inclusions || r.highlights || '')
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const policyLines = String(r.policies || '')
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  return `
    <div class="mf-detail">
      <div class="mf-detail-head">
        <div>
          <h3 class="mf-detail-title">${escapeHtml(r.room_number)}</h3>
          <p class="mf-detail-sub">${escapeHtml(r.building_name || 'Building')}</p>
        </div>
        <span class="${roomStatusBadge(r.status)}">${escapeHtml(roomStatusLabel(r.status))}</span>
      </div>

      <dl class="mf-detail-list">
        <div><dt><span class="material-symbols-outlined text-[18px]">${setup.icon}</span> Type</dt><dd>${escapeHtml(setup.label)}</dd></div>
        ${bedrooms ? `<div><dt><span class="material-symbols-outlined text-[18px]">bed</span> Bedrooms</dt><dd>${bedrooms} bedroom${bedrooms === 1 ? '' : 's'}</dd></div>` : ''}
        <div><dt><span class="material-symbols-outlined text-[18px]">group</span> Capacity</dt><dd>${capLabel}</dd></div>
        <div><dt><span class="material-symbols-outlined text-[18px]">login</span> Checked in</dt><dd>${r.occupancy ?? 0}</dd></div>
      </dl>

      ${r.description ? `
        <div class="mf-detail-copy">
          <h4>Description</h4>
          <p>${escapeHtml(r.description)}</p>
        </div>` : ''}
      ${inclusionLines.length ? `
        <div class="mf-detail-copy">
          <h4>What's included</h4>
          <ul>${inclusionLines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
        </div>` : ''}
      ${policyLines.length ? `
        <div class="mf-detail-copy">
          <h4>Policies</h4>
          <ul>${policyLines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
        </div>` : ''}
      ${!r.description && !inclusionLines.length && !policyLines.length ? `
        <p class="mf-detail-note">No guest description, inclusions, or policies yet. Use <strong>Edit room</strong> to add text shown in the browse details panel.</p>` : `
        <p class="mf-detail-note">Use <strong>Edit room</strong> to change setup or guest-facing copy.</p>`}
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
        <h3 class="font-headline-sm text-on-surface">Add a new room</h3>
        <p class="text-body-sm text-on-surface-variant">Fill in the details below, then save.</p>
      </div>
      ${renderFormFields()}`;
    actions.innerHTML = `
      <button type="button" id="manage-facilities-cancel" class="admin-crud-btn-ghost">Cancel</button>
      <button type="button" id="manage-facilities-save" class="admin-crud-btn-primary"${state.saving ? ' disabled' : ''}>
        <span class="material-symbols-outlined text-[18px]">save</span>
        ${state.saving ? 'Saving…' : 'Add room'}
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
        <h3 class="font-headline-sm text-on-surface">Edit room — ${escapeHtml(r?.room_number || '')}</h3>
        <p class="text-body-sm text-on-surface-variant">Change the type, capacity, status, description, inclusions, or policies.</p>
      </div>
      ${renderFormFields()}`;
    actions.innerHTML = `
      <button type="button" id="manage-facilities-cancel" class="admin-crud-btn-ghost">Cancel</button>
      <button type="button" id="manage-facilities-delete" class="admin-crud-btn-danger"${state.saving ? ' disabled' : ''}>
        <span class="material-symbols-outlined text-[18px]">delete</span> Delete
      </button>
      <button type="button" id="manage-facilities-save" class="admin-crud-btn-primary"${state.saving ? ' disabled' : ''}>
        <span class="material-symbols-outlined text-[18px]">save</span>
        ${state.saving ? 'Saving…' : 'Save changes'}
      </button>`;
    return;
  }

  const selected = getSelected();
  if (!selected) {
    mount.innerHTML = `
      <div class="admin-crud-empty h-full min-h-[280px]">
        <span class="material-symbols-outlined">touch_app</span>
        <p class="font-semibold text-on-surface">Select a room from the list</p>
        <p class="text-body-sm mt-1">Click any room on the left to see details, or add a new room.</p>
      </div>`;
    actions.innerHTML = `
      <button type="button" id="manage-facilities-footer-close" class="admin-crud-btn-ghost">Close</button>`;
    return;
  }

  mount.innerHTML = renderDetailView(selected);
  actions.innerHTML = `
    <button type="button" id="manage-facilities-footer-close" class="admin-crud-btn-ghost">Close</button>
    <button type="button" id="manage-facilities-edit" class="admin-crud-btn-primary">
      <span class="material-symbols-outlined text-[18px]">edit</span> Edit room
    </button>`;
}

function render() {
  renderList();
  renderDetail();
}

/* ── Form <-> state syncing ── */

/** Pull the live values from text/number inputs into state so a re-render keeps them. */
function captureForm() {
  const el = (id) => document.getElementById(id);
  if (el('mf-building')) state.form.building_id = el('mf-building').value;
  if (el('mf-room-number')) state.form.room_number = el('mf-room-number').value;
  const min = el('mf-capacity_min');
  const max = el('mf-capacity_max');
  if (min && min.value !== '') state.form.capacity_min = Math.max(1, Number(min.value) || 1);
  if (max && max.value !== '') state.form.capacity_max = Math.max(1, Number(max.value) || 1);
  const bed = el('mf-bed_count');
  if (bed && bed.value !== '') state.form.bed_count = Math.max(1, Number(bed.value) || 1);
  if (state.form.addingType && el('mf-new-type')) {
    state.form.newTypeName = el('mf-new-type').value;
    state.form.room_type = el('mf-new-type').value.trim();
  }
  if (el('mf-description')) state.form.description = el('mf-description').value;
  if (el('mf-inclusions')) state.form.inclusions = el('mf-inclusions').value;
  if (el('mf-policies')) state.form.policies = el('mf-policies').value;
}

function readFormForSave() {
  captureForm();
  const roomType = state.form.addingType
    ? String(state.form.newTypeName || '').trim()
    : String(state.form.room_type || '').trim();
  return {
    building_id: state.form.building_id,
    room_number: String(state.form.room_number || '').trim(),
    room_type: roomType,
    bed_count: roomType === 'Dorm' ? null : Math.max(1, Number(state.form.bed_count) || 1),
    capacity_min: Number(state.form.capacity_min) || 0,
    capacity_max: Number(state.form.capacity_max) || 0,
    occupancy: Number(state.form.occupancy) || 0,
    status: state.form.status || 'Available',
    description: String(state.form.description || '').trim(),
    inclusions: String(state.form.inclusions || '').trim(),
    policies: String(state.form.policies || '').trim(),
  };
}

function validateForm(f) {
  if (!f.building_id) return 'Please choose a building.';
  if (!f.room_number) return 'Please enter a room name or number.';
  if (!f.room_type) {
    return state.form.addingType ? 'Please type a name for the new room type.' : 'Please choose a room type.';
  }
  if (!(f.capacity_min >= 1)) return 'Minimum capacity must be at least 1 guest.';
  if (!(f.capacity_max >= 1)) return 'Maximum capacity must be at least 1 guest.';
  if (f.capacity_min > f.capacity_max) return 'Minimum capacity can’t be more than the maximum.';
  if (f.occupancy > f.capacity_max) {
    return `${f.occupancy} guest${f.occupancy === 1 ? ' is' : 's are'} checked in — set the maximum to at least ${f.occupancy}, or check them out first.`;
  }
  return null;
}

/* ── Interactions ── */

function selectType(value) {
  captureForm();
  if (value === ADD_TYPE_VALUE) {
    state.form.addingType = true;
    state.form.newTypeName = '';
    state.form.room_type = '';
  } else {
    state.form.addingType = false;
    state.form.room_type = value;
    if (state.mode === 'create') {
      const def = builtinType(value);
      if (def) {
        state.form.capacity_min = def.capacity.min;
        state.form.capacity_max = def.capacity.max;
      }
    }
    if (value === 'Deluxe Apartment') {
      if (state.form.bed_count == null || state.form.bed_count === '' || Number(state.form.bed_count) < 2) {
        state.form.bed_count = 2;
      }
    } else if (value !== 'Dorm' && (state.form.bed_count == null || state.form.bed_count === '')) {
      state.form.bed_count = 1;
    }
  }
  state.error = null;
  state.message = null;
  render();
  if (state.form.addingType) document.getElementById('mf-new-type')?.focus();
}

function adjustStepper(field, delta) {
  captureForm();
  const current = Number(state.form[field]) || 1;
  state.form[field] = Math.max(1, Math.min(200, current + delta));
  state.error = null;
  render();
}

function applyStatus(value) {
  captureForm();
  state.form.status = value;
  render();
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
    } else if (!state.selectedId && state.filtered.length && state.mode === 'view') {
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

export async function openManageFacilitiesModal(options = {}) {
  const roomId = options.roomId != null ? Number(options.roomId) : null;

  const startCreateState = () => {
    state.mode = 'create';
    state.selectedId = null;
    state.form = emptyForm();
    state.mobileForm = true;
    state.error = null;
    state.message = null;
    if (state.buildings.length) {
      state.form.building_id = options.buildingId ?? state.buildings[0].id;
    }
  };

  if (state.isOpen) {
    if (options.create) {
      startCreateState();
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
  if (options.create) startCreateState();
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
      } else {
        state.mode = 'view';
      }
    }
  }

  if (state.mode === 'create' && state.buildings.length && !state.form.building_id) {
    state.form.building_id = options.buildingId ?? state.buildings[0].id;
  }
  render();
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
  state.message = null;
  render();
}

async function saveForm() {
  const payload = readFormForSave();
  const validationError = validateForm(payload);
  if (validationError) {
    state.error = validationError;
    state.message = null;
    render();
    return;
  }

  const isNew = state.mode === 'create';
  const confirmed = await confirmModal({
    title: isNew ? 'Add room' : 'Save changes',
    message: isNew
      ? `Are you sure you want to add room <strong>${escapeHtml(payload.room_number)}</strong>?`
      : `Are you sure you want to save your changes to room <strong>${escapeHtml(payload.room_number)}</strong>?`,
    confirmLabel: isNew ? 'Add room' : 'Save changes',
    elevate: true,
  });
  if (!confirmed) return;

  state.saving = true;
  state.error = null;
  render();

  try {
    if (state.mode === 'create') {
      await createRoom(payload);
      state.message = `Room ${payload.room_number} added.`;
    } else if (state.selectedId) {
      await updateRoom(state.selectedId, payload);
      state.message = `Room ${payload.room_number} updated.`;
    }
    state.mode = 'view';
    dataChanged = true;
    await loadData();
  } catch (err) {
    state.error = err.message || 'Could not save room. Please try again.';
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
  const confirmed = await confirmModal({
    title: 'Delete room',
    message: `Are you sure you want to delete room <strong>${escapeHtml(r.room_number)}</strong> in ${escapeHtml(r.building_name || 'this building')}? This cannot be undone.`,
    confirmLabel: 'Delete room',
    danger: true,
    elevate: true,
  });
  if (!confirmed) return;

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

  if (e.target.closest('#manage-facilities-new')) { startCreate(); return; }
  if (e.target.closest('#manage-facilities-edit')) { startEdit(); return; }
  if (e.target.closest('#manage-facilities-save')) { saveForm(); return; }
  if (e.target.closest('#manage-facilities-cancel') || e.target.closest('#manage-facilities-back')) { cancelForm(); return; }
  if (e.target.closest('#manage-facilities-delete')) { removeRoom(); return; }
  if (e.target.closest('#manage-facilities-footer-close')) { closeManageFacilitiesModal(); }
}

function handleChange(e) {
  if (e.target.id === 'mf-room-type') {
    selectType(e.target.value);
    return;
  }
  if (e.target.id === 'mf-building') {
    state.form.building_id = e.target.value;
  }
}

function handleInput(e) {
  const t = e.target;
  if (t.id === 'mf-new-type') {
    state.form.newTypeName = t.value;
    state.form.room_type = t.value.trim();
    return;
  }
  if (t.id === 'mf-room-number') {
    state.form.room_number = t.value;
    return;
  }
  if (t.id === 'mf-capacity_min') {
    state.form.capacity_min = t.value === '' ? '' : Math.max(1, Number(t.value) || 1);
    return;
  }
  if (t.id === 'mf-capacity_max') {
    state.form.capacity_max = t.value === '' ? '' : Math.max(1, Number(t.value) || 1);
    return;
  }
  if (t.id === 'mf-bed_count') {
    state.form.bed_count = t.value === '' ? '' : Math.max(1, Number(t.value) || 1);
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

  const modal = document.getElementById('manage-facilities-modal');
  modal?.addEventListener('click', (e) => {
    if (e.target.id === 'manage-facilities-modal') {
      closeManageFacilitiesModal();
      return;
    }
    handleClick(e);
  });
  modal?.addEventListener('input', handleInput);
  modal?.addEventListener('change', handleChange);

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
