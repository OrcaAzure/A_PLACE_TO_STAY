/** Confirmed reservations — table list + wizard for create/edit. */

import { getBookings, deleteBooking } from '/assets/js/services/api.js';
import {
  escapeHtml, formatDisplayId, formatDateLong, statusBadge, debounce, normStatus, getReservationCategory,
} from '/assets/js/features/reservation-shared.js';

let initialized = false;
let isOpen = false;
let list = [];
let filtered = [];
let filter = { search: '', category: 'all' };
let loading = false;

function $(id) { return document.getElementById(id); }

function applyFilter() {
  const q = filter.search.trim().toLowerCase();
  filtered = list.filter((b) => {
    const cat = getReservationCategory(b);
    if (filter.category !== 'all' && cat !== filter.category) return false;
    if (!q) return true;
    return [b.id, formatDisplayId(b.id), b.guest_name, b.room_number, b.building_name].join(' ').toLowerCase().includes(q);
  });
}

function renderTable() {
  const body = $('manage-reservations-table-body');
  if (!body) return;
  if (loading) {
    body.innerHTML = '<tr><td colspan="7" class="res-empty-cell">Loading…</td></tr>';
    return;
  }
  if (!filtered.length) {
    body.innerHTML = '<tr><td colspan="7" class="res-empty-cell">No reservations yet. Click "New Reservation" to add one.</td></tr>';
    return;
  }
  body.innerHTML = filtered.map((b) => {
    const room = `${b.building_name || ''} ${b.room_number || ''}`.trim();
    return `<tr>
      <td><strong>${formatDisplayId(b.id)}</strong></td>
      <td>${escapeHtml(b.guest_name || '—')}</td>
      <td>${escapeHtml(room)}</td>
      <td>${formatDateLong(b.check_in)}</td>
      <td>${formatDateLong(b.check_out)}</td>
      <td>${b.guest_count ?? '—'}</td>
      <td class="res-td-actions">
        <button type="button" class="res-btn res-btn--ghost" data-edit-res="${b.id}">Edit</button>
        <button type="button" class="res-btn res-btn--danger" data-del-res="${b.id}">Delete</button>
      </td>
    </tr>`;
  }).join('');
  $('manage-reservations-footer-count').textContent = `${filtered.length} reservation(s)`;
}

function render() { renderTable(); }

async function load() {
  loading = true; render();
  try {
    list = (await getBookings()).filter((b) => {
      const s = normStatus(b.status);
      return s === 'approved' || s === 'cancelled';
    });
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

function openWizard(mode, bookingId = null) {
  closeManageReservationsModal();
  window.dispatchEvent(new CustomEvent('reservation-wizard:open', {
    detail: mode === 'edit' ? { mode: 'edit', bookingId } : { mode: 'create' },
  }));
}

async function remove(id) {
  const b = list.find((x) => String(x.id) === String(id));
  if (!b || !window.confirm(`Delete reservation ${formatDisplayId(id)} for ${b.guest_name}?`)) return;
  await deleteBooking(id);
  window.dispatchEvent(new CustomEvent('booking:updated'));
  await load();
}

function onClick(e) {
  if (e.target.closest('[data-open-create-reservation]')) {
    e.preventDefault(); openWizard('create'); return;
  }
  const edit = e.target.closest('[data-edit-res]');
  if (edit) { openWizard('edit', edit.getAttribute('data-edit-res')); return; }
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
