/**
 * Manage Reservations modal — admin CRUD for bookings.
 */

import {
  getBookings,
  getRooms,
  getUsers,
  createBooking,
  updateBooking,
  deleteBooking,
} from '/assets/js/services/api.js';
import { animateModalOpen } from '/assets/js/layout/animations.js';

const STATUSES = ['Pending', 'Approved', 'Rejected', 'Cancelled'];

let initialized = false;
let previouslyFocused = null;

const state = {
  isOpen: false,
  loading: false,
  saving: false,
  mode: 'view',
  bookings: [],
  filtered: [],
  rooms: [],
  users: [],
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

function normStatus(s) {
  return String(s || 'pending').toLowerCase();
}

function badgeClass(status) {
  return `admin-crud-badge admin-crud-badge--${normStatus(status)}`;
}

function formatDate(d) {
  if (!d) return '—';
  const raw = String(d).slice(0, 10);
  return new Date(`${raw}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatRange(inDate, outDate) {
  return `${formatDate(inDate)} – ${formatDate(outDate)}`;
}

function formatMoney(n) {
  const val = Number(n);
  if (Number.isNaN(val)) return '—';
  return val.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function emptyForm() {
  return {
    user_id: '',
    room_id: '',
    check_in: '',
    check_out: '',
    guest_count: 1,
    status: 'Pending',
    notes: '',
  };
}

function bookingToForm(b) {
  return {
    user_id: b.user_id ?? '',
    room_id: b.room_id ?? '',
    check_in: String(b.check_in || '').slice(0, 10),
    check_out: String(b.check_out || '').slice(0, 10),
    guest_count: b.guest_count ?? 1,
    status: b.status || 'Pending',
    notes: b.notes || '',
  };
}

function filterBookings() {
  const q = state.filter.search.trim().toLowerCase();
  const st = state.filter.status;
  state.filtered = state.bookings.filter((b) => {
    if (st !== 'all' && normStatus(b.status) !== st) return false;
    if (!q) return true;
    const hay = [
      b.id,
      b.guest_name,
      b.guest_email,
      b.room_number,
      b.building_name,
      b.room_type,
    ].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

function getSelected() {
  return state.bookings.find((b) => String(b.id) === String(state.selectedId)) || null;
}

function roomLabel(r) {
  const bldg = r.building_name || r.building || '';
  return `${bldg} · ${r.room_number} (${r.room_type})`;
}

function renderList() {
  const mount = document.getElementById('manage-reservations-list');
  const countEl = document.getElementById('manage-reservations-footer-count');
  if (!mount) return;

  if (state.loading && !state.bookings.length) {
    mount.innerHTML = '<p class="text-body-sm text-on-surface-variant p-4 text-center">Loading reservations…</p>';
    return;
  }

  if (!state.filtered.length) {
    mount.innerHTML = `
      <div class="admin-crud-empty">
        <span class="material-symbols-outlined">calendar_month</span>
        <p class="font-semibold text-on-surface">No reservations found</p>
        <p class="text-body-sm mt-1">Try adjusting filters or create a new reservation.</p>
      </div>`;
  } else {
    mount.innerHTML = state.filtered.map((b) => {
      const sel = String(b.id) === String(state.selectedId);
      return `
        <button type="button" data-booking-id="${b.id}" class="admin-crud-list-item${sel ? ' is-selected' : ''}" role="option" aria-selected="${sel}">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="text-label-md font-bold text-on-surface truncate">${escapeHtml(b.guest_name || 'Guest')}</p>
              <p class="text-body-sm text-on-surface-variant truncate">${escapeHtml(b.building_name)} · ${escapeHtml(b.room_number)}</p>
            </div>
            <span class="${badgeClass(b.status)}">${escapeHtml(b.status)}</span>
          </div>
          <p class="text-body-sm text-on-surface-variant mt-2">${formatRange(b.check_in, b.check_out)}</p>
          <p class="text-[11px] text-on-surface-variant/70 mt-1 font-mono">#APT-${b.id}</p>
        </button>`;
    }).join('');
  }

  if (countEl) {
    countEl.textContent = `Showing ${state.filtered.length} of ${state.bookings.length} reservations`;
  }
}

function renderFormFields({ showStatus = true } = {}) {
  const roomOpts = state.rooms.map((r) =>
    `<option value="${r.id}"${String(r.id) === String(state.form.room_id) ? ' selected' : ''}>${escapeHtml(roomLabel(r))}</option>`
  ).join('');

  const userOpts = state.users.map((u) =>
    `<option value="${u.id}"${String(u.id) === String(state.form.user_id) ? ' selected' : ''}>${escapeHtml(u.full_name || u.email)} (${escapeHtml(u.email)})</option>`
  ).join('');

  const statusOpts = STATUSES.map((s) =>
    `<option value="${s}"${state.form.status === s ? ' selected' : ''}>${s}</option>`
  ).join('');

  return `
    <form id="manage-reservations-form" class="admin-crud-form-grid" novalidate>
      <div class="admin-crud-field span-full">
        <label for="mr-user">Guest / Resident</label>
        <select id="mr-user" name="user_id" required>${userOpts}</select>
      </div>
      <div class="admin-crud-field span-full">
        <label for="mr-room">Room</label>
        <select id="mr-room" name="room_id" required>
          <option value="">Select a room…</option>
          ${roomOpts}
        </select>
      </div>
      <div class="admin-crud-field">
        <label for="mr-check-in">Check-in</label>
        <input id="mr-check-in" name="check_in" type="date" required value="${escapeHtml(state.form.check_in)}" />
      </div>
      <div class="admin-crud-field">
        <label for="mr-check-out">Check-out</label>
        <input id="mr-check-out" name="check_out" type="date" required value="${escapeHtml(state.form.check_out)}" />
      </div>
      <div class="admin-crud-field">
        <label for="mr-guests">Guest count</label>
        <input id="mr-guests" name="guest_count" type="number" min="1" required value="${escapeHtml(state.form.guest_count)}" />
      </div>
      ${showStatus ? `
      <div class="admin-crud-field">
        <label for="mr-status">Status</label>
        <select id="mr-status" name="status">${statusOpts}</select>
      </div>` : ''}
      <div class="admin-crud-field span-full">
        <label for="mr-notes">Notes</label>
        <textarea id="mr-notes" name="notes" rows="3" placeholder="Optional notes…">${escapeHtml(state.form.notes)}</textarea>
      </div>
    </form>`;
}

function renderDetailView(b) {
  return `
    <div class="space-y-5">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Reservation #APT-${b.id}</p>
          <h3 class="font-headline-sm text-on-surface mt-1">${escapeHtml(b.guest_name || 'Guest')}</h3>
          <p class="text-body-sm text-on-surface-variant">${escapeHtml(b.guest_email || '')}</p>
        </div>
        <span class="${badgeClass(b.status)}">${escapeHtml(b.status)}</span>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="admin-panel p-4 rounded-lg">
          <p class="text-[11px] font-bold uppercase text-on-surface-variant">Facility</p>
          <p class="font-semibold text-on-surface mt-1">${escapeHtml(b.building_name)} · ${escapeHtml(b.room_number)}</p>
          <p class="text-body-sm text-on-surface-variant">${escapeHtml(b.room_type)}</p>
        </div>
        <div class="admin-panel p-4 rounded-lg">
          <p class="text-[11px] font-bold uppercase text-on-surface-variant">Stay</p>
          <p class="font-semibold text-on-surface mt-1">${formatRange(b.check_in, b.check_out)}</p>
          <p class="text-body-sm text-on-surface-variant">${b.guest_count} guest(s)</p>
        </div>
        <div class="admin-panel p-4 rounded-lg">
          <p class="text-[11px] font-bold uppercase text-on-surface-variant">Billing</p>
          <p class="font-semibold text-on-surface mt-1">${formatMoney(b.total_amount)}</p>
          <p class="text-body-sm text-on-surface-variant">${escapeHtml(b.season || '')} · ${escapeHtml(b.occupancy_item || '')}</p>
        </div>
        <div class="admin-panel p-4 rounded-lg">
          <p class="text-[11px] font-bold uppercase text-on-surface-variant">Notes</p>
          <p class="text-body-sm text-on-surface mt-1">${escapeHtml(b.notes || '—')}</p>
        </div>
      </div>
    </div>`;
}

function renderDetail() {
  const mount = document.getElementById('manage-reservations-detail');
  const actions = document.getElementById('manage-reservations-footer-actions');
  const feedback = document.getElementById('manage-reservations-feedback');
  const body = document.getElementById('manage-reservations-body');
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
        <button type="button" id="manage-reservations-back" class="admin-crud-btn-ghost md:hidden mb-3">
          <span class="material-symbols-outlined text-[18px]">arrow_back</span> Back
        </button>
        <h3 class="font-headline-sm text-on-surface">New Reservation</h3>
        <p class="text-body-sm text-on-surface-variant">Fill in the details below to create a booking.</p>
      </div>
      ${renderFormFields({ showStatus: false })}`;
    actions.innerHTML = `
      <button type="button" id="manage-reservations-cancel" class="admin-crud-btn-ghost">Cancel</button>
      <button type="button" id="manage-reservations-save" class="admin-crud-btn-primary"${state.saving ? ' disabled' : ''}>
        <span class="material-symbols-outlined text-[18px]">save</span>
        ${state.saving ? 'Saving…' : 'Create Reservation'}
      </button>`;
    return;
  }

  if (state.mode === 'edit') {
    const b = getSelected();
    mount.innerHTML = `
      <div class="mb-4">
        <button type="button" id="manage-reservations-back" class="admin-crud-btn-ghost md:hidden mb-3">
          <span class="material-symbols-outlined text-[18px]">arrow_back</span> Back
        </button>
        <h3 class="font-headline-sm text-on-surface">Edit Reservation #APT-${b?.id || ''}</h3>
        <p class="text-body-sm text-on-surface-variant">Update dates, guests, status, or notes.</p>
      </div>
      ${renderFormFields({ showStatus: true })}`;
    actions.innerHTML = `
      <button type="button" id="manage-reservations-cancel" class="admin-crud-btn-ghost">Cancel</button>
      <button type="button" id="manage-reservations-delete" class="admin-crud-btn-danger"${state.saving ? ' disabled' : ''}>
        <span class="material-symbols-outlined text-[18px]">delete</span> Delete
      </button>
      <button type="button" id="manage-reservations-save" class="admin-crud-btn-primary"${state.saving ? ' disabled' : ''}>
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
        <p class="font-semibold text-on-surface">Select a reservation</p>
        <p class="text-body-sm mt-1">Choose an item from the list or create a new one.</p>
      </div>`;
    actions.innerHTML = `
      <button type="button" id="manage-reservations-footer-close" class="admin-crud-btn-ghost">Close</button>`;
    return;
  }

  mount.innerHTML = renderDetailView(selected);
  actions.innerHTML = `
    <button type="button" id="manage-reservations-footer-close" class="admin-crud-btn-ghost">Close</button>
    <button type="button" id="manage-reservations-edit" class="admin-crud-btn-primary">
      <span class="material-symbols-outlined text-[18px]">edit</span> Edit
    </button>`;
}

function render() {
  renderList();
  renderDetail();
}

function readFormFromDom() {
  const form = document.getElementById('manage-reservations-form');
  if (!form) return state.form;
  const fd = new FormData(form);
  return {
    user_id: fd.get('user_id'),
    room_id: fd.get('room_id'),
    check_in: fd.get('check_in'),
    check_out: fd.get('check_out'),
    guest_count: Number(fd.get('guest_count')) || 1,
    status: fd.get('status') || 'Pending',
    notes: fd.get('notes') || '',
  };
}

async function loadData() {
  state.loading = true;
  state.error = null;
  document.getElementById('manage-reservations-loading')?.classList.remove('hidden');
  render();

  try {
    const [bookings, rooms, users] = await Promise.all([
      getBookings(),
      getRooms(),
      getUsers(),
    ]);
    state.bookings = bookings;
    state.rooms = rooms;
    state.users = users;
    filterBookings();
    if (!state.selectedId && state.filtered.length) {
      state.selectedId = state.filtered[0].id;
    }
  } catch (err) {
    state.error = err.message || 'Failed to load reservations.';
  } finally {
    state.loading = false;
    document.getElementById('manage-reservations-loading')?.classList.add('hidden');
    render();
  }
}

function showModal() {
  const overlay = document.getElementById('manage-reservations-overlay');
  const modal = document.getElementById('manage-reservations-modal');
  previouslyFocused = document.activeElement;
  overlay?.classList.remove('hidden');
  modal?.classList.remove('hidden');
  overlay?.setAttribute('aria-hidden', 'false');
  modal?.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  const shell = modal?.querySelector('.admin-crud-shell');
  animateModalOpen(shell).catch(() => {});
  document.getElementById('manage-reservations-close')?.focus();
}

function hideModal() {
  const overlay = document.getElementById('manage-reservations-overlay');
  const modal = document.getElementById('manage-reservations-modal');
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
  const search = document.getElementById('manage-reservations-search');
  const status = document.getElementById('manage-reservations-status-filter');
  if (search) search.value = '';
  if (status) status.value = 'all';
}

export function isManageReservationsModalOpen() {
  return state.isOpen;
}

export async function openManageReservationsModal() {
  if (state.isOpen) return;
  state.isOpen = true;
  showModal();
  await loadData();
  window.dispatchEvent(new CustomEvent('manage-reservations:opened'));
}

export function closeManageReservationsModal() {
  if (!state.isOpen) return;
  state.isOpen = false;
  hideModal();
  resetState();
  render();
  window.dispatchEvent(new CustomEvent('manage-reservations:closed'));
}

function selectBooking(id) {
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
  if (state.users.length) state.form.user_id = state.users[0].id;
  state.mobileForm = true;
  state.error = null;
  state.message = null;
  render();
}

function startEdit() {
  const b = getSelected();
  if (!b) return;
  state.mode = 'edit';
  state.form = bookingToForm(b);
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

  try {
    if (state.mode === 'create') {
      await createBooking({
        user_id: Number(state.form.user_id),
        room_id: Number(state.form.room_id),
        check_in: state.form.check_in,
        check_out: state.form.check_out,
        guest_count: state.form.guest_count,
        notes: state.form.notes || undefined,
      });
      state.message = 'Reservation created successfully.';
      state.mode = 'view';
    } else if (state.mode === 'edit' && state.selectedId) {
      await updateBooking(state.selectedId, {
        check_in: state.form.check_in,
        check_out: state.form.check_out,
        guest_count: state.form.guest_count,
        status: state.form.status,
        notes: state.form.notes,
      });
      state.message = 'Reservation updated successfully.';
      state.mode = 'view';
    }
    await loadData();
    window.dispatchEvent(new CustomEvent('booking:updated'));
  } catch (err) {
    state.error = err.message || 'Could not save reservation.';
    render();
  } finally {
    state.saving = false;
    render();
  }
}

async function removeBooking() {
  if (!state.selectedId || state.saving) return;
  const b = getSelected();
  if (!b) return;
  if (!window.confirm(`Delete reservation #APT-${b.id} for ${b.guest_name}? This cannot be undone.`)) return;

  state.saving = true;
  state.error = null;
  render();

  try {
    await deleteBooking(state.selectedId);
    state.message = 'Reservation deleted.';
    state.selectedId = null;
    state.mode = 'view';
    state.mobileForm = false;
    await loadData();
    window.dispatchEvent(new CustomEvent('booking:updated'));
  } catch (err) {
    state.error = err.message || 'Could not delete reservation.';
  } finally {
    state.saving = false;
    render();
  }
}

function handleClick(e) {
  const card = e.target.closest('[data-booking-id]');
  if (card) {
    selectBooking(Number(card.getAttribute('data-booking-id')));
    return;
  }
  if (e.target.closest('#manage-reservations-new')) {
    startCreate();
    return;
  }
  if (e.target.closest('#manage-reservations-edit')) {
    startEdit();
    return;
  }
  if (e.target.closest('#manage-reservations-save')) {
    saveForm();
    return;
  }
  if (e.target.closest('#manage-reservations-cancel') || e.target.closest('#manage-reservations-back')) {
    cancelForm();
    return;
  }
  if (e.target.closest('#manage-reservations-delete')) {
    removeBooking();
    return;
  }
  if (e.target.closest('#manage-reservations-footer-close')) {
    closeManageReservationsModal();
  }
}

export function initManageReservationsModal() {
  if (initialized) return;
  initialized = true;

  const debouncedSearch = debounce((val) => {
    state.filter.search = val;
    filterBookings();
    render();
  });

  document.getElementById('manage-reservations-close')?.addEventListener('click', closeManageReservationsModal);
  document.getElementById('manage-reservations-overlay')?.addEventListener('click', closeManageReservationsModal);

  document.getElementById('manage-reservations-search')?.addEventListener('input', (e) => {
    debouncedSearch(e.target.value);
  });

  document.getElementById('manage-reservations-status-filter')?.addEventListener('change', (e) => {
    state.filter.status = e.target.value;
    filterBookings();
    render();
  });

  document.getElementById('manage-reservations-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'manage-reservations-modal') {
      closeManageReservationsModal();
      return;
    }
    handleClick(e);
  });

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-open-manage-reservations]');
    if (trigger) {
      e.preventDefault();
      openManageReservationsModal();
    }
  });
}
