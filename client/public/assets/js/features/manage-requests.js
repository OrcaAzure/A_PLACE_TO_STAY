/** Guest requests — singles + group requests. */

import {
  getBookings, getGroups, updateBooking, updateGroup,
  normalizeManageRequest, normalizeManageGroupRequest,
} from '/assets/js/services/api.js';
import {
  escapeHtml, formatDisplayId, formatDateLong, statusBadge, debounce, normStatus,
} from '/assets/js/features/reservation-shared.js';

let initialized = false;
let isOpen = false;
let requests = [];
let filtered = [];
let view = 'list';
let rejectTarget = null;
let filter = { search: '', status: 'pending' };
let loading = false;
let saving = false;
let message = null;

function $(id) { return document.getElementById(id); }

function applyFilter() {
  const q = filter.search.trim().toLowerCase();
  filtered = requests.filter((r) => {
    if (filter.status !== 'all' && normStatus(r.status) !== filter.status) return false;
    if (!q) return true;
    const hay = [
      r.displayId, r.requester?.name, r.id, r.requester?.email,
      r.groupName, r.kind,
    ].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

function syncBadge() {
  const n = requests.filter((r) => normStatus(r.status) === 'pending').length;
  const el = $('pending-count');
  if (el) el.textContent = `${n} PENDING`;
  const b = $('manage-requests-pending-badge');
  if (b) b.textContent = `${n} waiting`;
}

function typeLabel(r) {
  return r.kind === 'group'
    ? '<span class="res-pill res-pill--pending">GROUP</span>'
    : '<span class="res-pill">SINGLE</span>';
}

function renderTable() {
  const body = $('manage-requests-table-body');
  if (!body) return;
  if (loading) {
    body.innerHTML = '<tr><td colspan="7" class="res-empty-cell">Loading…</td></tr>';
    return;
  }
  if (!filtered.length) {
    body.innerHTML = '<tr><td colspan="7" class="res-empty-cell">No requests found.</td></tr>';
    return;
  }
  body.innerHTML = filtered.map((r) => {
    const pending = normStatus(r.status) === 'pending';
    const isGroup = r.kind === 'group';
    const guestLabel = isGroup ? escapeHtml(r.groupName || r.requester?.name) : escapeHtml(r.requester?.name || '—');
    const room = isGroup
      ? `${r.totalGuests} guests · ~${r.roomsRequested || '?'} rooms`
      : `${r.facility?.building || ''} ${r.facility?.roomNumber || ''}`.trim() || '—';
    const key = isGroup ? `g-${r.id}` : `b-${r.id}`;
    return `<tr>
      <td><strong>${escapeHtml(r.displayId)}</strong></td>
      <td>${typeLabel(r)}</td>
      <td>${guestLabel}</td>
      <td>${formatDateLong(r.schedule?.checkIn)} – ${formatDateLong(r.schedule?.checkOut)}</td>
      <td>${escapeHtml(room)}</td>
      <td>${statusBadge(r.status)}</td>
      <td class="res-td-actions">${pending
        ? `<button type="button" class="res-btn res-btn--primary" data-approve="${key}">Approve</button>
           <button type="button" class="res-btn res-btn--ghost" data-reject="${key}">Reject</button>`
        : '—'}</td>
    </tr>`;
  }).join('');
  $('manage-requests-footer-count').textContent = `${filtered.length} request(s)`;
}

function renderReject() {
  const r = rejectTarget;
  $('manage-requests-list-view')?.classList.add('hidden');
  $('manage-requests-reject-view')?.classList.remove('hidden');
  $('manage-requests-reject-view').innerHTML = `
    <div class="res-reject-box">
      <h3 class="res-subhead">Reject ${escapeHtml(r?.displayId || '')}?</h3>
      <p class="res-hint">${r?.kind === 'group' ? escapeHtml(r.groupName) : escapeHtml(r?.requester?.name || '')}</p>
      <label class="res-label">Reason (optional)</label>
      <textarea id="reject-note" class="res-input" rows="3"></textarea>
      <div class="res-actions-row">
        <button type="button" class="res-btn res-btn--ghost" data-reject-cancel>Go Back</button>
        <button type="button" class="res-btn res-btn--danger" data-reject-confirm>${saving ? 'Rejecting…' : 'Confirm Reject'}</button>
      </div>
    </div>`;
}

function render() {
  if (view === 'reject') { renderReject(); return; }
  $('manage-requests-list-view')?.classList.remove('hidden');
  $('manage-requests-reject-view')?.classList.add('hidden');
  renderTable();
  const fb = $('manage-requests-feedback');
  if (message) { fb.textContent = message; fb.classList.remove('hidden'); }
  else fb?.classList.add('hidden');
}

async function load() {
  loading = true; render();
  try {
    const [bookings, groups] = await Promise.all([getBookings(), getGroups()]);
    const singles = bookings
      .filter((b) => !b.group_id)
      .map(normalizeManageRequest)
      .filter((r) => ['pending', 'approved', 'rejected'].includes(normStatus(r.status)));
    const groupRows = groups
      .map(normalizeManageGroupRequest)
      .filter((r) => ['pending', 'approved', 'rejected'].includes(normStatus(r.status)));
    requests = [...singles, ...groupRows].sort((a, b) => String(b.schedule?.checkIn).localeCompare(String(a.schedule?.checkIn)));
    applyFilter(); syncBadge();
  } finally { loading = false; render(); }
}

function show() {
  $('manage-requests-overlay')?.classList.remove('hidden');
  $('manage-requests-modal')?.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function hide() {
  $('manage-requests-overlay')?.classList.add('hidden');
  $('manage-requests-modal')?.classList.add('hidden');
  document.body.style.overflow = '';
}

export function isManageRequestsModalOpen() { return isOpen; }

export async function openManageRequestsModal() {
  if (isOpen) return;
  isOpen = true; view = 'list'; rejectTarget = null; message = null;
  show(); await load();
}

export function closeManageRequestsModal() {
  if (!isOpen) return;
  isOpen = false; view = 'list'; hide(); render();
}

function parseKey(key) {
  if (String(key).startsWith('g-')) return { kind: 'group', id: key.slice(2) };
  if (String(key).startsWith('b-')) return { kind: 'single', id: key.slice(2) };
  return { kind: 'single', id: key };
}

function approve(key) {
  const { kind, id } = parseKey(key);
  const r = requests.find((x) => x.kind === kind && String(x.id) === String(id));
  if (!r) return;
  closeManageRequestsModal();
  if (kind === 'group') {
    window.dispatchEvent(new CustomEvent('group-wizard:open', {
      detail: {
        fromRequestId: r.id,
        prefill: {
          groupName: r.groupName,
          contactName: r.requester?.name,
          contactPhone: r.contactPhone,
          email: r.requester?.email,
          checkIn: r.schedule?.checkIn,
          checkOut: r.schedule?.checkOut,
          totalGuests: r.totalGuests,
          roomsRequested: r.roomsRequested,
          notes: r.notes,
          userId: r.userId,
        },
      },
    }));
  } else {
    window.dispatchEvent(new CustomEvent('reservation-wizard:open', {
      detail: {
        fromRequestId: r.id,
        prefill: {
          userId: r.userId, guestName: r.requester?.name, email: r.requester?.email,
          checkIn: r.schedule?.checkIn, checkOut: r.schedule?.checkOut,
          guestCount: r.guestCount, roomId: r.roomId, notes: r.notes,
        },
      },
    }));
  }
}

async function confirmReject() {
  if (!rejectTarget || saving) return;
  saving = true; render();
  const note = $('reject-note')?.value?.trim();
  const notes = note ? `${rejectTarget.notes ? rejectTarget.notes + '\n' : ''}[Rejected] ${note}` : rejectTarget.notes;
  try {
    if (rejectTarget.kind === 'group') {
      await updateGroup(rejectTarget.id, { status: 'Rejected', notes });
    } else {
      await updateBooking(rejectTarget.id, { status: 'Rejected', notes });
    }
    message = 'Request rejected.'; view = 'list'; rejectTarget = null;
    window.dispatchEvent(new CustomEvent('booking:updated'));
    await load();
  } finally { saving = false; render(); }
}

function onClick(e) {
  const approveBtn = e.target.closest('[data-approve]');
  if (approveBtn) { approve(approveBtn.getAttribute('data-approve')); return; }
  const rejectBtn = e.target.closest('[data-reject]');
  if (rejectBtn) {
    const { kind, id } = parseKey(rejectBtn.getAttribute('data-reject'));
    rejectTarget = requests.find((x) => x.kind === kind && String(x.id) === String(id));
    view = 'reject'; render(); return;
  }
  if (e.target.closest('[data-reject-cancel]')) { view = 'list'; rejectTarget = null; render(); return; }
  if (e.target.closest('[data-reject-confirm]')) { confirmReject(); return; }
  if (e.target.closest('#manage-requests-close-btn')) closeManageRequestsModal();
}

export function initManageRequestsModal() {
  if (initialized) return;
  initialized = true;
  const debounced = debounce((v) => { filter.search = v; applyFilter(); render(); });
  $('manage-requests-close')?.addEventListener('click', closeManageRequestsModal);
  $('manage-requests-close-btn')?.addEventListener('click', closeManageRequestsModal);
  $('manage-requests-overlay')?.addEventListener('click', closeManageRequestsModal);
  $('manage-requests-search')?.addEventListener('input', (e) => debounced(e.target.value));
  $('manage-requests-status-filter')?.addEventListener('change', (e) => { filter.status = e.target.value; applyFilter(); render(); });
  $('manage-requests-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'manage-requests-modal') closeManageRequestsModal();
    else onClick(e);
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-manage-requests]')) { e.preventDefault(); openManageRequestsModal(); }
  });
  window.addEventListener('booking:updated', () => { syncBadge(); if (isOpen) load(); });
}
