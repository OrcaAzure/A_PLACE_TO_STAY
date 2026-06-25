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
let activityEntries = [];
let statusFilter = 'all';
let searchQuery = '';
let activeTab = 'main';

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
  $('guest-access-feedback')?.classList.add('hidden');
  $('guest-access-success')?.classList.add('hidden');
  $('guest-access-form')?.classList.remove('hidden');
  $('guest-temp-password-wrap')?.classList.remove('hidden');
  document.querySelector('input[name="ga-add-mode"][value="grant"]')?.click();
  syncAddGuestModal();
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

function setFormFeedback(msg, ok = false) {
  const el = $('guest-access-feedback');
  if (!el) return;
  if (!msg) {
    el.classList.add('hidden');
    el.textContent = '';
    return;
  }
  el.textContent = msg;
  el.className = ok
    ? 'text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2 mb-3'
    : 'text-sm text-rose-700 bg-rose-50 rounded-lg px-3 py-2 mb-3';
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
    const hay = `${guest.full_name} ${guest.email} ${guest.stay?.summary || ''}`.toLowerCase();
    return hay.includes(searchQuery);
  });
}

function pendingRequests() {
  return requests.filter((r) => r.status === 'Pending');
}

function renderReviewBanner() {
  const banner = $('ga-review-banner');
  if (!banner) return;

  const count = overview.summary?.needsReview || 0;
  if (!count) {
    banner.classList.add('hidden');
    banner.innerHTML = '';
    return;
  }

  banner.classList.remove('hidden');
  banner.innerHTML = `
    <span class="material-symbols-outlined admin-notice__icon" aria-hidden="true">warning</span>
    <div class="admin-notice__body">
      <p><strong>${count} guest account${count === 1 ? '' : 's'}</strong> may no longer need access — stay ended over a week ago with no upcoming reservation.</p>
    </div>
    <div class="ga-banner-actions">
      <button type="button" class="ga-btn-text ga-btn-text--primary" data-ga-filter-jump="review">Show accounts</button>
      <button type="button" class="admin-crud-btn-ghost text-sm" data-ga-bulk-deactivate>Deactivate all (${count})</button>
    </div>
  `;

  banner.querySelector('[data-ga-filter-jump="review"]')?.addEventListener('click', () => {
    document.querySelector('[data-ga-filter="review"]')?.click();
  });
  banner.querySelector('[data-ga-bulk-deactivate]')?.addEventListener('click', bulkDeactivateReviewed);
}

function updateStats() {
  const s = overview.summary || {};
  const set = (id, val) => { if ($(id)) $(id).textContent = String(val ?? '—'); };

  set('ga-stat-pending', s.pendingRequests);
  set('ga-stat-arriving', s.arrivingThisWeek);
  set('ga-stat-staying', s.currentlyStaying);
  set('ga-stat-review', s.needsReview);
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
    reviewHint = `<span class="ga-stay-review-hint">Review access</span>`;
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

function renderPendingQueue() {
  const section = $('ga-pending-queue');
  const tbody = $('guest-pending-tbody');
  if (!section || !tbody) return;

  const pending = pendingRequests();
  section.classList.toggle('hidden', pending.length === 0);

  if (!pending.length) {
    tbody.innerHTML = '';
    return;
  }

  tbody.innerHTML = pending.map((req) => `
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
      <td><span class="${statusClass} text-[10px] px-2 py-0.5 rounded-full font-bold">${escapeHtml(guest.status)}</span></td>
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
    renderReviewBanner();
    renderPendingQueue();
    renderAccountsTable();
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
  btn.disabled = true;
  setFormFeedback('');

  const full_name = $('guest-name')?.value?.trim();
  const email = $('guest-email')?.value?.trim();
  const organization = $('guest-org')?.value?.trim() || undefined;
  const isGrant = getAddMode() === 'grant';

  try {
    if (isGrant) {
      setFormFeedback('Creating account…');
      const result = await createGuestUser({ full_name, email, organization });
      setFormFeedback('');
      showGrantSuccess({
        full_name: result.user.full_name,
        email: result.user.email,
        temporaryPassword: result.temporaryPassword,
      });
    } else {
      setFormFeedback('Saving…');
      await createGuestAccessRequest({
        full_name,
        email,
        organization,
        notes: $('guest-notes')?.value?.trim(),
      });
      hideAddGuestModal();
    }

    await loadGuestAccessPage();
    if (activeTab === 'activity') await loadGuestAccessActivity();
  } catch (err) {
    setFormFeedback(err.message || 'Could not complete this action.');
  } finally {
    btn.disabled = false;
  }
}

async function toggleGuestStatus(id, nextStatus, { isReview = false } = {}) {
  const guest = overview.guests.find((u) => u.id === Number(id));
  if (!guest) return;

  const verb = nextStatus === 'Inactive' ? 'deactivate' : 'reactivate';
  const label = `${guest.full_name} (${guest.email})`;

  let message = `${verb.charAt(0).toUpperCase() + verb.slice(1)} this guest account?\n\n${label}`;
  if (isReview && guest.stay?.daysSinceCheckout != null) {
    message = `Stay ended ${guest.stay.daysSinceCheckout} day(s) ago.\n\nDeactivate login for ${label}?`;
  }

  if (!window.confirm(message)) return;

  try {
    await updateUser(id, { status: nextStatus });
    await loadGuestAccessPage();
    if (activeTab === 'activity') await loadGuestAccessActivity();
  } catch (err) {
    window.alert(err.message || `Could not ${verb} account.`);
  }
}

async function bulkDeactivateReviewed() {
  const count = overview.summary?.needsReview || 0;
  if (!count) return;

  if (!window.confirm(`Deactivate ${count} guest account(s) flagged for review?`)) return;

  try {
    const result = await bulkDeactivateGuests();
    window.alert(`${result.deactivated} account(s) deactivated.`);
    await loadGuestAccessPage();
    if (activeTab === 'activity') await loadGuestAccessActivity();
  } catch (err) {
    window.alert(err.message || 'Bulk deactivation failed.');
  }
}

async function handleApproveRequest(id) {
  const req = requests.find((r) => r.id === Number(id));
  if (!req) return;

  if (!window.confirm(`Approve and create login for ${req.full_name} (${req.email})?`)) return;

  try {
    const result = await approveGuestAccessRequest(id);
    showGrantSuccess({
      full_name: result.user.full_name,
      email: result.user.email,
      temporaryPassword: result.temporaryPassword,
    });
    await loadGuestAccessPage();
    if (activeTab === 'activity') await loadGuestAccessActivity();
  } catch (err) {
    window.alert(err.message || 'Could not approve request.');
  }
}

async function handleRejectRequest(id) {
  const req = requests.find((r) => r.id === Number(id));
  if (!req) return;

  const review_notes = window.prompt(
    `Reject request for ${req.full_name}?\n\nOptional internal note:`,
    ''
  );
  if (review_notes === null) return;

  try {
    await rejectGuestAccessRequest(id, { review_notes });
    await loadGuestAccessPage();
    if (activeTab === 'activity') await loadGuestAccessActivity();
  } catch (err) {
    window.alert(err.message || 'Could not reject request.');
  }
}

export function initGuestAccessPage() {
  document.querySelectorAll('[data-ga-tab]').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.getAttribute('data-ga-tab')));
  });

  $('add-guest-btn')?.addEventListener('click', () => showAddGuestModal('form'));

  document.querySelectorAll('input[name="ga-add-mode"]').forEach((radio) => {
    radio.addEventListener('change', syncAddGuestModal);
  });

  $('guest-access-modal-close')?.addEventListener('click', hideAddGuestModal);
  $('guest-access-modal-cancel')?.addEventListener('click', hideAddGuestModal);
  $('guest-access-modal-overlay')?.addEventListener('click', hideAddGuestModal);
  $('guest-access-done')?.addEventListener('click', hideAddGuestModal);
  $('guest-access-form')?.addEventListener('submit', submitAddGuest);

  $('guest-copy-password')?.addEventListener('click', async () => {
    const value = $('guest-temp-password')?.textContent?.trim();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      $('guest-copy-password').textContent = 'Copied';
      setTimeout(() => { $('guest-copy-password').textContent = 'Copy'; }, 1500);
    } catch {
      window.alert('Could not copy — please select and copy the password manually.');
    }
  });

  document.querySelectorAll('[data-ga-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      statusFilter = btn.getAttribute('data-ga-filter') || 'all';
      document.querySelectorAll('[data-ga-filter]').forEach((chip) => {
        chip.classList.toggle('is-active', chip === btn);
        chip.setAttribute('aria-pressed', chip === btn ? 'true' : 'false');
      });
      renderAccountsTable();
    });
  });

  $('guest-access-search')?.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim().toLowerCase();
    renderAccountsTable();
  });

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
  });

  $('guest-pending-tbody')?.addEventListener('click', (e) => {
    const approve = e.target.closest('[data-ga-approve-request]');
    if (approve) {
      handleApproveRequest(approve.getAttribute('data-ga-approve-request'));
      return;
    }
    const reject = e.target.closest('[data-ga-reject-request]');
    if (reject) handleRejectRequest(reject.getAttribute('data-ga-reject-request'));
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('guest-access-modal')?.classList.contains('hidden')) {
      hideAddGuestModal();
    }
  });

  syncAddGuestModal();
}
