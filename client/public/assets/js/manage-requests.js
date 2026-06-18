/**
 * Manage Requests modal — master-detail popup for pending facility bookings.
 * Follows the same feature-module pattern as timeline.js and reservations.js.
 */

import { getBookings, updateBooking, normalizeManageRequest } from './api.js';


function debounce(fn, delayMs = 300) {
  let timerId = null;
  return function debounced(...args) {
    clearTimeout(timerId);
    timerId = setTimeout(() => fn.apply(this, args), delayMs);
  };
}

function formatDisplayId(id) {
  return `#APT-${id}`;
}

function formatDateRange(checkIn, checkOut) {
  const inDate = new Date(`${checkIn}T00:00:00`);
  const outDate = new Date(`${checkOut}T00:00:00`);
  const opts = { month: 'short', day: 'numeric' };
  const inStr = inDate.toLocaleDateString('en-US', opts);
  const outStr = outDate.toLocaleDateString('en-US', { ...opts, year: 'numeric' });
  return `${inStr} – ${outStr}`;
}

function formatDateOnly(dateStr) {
  if (!dateStr) return '—';
  const raw = String(dateStr).slice(0, 10);
  return new Date(`${raw}T00:00:00`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatRelativeTime(isoString) {
  const date = new Date(isoString);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return formatDateTime(isoString);
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const STATUS_CONFIG = {
  pending: { label: 'Pending', pillClass: 'status-pill-pending', dotColor: 'bg-amber-500' },
  approved: { label: 'Approved', pillClass: 'status-pill-approved', dotColor: 'bg-secondary' },
  rejected: { label: 'Rejected', pillClass: 'status-pill-rejected', dotColor: 'bg-error' },
  cancelled: { label: 'Cancelled', pillClass: 'status-pill-cancelled', dotColor: 'bg-on-surface-variant' },
};

function normalizeStatus(status) {
  return String(status || 'pending').toLowerCase();
}

function getStatusConfig(status) {
  return STATUS_CONFIG[normalizeStatus(status)] || STATUS_CONFIG.pending;
}

function enrichRequest(request) {
  return {
    ...request,
    displayId: request.displayId || formatDisplayId(request.id),
    status: normalizeStatus(request.status),
    facility: { ...request.facility },
    schedule: { ...request.schedule },
    requester: { ...request.requester },
  };
}

function filterRequests(requests, filterState) {
  const query = (filterState.searchQuery || '').trim().toLowerCase();
  const statusFilter = filterState.statusFilter || 'pending';
  const facilityFilter = filterState.facilityFilter || 'all';

  return requests.filter((req) => {
    if (statusFilter !== 'all' && req.status !== statusFilter) return false;
    if (facilityFilter !== 'all' && req.facility.building !== facilityFilter) return false;

    if (!query) return true;

    const haystack = [
      req.displayId,
      req.title,
      req.facility.building,
      req.facility.roomNumber,
      req.facility.roomType,
      req.requester.name,
      req.requester.email,
      req.notes,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(query);
  });
}

function getFacilities(requests) {
  const buildings = new Set(requests.map((r) => r.facility.building));
  return Array.from(buildings).sort();
}

function getRequestById(requests, id) {
  return requests.find((r) => String(r.id) === String(id)) || null;
}

function countPending(requests) {
  return requests.filter((r) => r.status === 'pending').length;
}

function createDefaultFilterState() {
  return {
    searchQuery: '',
    statusFilter: 'pending',
    facilityFilter: 'all',
  };
}

function syncPagePendingBadges(requests) {
  const pending = countPending(requests);
  const actionCard = document.getElementById('pending-count');
  if (actionCard) actionCard.textContent = `${pending} ACTION REQUIRED`;
  const kpi = document.getElementById('kpi-pending-count');
  if (kpi) kpi.textContent = String(pending);
}

function renderStatusBadge(status) {
  const config = getStatusConfig(status);
  return `<span class="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full ${config.pillClass}">
    <span class="w-1.5 h-1.5 rounded-full ${config.dotColor}"></span>
    ${escapeHtml(config.label)}
  </span>`;
}

function renderRequestSummaryCard(request, isSelected) {
  const facilityLabel = `${request.facility.building} ${request.facility.roomNumber}`;
  const dateRange = formatDateRange(request.schedule.checkIn, request.schedule.checkOut);
  const relative = formatRelativeTime(request.submittedAt);
  const selectedClass = isSelected ? ' is-selected' : '';
  const ariaSelected = isSelected ? 'true' : 'false';

  return `
    <button
      type="button"
      class="request-summary-card${selectedClass}"
      data-request-id="${request.id}"
      role="option"
      aria-selected="${ariaSelected}"
    >
      <div class="flex items-start justify-between gap-2 mb-1.5">
        <span class="text-[10px] font-bold text-primary uppercase tracking-widest">${escapeHtml(request.displayId)}</span>
        ${renderStatusBadge(request.status)}
      </div>
      <p class="text-body-sm font-bold text-on-surface truncate">${escapeHtml(request.title)}</p>
      <p class="text-[11px] text-on-surface-variant mt-0.5 truncate">${escapeHtml(facilityLabel)}</p>
      <div class="flex items-center justify-between mt-2 gap-2">
        <span class="text-[10px] text-on-surface-variant/80">${escapeHtml(dateRange)}</span>
        <span class="text-[10px] text-on-surface-variant/60 shrink-0">${escapeHtml(relative)}</span>
      </div>
    </button>
  `;
}

function renderRequestList(requests, selectedId) {
  if (!requests.length) {
    return `
      <div class="py-12 px-4 text-center">
        <span class="material-symbols-outlined text-[40px] text-on-surface-variant/40">inbox</span>
        <p class="text-body-sm font-bold text-on-surface mt-3">No requests match your filters</p>
        <p class="text-body-sm text-on-surface-variant mt-1">Try adjusting your search or filters.</p>
        <button type="button" id="manage-requests-clear-filters" class="mt-4 text-primary text-label-md font-bold hover:underline">
          Clear filters
        </button>
      </div>
    `;
  }

  return requests.map((req) => renderRequestSummaryCard(req, String(req.id) === String(selectedId))).join('');
}

function renderListEmptyState() {
  return `
    <div class="py-16 px-4 text-center">
      <span class="material-symbols-outlined text-[48px] text-on-surface-variant/40">inbox</span>
      <p class="text-body-sm font-bold text-on-surface mt-4">No reservation requests</p>
      <p class="text-body-sm text-on-surface-variant mt-1">There are no bookings in the system yet.</p>
    </div>
  `;
}

function renderListErrorState(message) {
  return `
    <div class="py-16 px-4 text-center">
      <span class="material-symbols-outlined text-[48px] text-error/60">error</span>
      <p class="text-body-sm font-bold text-error mt-4">Could not load requests</p>
      <p class="text-body-sm text-on-surface-variant mt-1">${escapeHtml(message)}</p>
    </div>
  `;
}

function renderDetailEmptyState() {
  return `
    <div class="flex flex-col items-center justify-center py-16 px-4 text-center h-full min-h-[280px]">
      <span class="material-symbols-outlined text-[48px] text-on-surface-variant/40">select_check_box</span>
      <p class="text-body-sm font-bold text-on-surface mt-4">Select a request to view details</p>
      <p class="text-body-sm text-on-surface-variant mt-1 max-w-xs">Choose a request from the list to see booking information and requester details.</p>
    </div>
  `;
}

function renderRequestDetail(request) {
  if (!request) {
    return `
      <div class="py-12 px-4 text-center">
        <p class="text-body-sm text-error font-bold">Request not found.</p>
        <p class="text-body-sm text-on-surface-variant mt-1">The selected request may have been removed.</p>
      </div>
    `;
  }

  const facilityLabel = `${request.facility.building} — ${request.facility.roomNumber}`;

  return `
    <div class="manage-requests-detail-content">
      <button type="button" id="manage-requests-detail-back" class="manage-requests-detail-back items-center gap-1 text-primary text-label-md font-bold mb-4 hover:underline" aria-label="Back to request list">
        <span class="material-symbols-outlined text-[20px]">arrow_back</span>
        Back to list
      </button>

      <div class="flex items-start justify-between gap-4 mb-6">
        <div class="min-w-0">
          <p class="text-[10px] font-bold text-primary uppercase tracking-widest">${escapeHtml(request.displayId)}</p>
          <h3 class="font-headline-sm text-on-surface mt-1">${escapeHtml(request.title)}</h3>
        </div>
        ${renderStatusBadge(request.status)}
      </div>

      <section class="mb-6">
        <h4 class="text-label-sm font-bold text-on-surface-variant uppercase tracking-wide mb-3">Booking Information</h4>
        <dl class="space-y-2.5">
          <div class="flex gap-2">
            <dt class="text-body-sm text-on-surface-variant w-28 shrink-0">Check-in</dt>
            <dd class="text-body-sm text-on-surface">${escapeHtml(formatDateOnly(request.schedule.checkIn))}</dd>
          </div>
          <div class="flex gap-2">
            <dt class="text-body-sm text-on-surface-variant w-28 shrink-0">Check-out</dt>
            <dd class="text-body-sm text-on-surface">${escapeHtml(formatDateOnly(request.schedule.checkOut))}</dd>
          </div>
          ${request.season ? `
          <div class="flex gap-2">
            <dt class="text-body-sm text-on-surface-variant w-28 shrink-0">Season</dt>
            <dd class="text-body-sm text-on-surface">${escapeHtml(request.season)}</dd>
          </div>` : ''}
          ${request.occupancyItem ? `
          <div class="flex gap-2">
            <dt class="text-body-sm text-on-surface-variant w-28 shrink-0">Occupancy</dt>
            <dd class="text-body-sm text-on-surface">${escapeHtml(request.occupancyItem)}</dd>
          </div>` : ''}
          <div class="flex gap-2">
            <dt class="text-body-sm text-on-surface-variant w-28 shrink-0">Facility</dt>
            <dd class="text-body-sm text-on-surface">${escapeHtml(facilityLabel)}</dd>
          </div>
          <div class="flex gap-2">
            <dt class="text-body-sm text-on-surface-variant w-28 shrink-0">Room type</dt>
            <dd class="text-body-sm text-on-surface">${escapeHtml(request.facility.roomType)}</dd>
          </div>
          ${request.guestCount != null ? `
          <div class="flex gap-2">
            <dt class="text-body-sm text-on-surface-variant w-28 shrink-0">Guests</dt>
            <dd class="text-body-sm text-on-surface">${escapeHtml(request.guestCount)}</dd>
          </div>` : ''}
          ${request.totalAmount != null && request.totalAmount > 0 ? `
          <div class="flex gap-2">
            <dt class="text-body-sm text-on-surface-variant w-28 shrink-0">Amount</dt>
            <dd class="text-body-sm text-on-surface">$${escapeHtml(request.totalAmount.toLocaleString())}</dd>
          </div>` : ''}
        </dl>
      </section>

      <section class="mb-6">
        <h4 class="text-label-sm font-bold text-on-surface-variant uppercase tracking-wide mb-3">Requester</h4>
        <dl class="space-y-2.5">
          <div class="flex gap-2">
            <dt class="text-body-sm text-on-surface-variant w-28 shrink-0">Name</dt>
            <dd class="text-body-sm text-on-surface">${escapeHtml(request.requester.name)}</dd>
          </div>
          <div class="flex gap-2">
            <dt class="text-body-sm text-on-surface-variant w-28 shrink-0">Email</dt>
            <dd class="text-body-sm text-on-surface">${escapeHtml(request.requester.email)}</dd>
          </div>
          <div class="flex gap-2">
            <dt class="text-body-sm text-on-surface-variant w-28 shrink-0">Role</dt>
            <dd class="text-body-sm text-on-surface">${escapeHtml(request.requester.role)}</dd>
          </div>
        </dl>
      </section>

      ${request.notes ? `
      <section class="mb-6">
        <h4 class="text-label-sm font-bold text-on-surface-variant uppercase tracking-wide mb-3">Notes</h4>
        <p class="text-body-sm text-on-surface leading-relaxed">${escapeHtml(request.notes)}</p>
      </section>` : ''}

      <section>
        <h4 class="text-label-sm font-bold text-on-surface-variant uppercase tracking-wide mb-3">Metadata</h4>
        <dl class="space-y-2.5">
          <div class="flex gap-2">
            <dt class="text-body-sm text-on-surface-variant w-28 shrink-0">Submitted</dt>
            <dd class="text-body-sm text-on-surface">${escapeHtml(formatDateTime(request.submittedAt))}</dd>
          </div>
          <div class="flex gap-2">
            <dt class="text-body-sm text-on-surface-variant w-28 shrink-0">Last updated</dt>
            <dd class="text-body-sm text-on-surface">${escapeHtml(formatDateTime(request.updatedAt))}</dd>
          </div>
        </dl>
      </section>
    </div>
  `;
}

function renderListSkeletons(count = 5) {
  return Array.from({ length: count }, () => '<div class="request-skeleton"></div>').join('');
}

function renderDetailSkeleton() {
  return `
    <div class="space-y-4 p-1">
      <div class="detail-skeleton-line w-24"></div>
      <div class="detail-skeleton-line w-3/4 h-5"></div>
      <div class="mt-6 space-y-3">
        <div class="detail-skeleton-line w-full"></div>
        <div class="detail-skeleton-line w-full"></div>
        <div class="detail-skeleton-line w-5/6"></div>
        <div class="detail-skeleton-line w-full"></div>
      </div>
    </div>
  `;
}

function updatePendingBadge(count, isLoading) {
  const el = document.getElementById('manage-requests-pending-badge');
  if (!el) return;
  el.textContent = isLoading ? '—' : `${count} pending`;
}

function updateFooterCount(filtered, total) {
  const el = document.getElementById('manage-requests-footer-count');
  if (!el) return;
  el.textContent = `Showing ${filtered} of ${total} requests`;
}

function updateFacilityFilterOptions(facilities, selected) {
  const select = document.getElementById('manage-requests-facility-filter');
  if (!select) return;

  const options = [
    '<option value="all">All Facilities</option>',
    ...facilities.map((f) => {
      const sel = f === selected ? ' selected' : '';
      return `<option value="${escapeHtml(f)}"${sel}>${escapeHtml(f)}</option>`;
    }),
  ];
  select.innerHTML = options.join('');
}

function syncFilterControls(filter) {
  const search = document.getElementById('manage-requests-search');
  const status = document.getElementById('manage-requests-status-filter');
  const facility = document.getElementById('manage-requests-facility-filter');

  if (search && search.value !== filter.searchQuery) search.value = filter.searchQuery;
  if (status && status.value !== filter.statusFilter) status.value = filter.statusFilter;
  if (facility && facility.value !== filter.facilityFilter) facility.value = filter.facilityFilter;
}

function updateActionButtons(hasSelection, isPending, isActionLoading) {
  const approve = document.getElementById('manage-requests-approve');
  const reject = document.getElementById('manage-requests-reject');
  const disabled = !hasSelection || !isPending || isActionLoading;
  if (approve) approve.disabled = disabled;
  if (reject) reject.disabled = disabled;
}

function updateActionFeedback(message, type = 'info') {
  const el = document.getElementById('manage-requests-action-feedback');
  if (!el) return;
  if (!message) {
    el.classList.add('hidden');
    el.textContent = '';
    return;
  }
  el.textContent = message;
  el.classList.remove('hidden', 'text-error', 'text-secondary', 'text-on-surface-variant');
  if (type === 'error') el.classList.add('text-error', 'font-bold');
  else if (type === 'success') el.classList.add('text-secondary', 'font-bold');
  else el.classList.add('text-on-surface-variant');
}

function setLoadingVisible(isLoading) {
  const overlay = document.getElementById('manage-requests-loading');
  if (!overlay) return;
  if (isLoading) {
    overlay.classList.remove('hidden');
    overlay.innerHTML = '<span class="text-label-md text-primary font-bold">Loading...</span>';
  } else {
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
  }
}

function renderModal(state) {
  const listEl = document.getElementById('manage-requests-list');
  const detailEl = document.getElementById('manage-requests-detail');
  const bodyEl = document.getElementById('manage-requests-body');

  if (!listEl || !detailEl) return;

  if (state.isLoading) {
    listEl.innerHTML = renderListSkeletons(6);
    detailEl.innerHTML = renderDetailSkeleton();
    updatePendingBadge(0, true);
    return;
  }

  const { requests, filteredRequests, selectedRequestId } = state;
  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  updatePendingBadge(pendingCount, false);
  updateFooterCount(filteredRequests.length, requests.length);
  updateFacilityFilterOptions(getFacilities(requests), state.filter.facilityFilter);
  syncFilterControls(state.filter);

  if (!requests.length) {
    listEl.innerHTML = state.error
      ? renderListErrorState(state.error)
      : renderListEmptyState();
  } else {
    listEl.innerHTML = renderRequestList(filteredRequests, selectedRequestId);
  }

  const selected = filteredRequests.find((r) => String(r.id) === String(selectedRequestId));
  const isPending = selected?.status === 'pending';

  if (!selectedRequestId || !selected) {
    detailEl.innerHTML = renderDetailEmptyState();
    updateActionButtons(false, false, state.actionLoading);
  } else {
    detailEl.innerHTML = renderRequestDetail(selected);
    updateActionButtons(true, isPending, state.actionLoading);
  }

  if (state.actionLoading) {
    updateActionFeedback('Updating booking…', 'info');
  } else if (state.actionMessage) {
    updateActionFeedback(state.actionMessage.text, state.actionMessage.type);
  } else if (state.error && requests.length) {
    updateActionFeedback(state.error, 'error');
  } else {
    updateActionFeedback('', 'info');
  }

  if (bodyEl) {
    bodyEl.classList.toggle('is-mobile-detail', state.mobileDetailView && !!selectedRequestId);
  }
}

let state = {
  isOpen: false,
  isLoading: false,
  selectedRequestId: null,
  requests: [],
  filteredRequests: [],
  filter: createDefaultFilterState(),
  error: null,
  mobileDetailView: false,
  actionLoading: false,
  actionMessage: null,
};

let initialized = false;
let focusTrapHandler = null;
let previouslyFocused = null;

function recomputeFiltered() {
  state.filteredRequests = filterRequests(state.requests, state.filter);
}

function reconcileSelection() {
  const stillVisible = state.filteredRequests.some(
    (r) => String(r.id) === String(state.selectedRequestId),
  );
  if (!stillVisible) {
    state.selectedRequestId = state.filteredRequests.length
      ? state.filteredRequests[0].id
      : null;
  }
}

function render() {
  renderModal(state);
}

function setFilter(partial) {
  state.filter = { ...state.filter, ...partial };
  recomputeFiltered();
  reconcileSelection();
  render();
}

function selectRequest(id) {
  state.selectedRequestId = id;
  state.mobileDetailView = true;
  render();
}

function resetState() {
  state.filter = createDefaultFilterState();
  state.selectedRequestId = null;
  state.mobileDetailView = false;
  state.error = null;
  state.actionLoading = false;
  state.actionMessage = null;
  recomputeFiltered();
  reconcileSelection();
}

async function refreshRequests() {
  state.isLoading = true;
  state.error = null;
  state.actionMessage = null;
  render();

  try {
    const bookings = await getBookings();
    state.requests = bookings.map((booking) => enrichRequest(normalizeManageRequest(booking)));
    recomputeFiltered();
    reconcileSelection();
    if (!state.selectedRequestId && state.filteredRequests.length) {
      state.selectedRequestId = state.filteredRequests[0].id;
    }
    syncPagePendingBadges(state.requests);
  } catch (err) {
    state.error = err.message || 'Failed to load requests.';
    state.requests = [];
    state.filteredRequests = [];
    state.selectedRequestId = null;
  } finally {
    state.isLoading = false;
    render();
  }
}

function getFocusableElements() {
  const modal = document.getElementById('manage-requests-modal');
  if (!modal) return [];
  return Array.from(
    modal.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => el.offsetParent !== null || el === document.activeElement);
}

function trapFocus(e) {
  if (!state.isOpen || e.key !== 'Tab') return;

  const focusable = getFocusableElements();
  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

function bindFocusTrap() {
  focusTrapHandler = trapFocus;
  document.addEventListener('keydown', focusTrapHandler);
}

function unbindFocusTrap() {
  if (focusTrapHandler) {
    document.removeEventListener('keydown', focusTrapHandler);
    focusTrapHandler = null;
  }
}

function showModal() {
  const overlay = document.getElementById('manage-requests-overlay');
  const modal = document.getElementById('manage-requests-modal');

  overlay?.classList.remove('hidden');
  modal?.classList.remove('hidden');
  overlay?.setAttribute('aria-hidden', 'false');
  modal?.setAttribute('aria-hidden', 'false');

  document.body.style.overflow = 'hidden';
  bindFocusTrap();

  const search = document.getElementById('manage-requests-search');
  if (search) {
    previouslyFocused = document.activeElement;
    search.focus();
  }
}

function hideModal() {
  const overlay = document.getElementById('manage-requests-overlay');
  const modal = document.getElementById('manage-requests-modal');

  overlay?.classList.add('hidden');
  modal?.classList.add('hidden');
  overlay?.setAttribute('aria-hidden', 'true');
  modal?.setAttribute('aria-hidden', 'true');

  document.body.style.overflow = '';
  unbindFocusTrap();

  if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
    previouslyFocused.focus();
  }
  previouslyFocused = null;
}

export function isManageRequestsModalOpen() {
  return state.isOpen;
}

export async function openManageRequestsModal() {
  if (state.isOpen) return;

  state.isOpen = true;
  showModal();
  await refreshRequests();

  if (!state.selectedRequestId && state.filteredRequests.length) {
    state.selectedRequestId = state.filteredRequests[0].id;
    render();
  }

  window.dispatchEvent(new CustomEvent('manage-requests:opened'));
}

export function closeManageRequestsModal() {
  if (!state.isOpen) return;

  state.isOpen = false;
  hideModal();
  resetState();
  render();

  window.dispatchEvent(new CustomEvent('manage-requests:closed'));
}

async function handleBookingAction(newStatus) {
  if (!state.selectedRequestId || state.actionLoading) return;

  const selected = getRequestById(state.filteredRequests, state.selectedRequestId);
  if (!selected || selected.status !== 'pending') return;

  state.actionLoading = true;
  state.error = null;
  render();

  try {
    await updateBooking(state.selectedRequestId, { status: newStatus });
    window.dispatchEvent(new CustomEvent('booking:updated', {
      detail: { id: state.selectedRequestId, status: newStatus },
    }));
    await refreshRequests();
    state.actionMessage = { text: `Booking ${newStatus.toLowerCase()}.`, type: 'success' };
    render();
  } catch (err) {
    state.error = err.message || 'Could not update booking. Please try again.';
    render();
  } finally {
    state.actionLoading = false;
    render();
  }
}

function handleApprove() {
  handleBookingAction('Approved');
}

function handleReject() {
  handleBookingAction('Rejected');
}

function clearFilters() {
  state.filter = createDefaultFilterState();
  recomputeFiltered();
  reconcileSelection();
  render();
}

function toggleMobileFilters() {
  const panel = document.getElementById('manage-requests-advanced-filters');
  const toggle = document.getElementById('manage-requests-filters-toggle');
  if (!panel || !toggle) return;

  const isExpanded = panel.classList.toggle('is-expanded');
  toggle.setAttribute('aria-expanded', String(isExpanded));
}

function handleDelegatedClick(e) {
  const card = e.target.closest('[data-request-id]');
  if (card) {
    const id = card.getAttribute('data-request-id');
    if (id) selectRequest(Number(id));
    return;
  }

  if (e.target.closest('#manage-requests-clear-filters')) {
    clearFilters();
    return;
  }

  if (e.target.closest('#manage-requests-detail-back')) {
    state.mobileDetailView = false;
    render();
  }
}

function handleKeydown(e) {
  if (!state.isOpen) return;

  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const list = state.filteredRequests;
    if (!list.length) return;

    const currentIdx = list.findIndex((r) => String(r.id) === String(state.selectedRequestId));
    let nextIdx = currentIdx;

    if (e.key === 'ArrowDown') {
      nextIdx = currentIdx < list.length - 1 ? currentIdx + 1 : 0;
    } else {
      nextIdx = currentIdx > 0 ? currentIdx - 1 : list.length - 1;
    }

    if (nextIdx !== currentIdx || currentIdx === -1) {
      e.preventDefault();
      selectRequest(list[nextIdx === -1 ? 0 : nextIdx].id);
    }
  }
}

export function initManageRequestsModal() {
  if (initialized) return;
  initialized = true;

  const debouncedSearch = debounce((value) => {
    setFilter({ searchQuery: value });
  }, 300);

  document.getElementById('manage-requests-close')?.addEventListener('click', closeManageRequestsModal);
  document.getElementById('manage-requests-footer-close')?.addEventListener('click', closeManageRequestsModal);
  document.getElementById('manage-requests-overlay')?.addEventListener('click', closeManageRequestsModal);

  document.getElementById('manage-requests-search')?.addEventListener('input', (e) => {
    debouncedSearch(e.target.value);
  });

  document.getElementById('manage-requests-status-filter')?.addEventListener('change', (e) => {
    setFilter({ statusFilter: e.target.value });
  });

  document.getElementById('manage-requests-facility-filter')?.addEventListener('change', (e) => {
    setFilter({ facilityFilter: e.target.value });
  });

  document.getElementById('manage-requests-refresh')?.addEventListener('click', () => {
    refreshRequests();
  });

  document.getElementById('manage-requests-approve')?.addEventListener('click', handleApprove);
  document.getElementById('manage-requests-reject')?.addEventListener('click', handleReject);
  document.getElementById('manage-requests-filters-toggle')?.addEventListener('click', toggleMobileFilters);

  document.getElementById('manage-requests-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'manage-requests-modal') {
      closeManageRequestsModal();
      return;
    }
    handleDelegatedClick(e);
  });

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-open-manage-requests]');
    if (trigger) {
      e.preventDefault();
      openManageRequestsModal();
    }
  });

  document.addEventListener('keydown', (e) => {
    const trigger = e.target.closest('[data-open-manage-requests]');
    if (trigger && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      openManageRequestsModal();
    }
  });

  document.addEventListener('keydown', handleKeydown);
}

