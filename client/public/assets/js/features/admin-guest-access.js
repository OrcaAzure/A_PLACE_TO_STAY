/**
 * Admin Guest Access — unified workflow (accounts + pending queue + activity).
 */

import {
  getGuestAccessOverview,
  createGuestUser,
  updateUser,
  getGuestAccessRequests,
  createGuestAccessRequest,
  approveGuestAccessRequest,
  rejectGuestAccessRequest,
  bulkDeactivateGuests,
  getGuestAccessActivity,
} from '/assets/js/services/api.js';
import { openModal, closeModal } from '/assets/js/layout/ui.js';

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let overview = { summary: {}, guests: [] };
let requests = [];
let guestShellInitialized = false;
/** @type {AbortController | null} */
let guestPageAbort = null;
/** @type {((e: KeyboardEvent) => void) | null} */
let guestEscapeHandler = null;
let activityEntries = [];
let statusFilter = 'all';
let searchQuery = '';
let activeTab = 'main';

const FILTER_LABELS = {
  all: 'All guests',
  active: 'Active only',
  inactive: 'Inactive only',
  in_stay: 'Currently staying',
  arriving: 'Arriving soon',
  review: 'Needs review',
};

const STAY_BADGE = {
  in_stay: 'ga-stay-badge--stay',
  arriving: 'ga-stay-badge--arriving',
  pending: 'ga-stay-badge--pending',
  upcoming: 'ga-stay-badge--upcoming',
  ended: 'ga-stay-badge--ended',
  none: 'ga-stay-badge--none',
};

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: '2-digit', year: 'numeric' });
}

function formatRelativeTime(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(iso);
}

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('[data-ga-tab]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.getAttribute('data-ga-tab') === tab);
  });
  $('ga-panel-main')?.classList.toggle('hidden', tab !== 'main');
  $('ga-panel-activity')?.classList.toggle('hidden', tab !== 'activity');
  if (tab === 'activity') loadGuestAccessActivity();
}

function elevateConfirmModal() {
  document.getElementById('modal-overlay')?.classList.add('ga-modal-top');
  document.getElementById('app-modal')?.classList.add('ga-modal-top');
}

function resetConfirmModalLayer() {
  document.getElementById('modal-overlay')?.classList.remove('ga-modal-top');
  document.getElementById('app-modal')?.classList.remove('ga-modal-top');
}

function confirmActionsHtml({ confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = {}) {
  const confirmClass = danger
    ? 'ga-confirm-danger px-5 py-2.5 min-h-[2.75rem]'
    : 'btn-primary px-5 py-2.5 min-h-[2.75rem]';
  return `
    <div class="flex justify-end gap-3 mt-6 pt-5 border-t border-outline-variant">
      <button type="button" class="settings-confirm-cancel px-4 py-2.5 rounded-lg border border-outline-variant text-on-surface-variant font-semibold text-sm hover:bg-surface-variant/30 transition-colors min-h-[2.75rem]" data-action="cancel">${escapeHtml(cancelLabel)}</button>
      <button type="button" class="${confirmClass}" data-action="confirm">${escapeHtml(confirmLabel)}</button>
    </div>`;
}

function bindConfirmModal(finish) {
  const body = document.getElementById('modalBody');
  body?.querySelector('[data-action="cancel"]')?.addEventListener('click', () => finish(false), { once: true });
  body?.querySelector('[data-action="confirm"]')?.addEventListener('click', () => finish(true), { once: true });
  document.getElementById('modal-close')?.addEventListener('click', () => finish(false), { once: true });
  document.getElementById('modal-overlay')?.addEventListener('click', () => finish(false), { once: true });
}

function openConfirmModal(title, bodyHtml) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resetConfirmModalLayer();
      closeModal();
      resolve(value);
    };

    // Defer one frame so the click that opened this dialog cannot hit the overlay.
    requestAnimationFrame(() => {
      elevateConfirmModal();
      openModal(title, bodyHtml);
      bindConfirmModal(finish);
    });
  });
}

function confirmAction(title, messageHtml, options = {}) {
  return openConfirmModal(
    title,
    `<p class="text-[0.9375rem] text-on-surface-variant leading-relaxed m-0">${messageHtml}</p>${confirmActionsHtml(options)}`,
  );
}

function showAlertModal(title, messageHtml, { confirmLabel = 'OK' } = {}) {
  return openConfirmModal(
    title,
    `<p class="text-[0.9375rem] text-on-surface-variant leading-relaxed m-0">${messageHtml}</p>
     <div class="flex justify-end gap-3 mt-6 pt-5 border-t border-outline-variant">
       <button type="button" class="btn-primary px-5 py-2.5 min-h-[2.75rem]" data-action="confirm">${escapeHtml(confirmLabel)}</button>
     </div>`,
  ).then(() => {});
}

function promptRejectRequest(req) {
  return openConfirmModal(
    'Reject request',
    `<p class="text-[0.9375rem] text-on-surface-variant leading-relaxed m-0">Are you sure you want to reject the request from <strong>${escapeHtml(req.full_name)}</strong> (${escapeHtml(req.email)})?</p>
     <label class="catalog-label mt-4" for="ga-reject-notes">Internal note <span class="text-slate-400 font-normal">(optional)</span></label>
     <textarea id="ga-reject-notes" class="catalog-input min-h-[4.5rem]" placeholder="Reason or follow-up notes…"></textarea>
     ${confirmActionsHtml({ confirmLabel: 'Confirm', danger: true })}`,
  ).then((confirmed) => {
    if (!confirmed) return null;
    return document.getElementById('ga-reject-notes')?.value?.trim() ?? '';
  });
}

function updateFilterUi() {
  const label = $('ga-filter-label');
  const toggle = $('ga-filter-toggle');
  if (label) label.textContent = FILTER_LABELS[statusFilter] || FILTER_LABELS.all;
  if (toggle) toggle.classList.toggle('ga-filter-btn--active', statusFilter !== 'all');

  document.querySelectorAll('[data-ga-filter]').forEach((btn) => {
    const active = btn.getAttribute('data-ga-filter') === statusFilter;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function setFilterPanelOpen(open) {
  const panel = $('ga-filter-panel');
  const toggle = $('ga-filter-toggle');
  if (!panel) return;
  panel.classList.toggle('hidden', !open);
  toggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function applyFilter(filter) {
  statusFilter = filter || 'all';
  updateFilterUi();
  setFilterPanelOpen(false);
  renderAccountsTable();
}

function getAddMode() {
  return document.querySelector('input[name="ga-add-mode"]:checked')?.value || 'grant';
}

function syncAddGuestModal() {
  const mode = getAddMode();
  const isGrant = mode === 'grant';

  $('ga-queue-notes')?.classList.toggle('hidden', isGrant);
  $('ga-grant-hint')?.classList.toggle('hidden', !isGrant);

  const hint = $('ga-mode-hint');
  const submit = $('guest-access-submit');
  if (hint) {
    hint.textContent = isGrant
      ? 'Use this when you are ready to send login details to the guest.'
      : 'Adds to the waiting list below. Approve when you are ready to send credentials.';
  }
  if (submit) {
    submit.textContent = isGrant ? 'Create account' : 'Save to queue';
  }
}

function showAddGuestModal(mode = 'form', { defer = false } = {}) {
  if (mode === 'form') clearGuestFormValidation();
  $('guest-access-modal-overlay')?.classList.remove('hidden');
  const modal = $('guest-access-modal');
  modal?.classList.remove('hidden', 'pointer-events-none');
  modal?.classList.add('pointer-events-auto');
  $('guest-access-modal-overlay')?.setAttribute('aria-hidden', 'false');
  modal?.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  $('guest-access-form')?.classList.toggle('hidden', mode !== 'form');
  $('guest-access-success')?.classList.toggle('hidden', mode !== 'success');

  const title = $('guest-access-modal-title');
  if (title) title.textContent = mode === 'success' ? 'Access granted' : 'Add guest';

  if (mode === 'form') {
    const queueRadio = document.querySelector('input[name="ga-add-mode"][value="queue"]');
    const grantRadio = document.querySelector('input[name="ga-add-mode"][value="grant"]');
    if (defer && queueRadio) queueRadio.checked = true;
    else if (grantRadio) grantRadio.checked = true;
    syncAddGuestModal();
    $('guest-name')?.focus();
  }
}

function hideAddGuestModal() {
  $('guest-access-modal-overlay')?.classList.add('hidden');
  const modal = $('guest-access-modal');
  modal?.classList.add('hidden', 'pointer-events-none');
  modal?.classList.remove('pointer-events-auto');
  $('guest-access-modal-overlay')?.setAttribute('aria-hidden', 'true');
  modal?.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  $('guest-access-form')?.reset();
  clearGuestFormValidation();
  $('guest-access-success')?.classList.add('hidden');
  $('guest-access-form')?.classList.remove('hidden');
  $('guest-temp-password-wrap')?.classList.remove('hidden');
  document.querySelector('input[name="ga-add-mode"][value="grant"]')?.click();
  syncAddGuestModal();
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateGuestForm({ full_name, email }) {
  if (!full_name && !email) return 'Full name and email are required.';
  if (!full_name) return 'Full name is required.';
  if (!email) return 'Email address is required.';
  if (!EMAIL_PATTERN.test(email)) return 'Please enter a valid email address.';
  return null;
}

function clearGuestFormValidation() {
  setFormFeedback('');
  $('guest-name')?.classList.remove('ga-input--error');
  $('guest-email')?.classList.remove('ga-input--error');
}

function markGuestFormErrors({ full_name, email }) {
  $('guest-name')?.classList.toggle('ga-input--error', !full_name);
  const emailInvalid = !email || !EMAIL_PATTERN.test(email);
  $('guest-email')?.classList.toggle('ga-input--error', emailInvalid);
}

function showGuestFormValidationError(message, { full_name, email }) {
  markGuestFormErrors({ full_name, email });
  setFormFeedback(message);
  if (!full_name) {
    $('guest-name')?.focus();
  } else {
    $('guest-email')?.focus();
  }
}

function showGrantSuccess({ full_name, email, temporaryPassword }) {
  $('guest-success-name').textContent = full_name;
  $('guest-success-email').textContent = email;

  if (temporaryPassword) {
    $('guest-temp-password').textContent = temporaryPassword;
    $('guest-temp-password-wrap')?.classList.remove('hidden');
  } else {
    $('guest-temp-password-wrap')?.classList.add('hidden');
  }

  showAddGuestModal('success');
}

function setFormFeedback(msg, { ok = false } = {}) {
  const el = $('guest-access-feedback');
  if (!el) return;
  if (!msg) {
    el.textContent = '';
    el.className = 'ga-form-feedback hidden';
    return;
  }
  el.textContent = msg;
  el.className = `ga-form-feedback${ok ? ' ga-form-feedback--ok' : ' ga-form-feedback--error'}`;
  el.classList.remove('hidden');
}

function filteredGuests() {
  return overview.guests.filter((guest) => {
    if (statusFilter === 'active' && guest.status !== 'Active') return false;
    if (statusFilter === 'inactive' && guest.status !== 'Inactive') return false;
    if (statusFilter === 'review' && !guest.stay?.needsReview) return false;
    if (statusFilter === 'in_stay' && guest.stay?.phase !== 'in_stay') return false;
    if (statusFilter === 'arriving' && guest.stay?.phase !== 'arriving') return false;
    if (!searchQuery) return true;
    const reservation = guest.stay?.reservation;
    const hay = [
      guest.full_name,
      guest.email,
      guest.organization,
      guest.stay?.summary,
      reservation?.label,
    ].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(searchQuery);
  });
}

function pendingRequests() {
  return requests.filter((r) => r.status === 'Pending');
}

function pendingCount() {
  return pendingRequests().length;
}

function jumpToReviewFilter() {
  applyFilter('review');
  $('guest-access-search')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function updatePendingStat() {
  const count = pendingCount();
  const card = $('ga-stat-pending-card');
  const hint = $('ga-stat-pending-hint');

  if (card) {
    card.classList.toggle('ga-stat--clickable', count > 0);
    card.classList.toggle('ga-stat--active', count > 0);
    card.toggleAttribute('role', count > 0 ? 'button' : false);
    card.toggleAttribute('tabindex', count > 0 ? '0' : false);
    card.setAttribute(
      'aria-label',
      count > 0
        ? `${count} pending request${count === 1 ? '' : 's'} — click to view`
        : 'Pending requests — none waiting',
    );
  }

  hint?.classList.toggle('hidden', count === 0);
}

function updateReviewNotice() {
  const count = overview.summary?.needsReview || 0;
  const notice = $('ga-review-notice');
  const text = $('ga-review-notice-text');
  const bulkBtn = $('ga-bulk-deactivate-btn');
  const bulkLabel = $('ga-bulk-deactivate-label');

  notice?.classList.toggle('hidden', count === 0);

  if (text) {
    text.textContent = count === 1
      ? '1 guest finished their stay and may no longer need portal access.'
      : `${count} guests finished their stay and may no longer need portal access.`;
  }

  if (bulkBtn) bulkBtn.classList.toggle('hidden', count === 0);
  if (bulkLabel) {
    bulkLabel.textContent = count === 1 ? 'Deactivate all (1)' : `Deactivate all (${count})`;
  }

  const reviewFilter = document.querySelector('[data-ga-filter="review"]');
  if (reviewFilter) {
    reviewFilter.textContent = count > 0 ? `Needs review (${count})` : 'Needs review';
  }
}

function openPendingRequestsModal() {
  if (pendingCount() <= 0) return;
  showPendingModal();
}

function bindPendingCard() {
  const card = $('ga-stat-pending-card');
  if (!card) return;

  card.onclick = (e) => {
    e.preventDefault();
    openPendingRequestsModal();
  };

  card.onkeydown = (e) => {
    if (pendingCount() > 0 && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      openPendingRequestsModal();
    }
  };
}

function updateStats() {
  const s = overview.summary || {};
  const set = (id, val) => { if ($(id)) $(id).textContent = String(val ?? '—'); };

  set('ga-stat-pending', pendingCount());
  set('ga-stat-arriving', s.arrivingThisWeek);
  set('ga-stat-staying', s.currentlyStaying);
  updatePendingStat();
  updateReviewNotice();
}

function stayCell(guest) {
  const stay = guest.stay || {};
  const badgeClass = STAY_BADGE[stay.phase] || STAY_BADGE.none;
  const reservation = stay.reservation;
  const detail = reservation
    ? `<span class="ga-stay-detail">${escapeHtml(reservation.label)}</span>`
    : '';

  let reviewHint = '';
  if (stay.needsReview && guest.status === 'Active') {
    reviewHint = `<span class="ga-stay-review-hint">Needs review</span>`;
  }

  return `<div class="ga-stay-cell">
    <span class="ga-stay-badge ${badgeClass}">${escapeHtml(stay.summary || 'No reservations')}</span>
    ${detail}
    ${reviewHint}
  </div>`;
}

function actionButtons(guest) {
  const isActive = guest.status === 'Active';
  const parts = [];

  if (isActive && guest.stay?.needsReview) {
    parts.push(`<button type="button" class="ga-btn-text ga-btn-text--danger ga-btn-text--emphasis" data-ga-deactivate="${guest.id}" data-ga-review="1">Deactivate</button>`);
  } else if (isActive) {
    parts.push(`<button type="button" class="ga-btn-text ga-btn-text--danger" data-ga-deactivate="${guest.id}">Deactivate</button>`);
  } else {
    parts.push(`<button type="button" class="ga-btn-text ga-btn-text--primary" data-ga-activate="${guest.id}">Reactivate</button>`);
  }

  if (guest.stay?.reservation) {
    parts.push(`<a href="/admin/reservations.html" class="ga-btn-text ga-btn-text--primary">View bookings</a>`);
  }

  return `<span class="ga-actions">${parts.join('')}</span>`;
}

let guestPendingClickBound = false;

function bindPendingModalActions() {
  if (guestPendingClickBound) return;
  guestPendingClickBound = true;

  $('ga-pending-modal-close')?.addEventListener('click', hidePendingModal);
  $('ga-pending-modal-done')?.addEventListener('click', hidePendingModal);
  $('ga-pending-modal-overlay')?.addEventListener('click', hidePendingModal);
  $('ga-pending-modal')?.querySelector('.ga-pending-body')?.addEventListener('click', handlePendingModalClick);
}

function showPendingModal() {
  if (!$('ga-pending-modal')) return;
  renderPendingModal();
  $('ga-pending-modal-overlay')?.classList.remove('hidden');
  const modal = $('ga-pending-modal');
  modal?.classList.remove('hidden', 'pointer-events-none');
  modal?.classList.add('pointer-events-auto');
  $('ga-pending-modal-overlay')?.setAttribute('aria-hidden', 'false');
  modal?.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function hidePendingModal() {
  $('ga-pending-modal-overlay')?.classList.add('hidden');
  const modal = $('ga-pending-modal');
  modal?.classList.add('hidden', 'pointer-events-none');
  modal?.classList.remove('pointer-events-auto');
  $('ga-pending-modal-overlay')?.setAttribute('aria-hidden', 'true');
  modal?.setAttribute('aria-hidden', 'true');
  if ($('guest-access-modal')?.classList.contains('hidden')) {
    document.body.style.overflow = '';
  }
}

function renderPendingModal() {
  const pending = pendingRequests();

  $('ga-pending-empty')?.classList.toggle('hidden', pending.length > 0);
  $('ga-pending-table-wrap')?.classList.toggle('hidden', pending.length === 0);

  const requestsTbody = $('ga-pending-modal-requests-tbody');
  if (requestsTbody) {
    requestsTbody.innerHTML = pending.map((req) => `
      <tr>
        <td class="font-medium">${escapeHtml(req.full_name)}</td>
        <td>${escapeHtml(req.email)}</td>
        <td>${escapeHtml(req.organization || '—')}</td>
        <td>${formatDate(req.created_at)}</td>
        <td class="ga-col-actions">
          <span class="ga-actions">
            <button type="button" class="ga-btn-text ga-btn-text--primary" data-ga-approve-request="${req.id}">Approve</button>
            <button type="button" class="ga-btn-text ga-btn-text--danger" data-ga-reject-request="${req.id}">Reject</button>
          </span>
        </td>
      </tr>`).join('');
  }

  const subtitle = $('ga-pending-modal-subtitle');
  if (subtitle) {
    subtitle.textContent = pending.length === 1
      ? '1 person is waiting for approval before they can log in.'
      : `${pending.length} people are waiting for approval before they can log in.`;
  }
}

async function refreshGuestAccessData() {
  await loadGuestAccessPage();
  if (activeTab === 'activity') await loadGuestAccessActivity();
  if (!$('ga-pending-modal')?.classList.contains('hidden')) {
    renderPendingModal();
    if (pendingCount() === 0) hidePendingModal();
  }
}

function handlePendingModalClick(e) {
  const approve = e.target.closest('[data-ga-approve-request]');
  if (approve) {
    handleApproveRequest(approve.getAttribute('data-ga-approve-request'));
    return;
  }
  const reject = e.target.closest('[data-ga-reject-request]');
  if (reject) handleRejectRequest(reject.getAttribute('data-ga-reject-request'));
}

function renderAccountsTable() {
  const tbody = $('guest-access-tbody');
  if (!tbody) return;

  const rows = filteredGuests();
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="5"><p class="ga-empty">${
      overview.guests.length
        ? 'No guest accounts match your filters.'
        : 'No guest accounts yet. Use <strong>Add guest</strong> to grant access or save a request for later.'
    }</p></td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map((guest) => {
    const isActive = guest.status === 'Active';
    const statusClass = isActive ? 'status-pill-approved' : 'status-pill-pending';
    const rowClass = guest.stay?.needsReview && isActive ? 'ga-row--review' : '';

    return `<tr class="${rowClass}">
      <td class="font-medium">${escapeHtml(guest.full_name)}</td>
      <td>${escapeHtml(guest.email)}</td>
      <td><span class="ga-access-pill ${statusClass}">${escapeHtml(guest.status)}</span></td>
      <td>${stayCell(guest)}</td>
      <td class="ga-col-actions">${actionButtons(guest)}</td>
    </tr>`;
  }).join('');
}

function renderActivityList() {
  const list = $('guest-activity-list');
  if (!list) return;

  if (!activityEntries.length) {
    list.innerHTML = '<li class="ga-empty">No guest access activity recorded yet.</li>';
    return;
  }

  list.innerHTML = activityEntries.map((entry) => `
    <li class="ga-activity-item">
      <span class="ga-activity-item__icon material-symbols-outlined" aria-hidden="true">history</span>
      <div class="ga-activity-item__body">
        <p class="ga-activity-item__summary">${escapeHtml(entry.summary)}</p>
        <p class="ga-activity-item__meta">${escapeHtml(formatRelativeTime(entry.createdAt))}</p>
      </div>
    </li>`).join('');
}

export async function loadGuestAccessPage() {
  const tbody = $('guest-access-tbody');
  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="5"><p class="ga-empty">Loading…</p></td></tr>';
  }

  try {
    const [overviewData, requestData] = await Promise.all([
      getGuestAccessOverview(),
      getGuestAccessRequests(),
    ]);
    overview = overviewData;
    overview.guests = overview.guests || [];
    overview.summary = overview.summary || {};
    requests = requestData;

    updateStats();
    renderAccountsTable();
    bindPendingCard();
  } catch (err) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="5"><p class="ga-empty text-error">${escapeHtml(err.message || 'Failed to load guest access.')}</p></td></tr>`;
    }
  }
}

async function loadGuestAccessActivity() {
  const list = $('guest-activity-list');
  if (list) list.innerHTML = '<li class="ga-empty">Loading activity…</li>';

  try {
    activityEntries = await getGuestAccessActivity(30);
    renderActivityList();
  } catch (err) {
    if (list) {
      list.innerHTML = `<li class="ga-empty text-error">${escapeHtml(err.message || 'Failed to load activity.')}</li>`;
    }
  }
}

async function submitAddGuest(e) {
  e.preventDefault();
  const btn = $('guest-access-submit');

  const full_name = $('guest-name')?.value?.trim() || '';
  const email = $('guest-email')?.value?.trim() || '';
  const organization = $('guest-org')?.value?.trim() || undefined;
  const isGrant = getAddMode() === 'grant';

  clearGuestFormValidation();

  const validationError = validateGuestForm({ full_name, email });
  if (validationError) {
    showGuestFormValidationError(validationError, { full_name, email });
    return;
  }

  const confirmed = await confirmAction(
    isGrant ? 'Create guest account' : 'Save to queue',
    isGrant
      ? `Are you sure you want to create login for <strong>${escapeHtml(full_name)}</strong> (${escapeHtml(email)})? A temporary password will be emailed to the guest.`
      : `Are you sure you want to save <strong>${escapeHtml(full_name)}</strong> (${escapeHtml(email)}) to the waiting list?`,
  );
  if (!confirmed) return;

  btn.disabled = true;
  setFormFeedback('');

  try {
    if (isGrant) {
      const result = await createGuestUser({ full_name, email, organization });
      clearGuestFormValidation();
      showGrantSuccess({
        full_name: result.user.full_name,
        email: result.user.email,
        temporaryPassword: result.temporaryPassword,
      });
    } else {
      await createGuestAccessRequest({
        full_name,
        email,
        organization,
        notes: $('guest-notes')?.value?.trim(),
      });
      hideAddGuestModal();
    }

    await refreshGuestAccessData();
  } catch (err) {
    setFormFeedback(err.message || 'Could not complete this action.');
    markGuestFormErrors({ full_name, email });
  } finally {
    btn.disabled = false;
  }
}

async function toggleGuestStatus(id, nextStatus, { isReview = false } = {}) {
  const guest = overview.guests.find((u) => u.id === Number(id));
  if (!guest) return;

  const verb = nextStatus === 'Inactive' ? 'deactivate' : 'reactivate';
  const label = `${escapeHtml(guest.full_name)} (${escapeHtml(guest.email)})`;
  const isDeactivate = nextStatus === 'Inactive';

  let message = isDeactivate
    ? `Are you sure you want to deactivate login for ${label}?`
    : `Are you sure you want to reactivate login for ${label}?`;
  if (isReview && guest.stay?.daysSinceCheckout != null) {
    message = `This guest's stay ended ${guest.stay.daysSinceCheckout} day(s) ago.<br><br>Are you sure you want to deactivate login for ${label}?`;
  }

  const confirmed = await confirmAction(
    isDeactivate ? 'Deactivate guest' : 'Reactivate guest',
    message,
    { confirmLabel: 'Confirm', danger: isDeactivate },
  );
  if (!confirmed) return;

  try {
    await updateUser(id, { status: nextStatus });
    await refreshGuestAccessData();
  } catch (err) {
    await showAlertModal('Could not update account', escapeHtml(err.message || `Could not ${verb} account.`), { confirmLabel: 'OK' });
  }
}

async function bulkDeactivateReviewed() {
  const count = overview.summary?.needsReview || 0;
  if (!count) return;

  const confirmed = await confirmAction(
    'Deactivate flagged accounts',
    `Are you sure you want to deactivate ${count} guest account${count === 1 ? '' : 's'}? Their stays ended over a week ago.`,
    { confirmLabel: 'Confirm', danger: true },
  );
  if (!confirmed) return;

  try {
    const result = await bulkDeactivateGuests();
    await showAlertModal(
      'Accounts deactivated',
      `${result.deactivated} account${result.deactivated === 1 ? '' : 's'} deactivated.`,
    );
    await refreshGuestAccessData();
  } catch (err) {
    await showAlertModal('Bulk deactivation failed', escapeHtml(err.message || 'Bulk deactivation failed.'));
  }
}

async function handleApproveRequest(id) {
  const req = requests.find((r) => r.id === Number(id));
  if (!req) return;

  const confirmed = await confirmAction(
    'Approve request',
    `Are you sure you want to approve and create login for <strong>${escapeHtml(req.full_name)}</strong> (${escapeHtml(req.email)})? A temporary password will be emailed to the guest.`,
  );
  if (!confirmed) return;

  try {
    const result = await approveGuestAccessRequest(id);
    showGrantSuccess({
      full_name: result.user.full_name,
      email: result.user.email,
      temporaryPassword: result.temporaryPassword,
    });
    await refreshGuestAccessData();
  } catch (err) {
    await showAlertModal('Could not approve request', escapeHtml(err.message || 'Could not approve request.'));
  }
}

async function handleRejectRequest(id) {
  const req = requests.find((r) => r.id === Number(id));
  if (!req) return;

  const review_notes = await promptRejectRequest(req);
  if (review_notes === null) return;

  try {
    await rejectGuestAccessRequest(id, { review_notes });
    await refreshGuestAccessData();
  } catch (err) {
    await showAlertModal('Could not reject request', escapeHtml(err.message || 'Could not reject request.'));
  }
}

function bindGuestPageListeners() {
  guestPageAbort?.abort();
  if (!document.getElementById('guest-access-tbody')) return;

  searchQuery = $('guest-access-search')?.value?.trim().toLowerCase() || '';

  guestPageAbort = new AbortController();
  const { signal } = guestPageAbort;

  document.querySelectorAll('[data-ga-tab]').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.getAttribute('data-ga-tab')), { signal });
  });

  $('add-guest-btn')?.addEventListener('click', () => showAddGuestModal('form'), { signal });

  $('ga-review-show-btn')?.addEventListener('click', jumpToReviewFilter, { signal });
  $('ga-bulk-deactivate-btn')?.addEventListener('click', bulkDeactivateReviewed, { signal });

  document.querySelectorAll('[data-ga-filter]').forEach((btn) => {
    btn.addEventListener('click', () => applyFilter(btn.getAttribute('data-ga-filter')), { signal });
  });

  $('ga-filter-toggle')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const panel = $('ga-filter-panel');
    setFilterPanelOpen(panel?.classList.contains('hidden'));
  }, { signal });

  document.addEventListener('click', (e) => {
    if (!document.getElementById('guest-access-tbody')) return;
    if (e.target.closest('.ga-filter-wrap')) return;
    setFilterPanelOpen(false);
  }, { signal });

  $('guest-access-search')?.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim().toLowerCase();
    renderAccountsTable();
  }, { signal });

  $('guest-access-search')?.addEventListener('search', (e) => {
    searchQuery = e.target.value.trim().toLowerCase();
    renderAccountsTable();
  }, { signal });

  $('guest-access-tbody')?.addEventListener('click', (e) => {
    const deactivate = e.target.closest('[data-ga-deactivate]');
    if (deactivate) {
      toggleGuestStatus(
        deactivate.getAttribute('data-ga-deactivate'),
        'Inactive',
        { isReview: deactivate.hasAttribute('data-ga-review') }
      );
      return;
    }
    const activate = e.target.closest('[data-ga-activate]');
    if (activate) toggleGuestStatus(activate.getAttribute('data-ga-activate'), 'Active');
  }, { signal });

  syncAddGuestModal();
  updateFilterUi();
}

export function initGuestAccessPage() {
  if (!guestShellInitialized) {
    guestShellInitialized = true;

    $('guest-access-modal-close')?.addEventListener('click', hideAddGuestModal);
    $('guest-access-modal-cancel')?.addEventListener('click', hideAddGuestModal);
    $('guest-access-modal-overlay')?.addEventListener('click', hideAddGuestModal);
    $('guest-access-done')?.addEventListener('click', hideAddGuestModal);
    $('guest-access-form')?.addEventListener('submit', submitAddGuest);

    $('guest-name')?.addEventListener('input', clearGuestFormValidation);
    $('guest-email')?.addEventListener('input', clearGuestFormValidation);

    $('guest-copy-password')?.addEventListener('click', async () => {
      const value = $('guest-temp-password')?.textContent?.trim();
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        $('guest-copy-password').textContent = 'Copied';
        setTimeout(() => { $('guest-copy-password').textContent = 'Copy'; }, 1500);
      } catch {
        await showAlertModal(
          'Could not copy',
          'Please select and copy the password manually.',
        );
      }
    });

    document.querySelectorAll('input[name="ga-add-mode"]').forEach((radio) => {
      radio.addEventListener('change', syncAddGuestModal);
    });

    bindPendingModalActions();

    guestEscapeHandler = (e) => {
      if (e.key !== 'Escape') return;
      if (!$('ga-pending-modal')?.classList.contains('hidden')) {
        hidePendingModal();
        return;
      }
      if (!$('guest-access-modal')?.classList.contains('hidden')) {
        hideAddGuestModal();
      }
    };
    document.addEventListener('keydown', guestEscapeHandler);
  }

  bindGuestPageListeners();
}

export function teardownGuestAccessPage() {
  guestPageAbort?.abort();
  guestPageAbort = null;
  const card = $('ga-stat-pending-card');
  if (card) {
    card.onclick = null;
    card.onkeydown = null;
  }
}
