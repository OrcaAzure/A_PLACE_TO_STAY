/** Guest requests — simple table, approve opens wizard, reject with optional note. */

import { getBookings, updateBooking, normalizeManageRequest } from '/assets/js/services/api.js';
import {
  escapeHtml, formatDisplayId, formatDateLong, statusBadge, debounce, normStatus,
} from '/assets/js/features/reservation-shared.js';

let initialized = false;
let isOpen = false;
let requests = [];
let filtered = [];
let view = 'list';
let rejectId = null;
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
    return [r.displayId, r.requester?.name, r.id, r.requester?.email].join(' ').toLowerCase().includes(q);
  });
}

function syncBadge() {
  const n = requests.filter((r) => normStatus(r.status) === 'pending').length;
  const el = $('pending-count');
  if (el) el.textContent = `${n} PENDING`;
  const b = $('manage-requests-pending-badge');
  if (b) b.textContent = `${n} waiting`;
}

function renderTable() {
  const body = $('manage-requests-table-body');
  if (!body) return;
  if (loading) {
    body.innerHTML = '<tr><td colspan="6" class="res-empty-cell">Loading…</td></tr>';
    return;
  }
  if (!filtered.length) {
    body.innerHTML = '<tr><td colspan="6" class="res-empty-cell">No requests found.</td></tr>';
    return;
  }
  body.innerHTML = filtered.map((r) => {
    const pending = normStatus(r.status) === 'pending';
    const room = `${r.facility?.building || ''} ${r.facility?.roomNumber || ''}`.trim();
    return `<tr>
      <td><strong>${escapeHtml(r.displayId)}</strong></td>
      <td>${escapeHtml(r.requester?.name || '—')}</td>
      <td>${formatDateLong(r.schedule?.checkIn)} – ${formatDateLong(r.schedule?.checkOut)}</td>
      <td>${escapeHtml(room || '—')}</td>
      <td>${statusBadge(r.status)}</td>
      <td class="res-td-actions">${pending
        ? `<button type="button" class="res-btn res-btn--primary" data-approve="${r.id}">Approve</button>
           <button type="button" class="res-btn res-btn--ghost" data-reject="${r.id}">Reject</button>`
        : '—'}</td>
    </tr>`;
  }).join('');
  $('manage-requests-footer-count').textContent = `${filtered.length} request(s)`;
}

function renderReject() {
  const r = requests.find((x) => String(x.id) === String(rejectId));
  $('manage-requests-list-view')?.classList.add('hidden');
  $('manage-requests-reject-view')?.classList.remove('hidden');
  $('manage-requests-reject-view').innerHTML = `
    <div class="res-reject-box">
      <h3 class="res-subhead">Reject request ${escapeHtml(r?.displayId || '')}?</h3>
      <p class="res-hint">Guest: ${escapeHtml(r?.requester?.name || '')}</p>
      <label class="res-label">Reason (optional)</label>
      <textarea id="reject-note" class="res-input" rows="3" placeholder="e.g. Room not available on requested dates"></textarea>
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
    requests = (await getBookings()).map(normalizeManageRequest)
      .filter((r) => ['pending', 'approved', 'rejected'].includes(normStatus(r.status)));
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
  isOpen = true; view = 'list'; rejectId = null; message = null;
  show(); await load();
}

export function closeManageRequestsModal() {
  if (!isOpen) return;
  isOpen = false; view = 'list'; hide(); render();
}

function approve(id) {
  const r = requests.find((x) => String(x.id) === String(id));
  if (!r) return;
  closeManageRequestsModal();
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

async function confirmReject() {
  if (!rejectId || saving) return;
  saving = true; render();
  const r = requests.find((x) => String(x.id) === String(rejectId));
  const note = $('reject-note')?.value?.trim();
  const notes = note ? `${r?.notes ? r.notes + '\n' : ''}[Rejected] ${note}` : r?.notes;
  try {
    await updateBooking(rejectId, { status: 'Rejected', notes });
    message = 'Request rejected.'; view = 'list'; rejectId = null;
    window.dispatchEvent(new CustomEvent('booking:updated'));
    await load();
  } finally { saving = false; render(); }
}

function onClick(e) {
  if (e.target.closest('[data-approve]')) { approve(e.target.closest('[data-approve]').getAttribute('data-approve')); return; }
  if (e.target.closest('[data-reject]')) { view = 'reject'; rejectId = e.target.closest('[data-reject]').getAttribute('data-reject'); render(); return; }
  if (e.target.closest('[data-reject-cancel]')) { view = 'list'; rejectId = null; render(); return; }
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
