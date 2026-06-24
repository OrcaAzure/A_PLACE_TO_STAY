/** Confirmed reservations — singles + groups. */

import { getBookings, getGroups, deleteBooking, deleteGroup, formatGroupId } from '/assets/js/services/api.js';
import {
  escapeHtml, formatDisplayId, formatDateLong, debounce, normStatus, getReservationCategory,
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
  filtered = list.filter((item) => {
    const cat = getReservationCategory(item);
    if (filter.category !== 'all' && cat !== filter.category) return false;
    if (!q) return true;
    return item._search.includes(q);
  });
}

function renderTable() {
  const body = $('manage-reservations-table-body');
  if (!body) return;
  if (loading) {
    body.innerHTML = '<tr><td colspan="8" class="res-empty-cell">Loading…</td></tr>';
    return;
  }
  if (!filtered.length) {
    body.innerHTML = '<tr><td colspan="8" class="res-empty-cell">No reservations yet. Use New Reservation or New Group.</td></tr>';
    return;
  }
  body.innerHTML = filtered.map((item) => {
    const isGroup = item.kind === 'group';
    const idLabel = isGroup ? formatGroupId(item.id) : formatDisplayId(item.id);
    const guest = isGroup ? escapeHtml(item.group_name || item.contact_name) : escapeHtml(item.guest_name || '—');
    const room = isGroup
      ? `${item.room_count || 0} rooms · ${item.total_guests} guests`
      : escapeHtml(`${item.building_name || ''} ${item.room_number || ''}`.trim());
    const key = isGroup ? `g-${item.id}` : `b-${item.id}`;
    return `<tr>
      <td><strong>${idLabel}</strong></td>
      <td>${isGroup ? '<span class="res-pill res-pill--pending">GROUP</span>' : '<span class="res-pill">SINGLE</span>'}</td>
      <td>${guest}</td>
      <td>${room}</td>
      <td>${formatDateLong(item.check_in)}</td>
      <td>${formatDateLong(item.check_out)}</td>
      <td>${isGroup ? item.total_guests : (item.guest_count ?? '—')}</td>
      <td class="res-td-actions">
        <button type="button" class="res-btn res-btn--ghost" data-edit-res="${key}">Edit</button>
        <button type="button" class="res-btn res-btn--danger" data-del-res="${key}">Delete</button>
      </td>
    </tr>`;
  }).join('');
  $('manage-reservations-footer-count').textContent = `${filtered.length} reservation(s)`;
}

function render() { renderTable(); }

async function load() {
  loading = true; render();
  try {
    const [bookings, groups] = await Promise.all([getBookings(), getGroups()]);
    const singles = bookings
      .filter((b) => !b.group_id && ['approved', 'cancelled'].includes(normStatus(b.status)))
      .map((b) => ({
        kind: 'single',
        ...b,
        _search: [b.id, formatDisplayId(b.id), b.guest_name, b.room_number, b.building_name].join(' ').toLowerCase(),
      }));
    const groupRows = groups
      .filter((g) => ['approved', 'cancelled'].includes(normStatus(g.status)))
      .map((g) => ({
        kind: 'group',
        ...g,
        check_in: g.check_in,
        check_out: g.check_out,
        _search: [g.id, formatGroupId(g.id), g.group_name, g.contact_name].join(' ').toLowerCase(),
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

async function remove(key) {
  const { kind, id } = parseKey(key);
  const item = list.find((x) => x.kind === kind && String(x.id) === String(id));
  if (!item) return;
  const label = kind === 'group' ? formatGroupId(id) : formatDisplayId(id);
  const name = kind === 'group' ? item.group_name : item.guest_name;
  if (!window.confirm(`Delete ${label} (${name})?`)) return;
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
