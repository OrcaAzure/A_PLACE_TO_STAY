/** Confirmed reservations — singles + groups. */

import { getBookings, getGroups, deleteBooking, deleteGroup } from '/assets/js/services/api.js';
import {
  escapeHtml, formatDateLong, statusBadge, debounce, normStatus, getReservationCategory,
  lifecyclePhaseForBooking, lifecyclePhaseBadge, canAdminCancelRoomBooking,
} from '/assets/js/features/reservation-shared.js';
import {
  cancelRoomReservation, confirmAdminCancelReservation,
} from '/assets/js/features/booking-actions.js';
import { confirmModal, showAlertModal } from '/assets/js/layout/ui.js';

let initialized = false;
let isOpen = false;
let list = [];
let filtered = [];
let filter = { search: '', category: 'all' };
let loading = false;

function $(id) { return document.getElementById(id); }

function applyFilter() {
  const q = filter.search.trim().toLowerCase();
  filtered = list.filter((item) => {
    const cat = getReservationCategory(item);
    if (filter.category !== 'all' && cat !== filter.category) return false;
    if (!q) return true;
    return item._search.includes(q);
  });
}

function categoryLabel(item) {
  return lifecyclePhaseBadge(lifecyclePhaseForBooking(item));
}

function reservationDetails(item) {
  const isGroup = item.kind === 'group';
  if (isGroup) {
    return `${item.room_count || 0} room(s) · ${item.total_guests} guest(s)`;
  }
  const building = item.building_name || '';
  const room = item.room_number || '';
  const type = item.room_type || '';
  const parts = [`${building} ${room}`.trim(), type].filter(Boolean);
  return parts.join(' · ') || 'Room not specified';
}

function guestCount(item) {
  return item.kind === 'group' ? item.total_guests : (item.guest_count ?? '—');
}

function renderList() {
  const mount = $('manage-reservations-list');
  if (!mount) return;
  if (loading) {
    mount.innerHTML = '<div class="res-empty-box">Loading reservations…</div>';
    return;
  }
  if (!filtered.length) {
    mount.innerHTML = '<div class="res-empty-box">No reservations found. Create a new single stay or group booking above.</div>';
    return;
  }
  mount.innerHTML = filtered.map((item) => {
    const isGroup = item.kind === 'group';
    const guest = isGroup
      ? escapeHtml(item.group_name || item.contact_name || 'Unnamed group')
      : escapeHtml(item.guest_name || 'Unknown guest');
    const key = isGroup ? `g-${item.id}` : `b-${item.id}`;
    const canCancel = canAdminCancelRoomBooking(item);

    return `<article class="res-list-card" role="listitem">
      <div class="res-list-card-top">
        <h3 class="res-list-title">${guest}</h3>
        <div class="res-list-badges">
          ${categoryLabel(item)}
          ${statusBadge(item.status)}
        </div>
      </div>
      <p class="res-list-detail">${escapeHtml(reservationDetails(item))}</p>
      <dl class="res-list-dates res-list-dates--triple">
        <div>
          <dt>Check-in</dt>
          <dd>${formatDateLong(item.check_in)}</dd>
        </div>
        <div>
          <dt>Check-out</dt>
          <dd>${formatDateLong(item.check_out)}</dd>
        </div>
        <div>
          <dt>Guests</dt>
          <dd>${guestCount(item)}</dd>
        </div>
      </dl>
      <div class="res-list-actions">
        <button type="button" class="res-btn res-btn--primary res-btn--wide" data-edit-res="${key}">
          <span class="material-symbols-outlined">edit</span> Edit
        </button>
        ${canCancel ? `
          <button type="button" class="res-btn res-btn--reject res-btn--wide" data-cancel-res="${key}">
            <span class="material-symbols-outlined">cancel</span> Cancel
          </button>` : ''}
      </div>
    </article>`;
  }).join('');
  $('manage-reservations-footer-count').textContent =
    `${filtered.length} reservation${filtered.length === 1 ? '' : 's'} shown`;
}

function render() { renderList(); }

async function load() {
  loading = true; render();
  try {
    const [bookings, groups] = await Promise.all([getBookings(), getGroups()]);
    const singles = bookings
      .filter((b) => !b.group_id && ['approved', 'cancelled'].includes(normStatus(b.status)))
      .map((b) => ({
        kind: 'single',
        ...b,
        _search: [b.guest_name, b.room_number, b.building_name].join(' ').toLowerCase(),
      }));
    const groupRows = groups
      .filter((g) => ['approved', 'cancelled'].includes(normStatus(g.status)))
      .map((g) => ({
        kind: 'group',
        ...g,
        check_in: g.check_in,
        check_out: g.check_out,
        _search: [g.group_name, g.contact_name].join(' ').toLowerCase(),
      }));
    list = [...singles, ...groupRows].sort((a, b) => String(a.check_in).localeCompare(String(b.check_in)));
    applyFilter();
  } finally { loading = false; render(); }
}

function show() {
  $('manage-reservations-overlay')?.classList.remove('hidden');
  $('manage-reservations-modal')?.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function hide() {
  $('manage-reservations-overlay')?.classList.add('hidden');
  $('manage-reservations-modal')?.classList.add('hidden');
  document.body.style.overflow = '';
}

export function isManageReservationsModalOpen() { return isOpen; }

export async function openManageReservationsModal() {
  if (isOpen) return;
  isOpen = true; show(); await load();
}

export function closeManageReservationsModal() {
  if (!isOpen) return;
  isOpen = false; hide();
}

function parseKey(key) {
  if (String(key).startsWith('g-')) return { kind: 'group', id: key.slice(2) };
  return { kind: 'single', id: String(key).startsWith('b-') ? key.slice(2) : key };
}

function openWizard(kind, id) {
  closeManageReservationsModal();
  if (kind === 'group') {
    window.dispatchEvent(new CustomEvent('group-wizard:open', { detail: { mode: 'edit', groupId: id } }));
  } else {
    window.dispatchEvent(new CustomEvent('reservation-wizard:open', { detail: { mode: 'edit', bookingId: id } }));
  }
}

async function cancel(key) {
  const { kind, id } = parseKey(key);
  const item = list.find((x) => x.kind === kind && String(x.id) === String(id));
  if (!item) return;
  const name = kind === 'group' ? item.group_name : item.guest_name;
  const pending = normStatus(item.status) === 'pending';
  const confirmed = await confirmAdminCancelReservation(name || 'this reservation', { pending });
  if (!confirmed) return;
  try {
    await cancelRoomReservation(id, { kind });
    window.dispatchEvent(new CustomEvent('booking:updated'));
    await load();
  } catch (err) {
    await showAlertModal('Could not cancel reservation', err.message || 'Could not cancel this reservation.');
  }
}

async function remove(key) {
  const { kind, id } = parseKey(key);
  const item = list.find((x) => x.kind === kind && String(x.id) === String(id));
  if (!item) return;
  const name = kind === 'group' ? item.group_name : item.guest_name;
  const confirmed = await confirmModal({
    title: 'Delete reservation record?',
    message: `Are you sure you want to permanently delete the record for <strong>${escapeHtml(name || 'this guest')}</strong>? This cannot be undone.`,
    confirmLabel: 'Delete permanently',
    cancelLabel: 'Keep record',
    danger: true,
  });
  if (!confirmed) return;
  if (kind === 'group') await deleteGroup(id);
  else await deleteBooking(id);
  window.dispatchEvent(new CustomEvent('booking:updated'));
  await load();
}

function onClick(e) {
  if (e.target.closest('[data-open-create-reservation]')) {
    e.preventDefault();
    closeManageReservationsModal();
    window.dispatchEvent(new CustomEvent('reservation-wizard:open', { detail: { mode: 'create' } }));
    return;
  }
  if (e.target.closest('[data-open-create-group]')) {
    e.preventDefault();
    closeManageReservationsModal();
    window.dispatchEvent(new CustomEvent('group-wizard:open', { detail: { mode: 'create' } }));
    return;
  }
  const edit = e.target.closest('[data-edit-res]');
  if (edit) {
    const { kind, id } = parseKey(edit.getAttribute('data-edit-res'));
    openWizard(kind, id);
    return;
  }
  const cancelBtn = e.target.closest('[data-cancel-res]');
  if (cancelBtn) { cancel(cancelBtn.getAttribute('data-cancel-res')); return; }
  const del = e.target.closest('[data-del-res]');
  if (del) { remove(del.getAttribute('data-del-res')); return; }
  if (e.target.closest('#manage-reservations-close-btn')) closeManageReservationsModal();
}

export function initManageReservationsModal() {
  if (initialized) return;
  initialized = true;
  const debounced = debounce((v) => { filter.search = v; applyFilter(); render(); });
  $('manage-reservations-close')?.addEventListener('click', closeManageReservationsModal);
  $('manage-reservations-close-btn')?.addEventListener('click', closeManageReservationsModal);
  $('manage-reservations-overlay')?.addEventListener('click', closeManageReservationsModal);
  $('manage-reservations-search')?.addEventListener('input', (e) => debounced(e.target.value));
  $('manage-reservations-status-filter')?.addEventListener('change', (e) => { filter.category = e.target.value; applyFilter(); render(); });
  $('manage-reservations-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'manage-reservations-modal') closeManageReservationsModal();
    else onClick(e);
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-manage-reservations]')) { e.preventDefault(); openManageReservationsModal(); }
  });
  window.addEventListener('booking:updated', () => { if (isOpen) load(); });
}
