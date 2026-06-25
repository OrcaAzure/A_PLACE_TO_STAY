/** Guest requests — singles + group requests. */

import {
  getBookings, getGroups, updateBooking, updateGroup,
  getRoomAvailability, suggestGroupRooms,
  normalizeManageRequest, normalizeManageGroupRequest,
} from '/assets/js/services/api.js';
import {
  escapeHtml, formatDateLong, formatMoney, formatSubmittedAt,
  statusBadge, debounce, normStatus, stayNights,
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
let approvingKey = null;
let message = null;

function $(id) { return document.getElementById(id); }

function applyFilter() {
  const q = filter.search.trim().toLowerCase();
  filtered = requests.filter((r) => {
    if (filter.status !== 'all' && normStatus(r.status) !== filter.status) return false;
    if (!q) return true;
    const hay = [
      r.displayId, r.requester?.name, r.requester?.email, r.requester?.role,
      r.contactPhone, r.id, r.groupName, r.kind, r.notes,
      r.facility?.building, r.facility?.roomNumber, r.facility?.roomType,
    ].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

function syncBadge() {
  const n = requests.filter((r) => normStatus(r.status) === 'pending').length;
  const el = $('pending-count');
  if (el) el.textContent = `${n} PENDING`;
  const b = $('manage-requests-pending-badge');
  if (b) b.textContent = n === 1 ? '1 waiting' : `${n} waiting`;
}

function typeLabel(r) {
  return r.kind === 'group'
    ? '<span class="res-pill res-pill--group">Group stay</span>'
    : '<span class="res-pill res-pill--single">Single room</span>';
}

function formatMealsSummary(meals) {
  if (!meals?.length) return null;
  const items = meals
    .filter((m) => Number(m.quantity) > 0)
    .map((m) => `${m.meal_type} × ${m.quantity}`);
  return items.length ? items.join(', ') : null;
}

function formatFeesSummary(fees) {
  if (!fees?.length) return null;
  return fees.map((f) => `${f.fee_name} (${formatMoney(f.amount)})`).join(', ');
}

function factRow(label, value, { mono = false } = {}) {
  const display = value != null && String(value).trim() !== '' ? String(value) : '—';
  const ddClass = mono ? ' class="res-request-mono"' : '';
  return `<div class="res-request-fact">
    <dt>${escapeHtml(label)}</dt>
    <dd${ddClass}>${escapeHtml(display)}</dd>
  </div>`;
}

function renderSection(title, rowsHtml) {
  if (!rowsHtml) return '';
  return `<section class="res-request-section">
    <h4 class="res-request-section-title">${escapeHtml(title)}</h4>
    <div class="res-request-facts">${rowsHtml}</div>
  </section>`;
}

function renderNotes(notes) {
  const text = notes?.trim();
  if (!text) return '';
  return `<section class="res-request-section">
    <h4 class="res-request-section-title">Notes from guest</h4>
    <p class="res-request-notes">${escapeHtml(text)}</p>
  </section>`;
}

function renderSingleRequest(r) {
  const building = r.facility?.building || '';
  const room = r.facility?.roomNumber || '';
  const type = r.facility?.roomType || '';
  const roomLabel = [`${building} ${room}`.trim(), type].filter(Boolean).join(' · ') || 'Not specified';
  const nights = stayNights(r.schedule?.checkIn, r.schedule?.checkOut);
  const meals = formatMealsSummary(r.meals);
  const fees = formatFeesSummary(r.fees);
  const addonRows = [
    meals ? factRow('Meals ordered', meals) : '',
    fees ? factRow('Extra services', fees) : '',
  ].filter(Boolean).join('');

  const contactRows = [
    factRow('Name', r.requester?.name),
    factRow('Email', r.requester?.email),
    factRow('Phone', r.contactPhone),
    factRow('Role', r.requester?.role),
  ].join('');

  const stayRows = [
    factRow('Check-in', formatDateLong(r.schedule?.checkIn)),
    factRow('Check-out', formatDateLong(r.schedule?.checkOut)),
    factRow('Length of stay', nights ? `${nights} night${nights === 1 ? '' : 's'}` : null),
    factRow('Guests in room', r.guestCount != null ? String(r.guestCount) : null),
  ].join('');

  const pricingRows = [
    factRow('Estimated total', r.totalAmount != null ? formatMoney(r.totalAmount) : null),
    factRow('Season', r.season),
    factRow('Rate type', r.occupancyItem),
  ].join('');

  const roomRows = factRow('Requested room', roomLabel);

  return `
    ${renderSection('Contact person', contactRows)}
    ${renderSection('Room requested', roomRows)}
    ${renderSection('Stay dates', stayRows)}
    ${renderSection('Pricing estimate', pricingRows)}
    ${addonRows ? renderSection('Meals & extras', addonRows) : ''}
    ${renderNotes(r.notes)}
  `;
}

function renderGroupRequest(r) {
  const nights = stayNights(r.schedule?.checkIn, r.schedule?.checkOut);
  const roomsLabel = r.roomsRequested != null
    ? `${r.roomsRequested} room${Number(r.roomsRequested) === 1 ? '' : 's'} requested`
    : 'Not specified';

  const contactRows = [
    factRow('Contact name', r.requester?.name),
    factRow('Email', r.contactEmail || r.requester?.email),
    factRow('Phone', r.contactPhone),
  ].join('');

  const stayRows = [
    factRow('Check-in', formatDateLong(r.schedule?.checkIn)),
    factRow('Check-out', formatDateLong(r.schedule?.checkOut)),
    factRow('Length of stay', nights ? `${nights} night${nights === 1 ? '' : 's'}` : null),
    factRow('Total guests', r.totalGuests != null ? String(r.totalGuests) : null),
    factRow('Rooms needed', roomsLabel),
  ].join('');

  let assignedSection = '';
  if (r.assignedBookings?.length) {
    const rows = r.assignedBookings.map((b) => {
      const label = [`${b.building} ${b.roomNumber}`.trim(), b.roomType].filter(Boolean).join(' · ');
      const detail = b.guestCount != null ? `${b.guestCount} guest${b.guestCount === 1 ? '' : 's'}` : '';
      const cost = b.totalAmount != null ? formatMoney(b.totalAmount) : '';
      return factRow(label || 'Room', [detail, cost].filter(Boolean).join(' · '));
    }).join('');
    assignedSection = renderSection('Rooms already assigned', rows);
  }

  const pricingSection = r.grandTotal != null && r.grandTotal > 0
    ? renderSection('Pricing estimate', factRow('Estimated total', formatMoney(r.grandTotal)))
    : '';

  return `
    ${renderSection('Contact person', contactRows)}
    ${renderSection('Stay details', stayRows)}
    ${assignedSection}
    ${pricingSection}
    ${renderNotes(r.notes)}
  `;
}

function renderRequestCard(r) {
  const pending = normStatus(r.status) === 'pending';
  const isGroup = r.kind === 'group';
  const title = isGroup
    ? escapeHtml(r.groupName || r.requester?.name || 'Unnamed group')
    : escapeHtml(r.requester?.name || 'Unknown guest');
  const subtitle = isGroup
    ? `Contact: ${escapeHtml(r.requester?.name || '—')}`
    : escapeHtml([r.facility?.building, r.facility?.roomNumber].filter(Boolean).join(' ') || 'Room pending assignment');
  const key = isGroup ? `g-${r.id}` : `b-${r.id}`;
  const isApproving = approvingKey === key;

  const actions = pending
    ? `<div class="res-list-actions res-list-actions--triple">
         <button type="button" class="res-btn res-btn--approve res-btn--wide" data-approve="${key}" ${isApproving || saving ? 'disabled' : ''}>
           <span class="material-symbols-outlined">${isApproving ? 'hourglass_top' : 'check_circle'}</span>
           ${isApproving ? 'Approving…' : 'Approve'}
         </button>
         <button type="button" class="res-btn res-btn--modify res-btn--wide" data-modify="${key}" ${isApproving || saving ? 'disabled' : ''}>
           <span class="material-symbols-outlined">edit</span>
           Modify
         </button>
         <button type="button" class="res-btn res-btn--reject res-btn--wide" data-reject="${key}" ${isApproving || saving ? 'disabled' : ''}>
           <span class="material-symbols-outlined">cancel</span>
           Decline
         </button>
       </div>`
    : `<p class="res-list-done">This request was ${normStatus(r.status)}${r.updatedAt ? ` on ${formatSubmittedAt(r.updatedAt)}` : ''}.</p>`;

  const body = isGroup ? renderGroupRequest(r) : renderSingleRequest(r);

  return `<article class="res-list-card res-request-card" role="listitem">
    <div class="res-list-card-head">
      <div class="res-list-meta">
        <span class="res-list-id">${escapeHtml(r.displayId)}</span>
        ${typeLabel(r)}
      </div>
      ${statusBadge(r.status)}
    </div>
    <div class="res-request-head">
      <h3 class="res-list-title">${title}</h3>
      <p class="res-request-subtitle">${subtitle}</p>
      <p class="res-request-submitted">Submitted ${formatSubmittedAt(r.submittedAt)}</p>
    </div>
    <div class="res-request-body">${body}</div>
    ${actions}
  </article>`;
}

function renderList() {
  const list = $('manage-requests-list');
  if (!list) return;
  if (loading) {
    list.innerHTML = '<div class="res-empty-box">Loading requests…</div>';
    return;
  }
  if (!filtered.length) {
    list.innerHTML = '<div class="res-empty-box">No requests match your search or filter.</div>';
    return;
  }
  list.innerHTML = filtered.map((r) => renderRequestCard(r)).join('');
  $('manage-requests-footer-count').textContent = `${filtered.length} request${filtered.length === 1 ? '' : 's'} shown`;
}

function renderRejectSummary(r) {
  if (!r) return '';
  const isGroup = r.kind === 'group';
  const nights = stayNights(r.schedule?.checkIn, r.schedule?.checkOut);
  const lines = isGroup
    ? [
      r.groupName,
      `${r.totalGuests ?? '?'} guests · ${r.roomsRequested ?? '?'} rooms`,
      `${formatDateLong(r.schedule?.checkIn)} → ${formatDateLong(r.schedule?.checkOut)}${nights ? ` (${nights} nights)` : ''}`,
    ]
    : [
      r.requester?.name,
      [`${r.facility?.building || ''} ${r.facility?.roomNumber || ''}`.trim(), r.facility?.roomType].filter(Boolean).join(' · '),
      `${formatDateLong(r.schedule?.checkIn)} → ${formatDateLong(r.schedule?.checkOut)}${nights ? ` (${nights} nights)` : ''} · ${r.guestCount ?? '?'} guest(s)`,
      r.totalAmount != null ? formatMoney(r.totalAmount) : null,
    ].filter(Boolean);

  return `<ul class="res-reject-summary">${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`;
}

function renderReject() {
  const r = rejectTarget;
  $('manage-requests-list-view')?.classList.add('hidden');
  $('manage-requests-reject-view')?.classList.remove('hidden');
  $('manage-requests-reject-view').innerHTML = `
    <div class="res-reject-box">
      <div class="res-reject-icon" aria-hidden="true"><span class="material-symbols-outlined">warning</span></div>
      <h3 class="res-subhead">Decline ${escapeHtml(r?.displayId || 'this request')}?</h3>
      ${renderRejectSummary(r)}
      <label class="res-label" for="reject-note">Reason for declining (optional — saved in notes)</label>
      <textarea id="reject-note" class="res-input" rows="4" placeholder="e.g. Dates unavailable, room capacity exceeded, missing information…"></textarea>
      <div class="res-list-actions res-reject-actions">
        <button type="button" class="res-btn res-btn--secondary res-btn--wide" data-reject-cancel>Go back</button>
        <button type="button" class="res-btn res-btn--reject res-btn--wide" data-reject-confirm>${saving ? 'Declining…' : 'Confirm decline'}</button>
      </div>
    </div>`;
}

function render() {
  if (view === 'reject') { renderReject(); return; }
  $('manage-requests-list-view')?.classList.remove('hidden');
  $('manage-requests-reject-view')?.classList.add('hidden');
  renderList();
  const fb = $('manage-requests-feedback');
  if (message) {
    fb.textContent = message;
    fb.className = message.includes('approved') || message.includes('declined')
      ? 'res-feedback res-feedback--ok'
      : 'res-feedback res-feedback--err';
    fb.classList.remove('hidden');
  } else fb?.classList.add('hidden');
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
    requests = [...singles, ...groupRows].sort((a, b) => String(b.submittedAt || b.schedule?.checkIn).localeCompare(String(a.submittedAt || a.schedule?.checkIn)));
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

async function approveSingleDirect(r) {
  const avail = await getRoomAvailability({
    check_in: r.schedule?.checkIn,
    check_out: r.schedule?.checkOut,
    guest_count: r.guestCount || 1,
    exclude_booking_id: r.id,
  });
  const room = (avail.rooms || []).find((x) => String(x.id) === String(r.roomId));
  if (!room || room.availability_status !== 'available') {
    throw new Error('The requested room is no longer available on these dates. Use Modify to pick another room.');
  }
  await updateBooking(r.id, { status: 'Approved', notify_guest: true });
}

async function approveGroupDirect(r) {
  const data = await suggestGroupRooms({
    check_in: r.schedule?.checkIn,
    check_out: r.schedule?.checkOut,
    total_guests: r.totalGuests || 1,
    exclude_group_id: r.id,
  });
  if (!data.suggestion?.length) {
    throw new Error('Could not auto-assign rooms for this group. Use Modify to pick rooms manually.');
  }
  const rooms = data.suggestion.map((s) => ({
    room_id: s.room_id,
    guest_count: s.guest_count,
  }));
  await updateGroup(r.id, {
    status: 'Approved',
    rooms,
    notify_guest: true,
  });
}

async function approve(key) {
  const { kind, id } = parseKey(key);
  const r = requests.find((x) => x.kind === kind && String(x.id) === String(id));
  if (!r || saving || approvingKey) return;

  approvingKey = key;
  message = null;
  render();

  try {
    if (kind === 'group') {
      await approveGroupDirect(r);
    } else {
      await approveSingleDirect(r);
    }
    message = `${r.displayId} approved. The guest will be notified by email.`;
    window.dispatchEvent(new CustomEvent('booking:updated'));
    await load();
  } catch (err) {
    message = err.message || 'Could not approve this request.';
    approvingKey = null;
    render();
  } finally {
    approvingKey = null;
  }
}

function modify(key) {
  const { kind, id } = parseKey(key);
  const r = requests.find((x) => x.kind === kind && String(x.id) === String(id));
  if (!r) return;
  closeManageRequestsModal();
  openRequestWizard(r, { modifyRequest: true });
}

function openRequestWizard(r, { modifyRequest = false } = {}) {
  if (r.kind === 'group') {
    window.dispatchEvent(new CustomEvent('group-wizard:open', {
      detail: {
        fromRequestId: r.id,
        modifyRequest,
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
        originalRequest: {
          checkIn: r.schedule?.checkIn,
          checkOut: r.schedule?.checkOut,
          roomsRequested: r.roomsRequested,
        },
      },
    }));
  } else {
    window.dispatchEvent(new CustomEvent('reservation-wizard:open', {
      detail: {
        fromRequestId: r.id,
        modifyRequest,
        prefill: {
          userId: r.userId,
          guestName: r.requester?.name,
          email: r.requester?.email,
          contactPhone: r.contactPhone,
          checkIn: r.schedule?.checkIn,
          checkOut: r.schedule?.checkOut,
          guestCount: r.guestCount,
          roomId: r.roomId,
          notes: r.notes,
          facility: r.facility,
        },
        originalRequest: {
          roomId: r.roomId,
          checkIn: r.schedule?.checkIn,
          checkOut: r.schedule?.checkOut,
          building: r.facility?.building,
          roomNumber: r.facility?.roomNumber,
          roomLabel: [r.facility?.building, r.facility?.roomNumber].filter(Boolean).join(' '),
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
    message = 'Request declined.'; view = 'list'; rejectTarget = null;
    window.dispatchEvent(new CustomEvent('booking:updated'));
    await load();
  } finally { saving = false; render(); }
}

function onClick(e) {
  const approveBtn = e.target.closest('[data-approve]');
  if (approveBtn) { approve(approveBtn.getAttribute('data-approve')); return; }
  const modifyBtn = e.target.closest('[data-modify]');
  if (modifyBtn) { modify(modifyBtn.getAttribute('data-modify')); return; }
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
