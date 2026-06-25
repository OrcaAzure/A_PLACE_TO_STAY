/**
 * Admin Guest Access — external guest account management (Phase 2: reservation context).
 */

import { getGuestAccessOverview, createGuestUser, updateUser } from '/assets/js/services/api.js';

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
let statusFilter = 'all';
let searchQuery = '';

const STAY_BADGE = {
  in_stay: 'ga-stay-badge--stay',
  arriving: 'ga-stay-badge--arriving',
  pending: 'ga-stay-badge--pending',
  upcoming: 'ga-stay-badge--upcoming',
  ended: 'ga-stay-badge--ended',
  none: 'ga-stay-badge--none',
};

function showModal(mode = 'form') {
  $('guest-access-modal-overlay')?.classList.remove('hidden');
  $('guest-access-modal')?.classList.remove('hidden');
  $('guest-access-modal-overlay')?.setAttribute('aria-hidden', 'false');
  $('guest-access-modal')?.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  $('guest-access-form')?.classList.toggle('hidden', mode !== 'form');
  $('guest-access-success')?.classList.toggle('hidden', mode !== 'success');

  if (mode === 'form') $('guest-name')?.focus();
}

function hideModal() {
  $('guest-access-modal-overlay')?.classList.add('hidden');
  $('guest-access-modal')?.classList.add('hidden');
  $('guest-access-modal-overlay')?.setAttribute('aria-hidden', 'true');
  $('guest-access-modal')?.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  $('guest-access-form')?.reset();
  $('guest-access-feedback')?.classList.add('hidden');
  $('guest-access-success')?.classList.add('hidden');
  $('guest-access-form')?.classList.remove('hidden');
}

function setFeedback(msg, ok = false) {
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

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-PH', { month: 'short', day: '2-digit', year: 'numeric' });
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
      <p><strong>${count} guest account${count === 1 ? '' : 's'}</strong> may no longer need access — ${count === 1 ? 'its stay ended' : 'their stays ended'} over a week ago with no upcoming reservation. Consider deactivating login access.</p>
    </div>
    <button type="button" class="ga-btn-text ga-btn-text--primary shrink-0" data-ga-filter-jump="review">Show accounts</button>
  `;

  banner.querySelector('[data-ga-filter-jump="review"]')?.addEventListener('click', () => {
    const chip = document.querySelector('[data-ga-filter="review"]');
    chip?.click();
  });
}

function updateStats() {
  const s = overview.summary || {};
  const set = (id, val) => { if ($(id)) $(id).textContent = String(val ?? '—'); };

  set('ga-stat-arriving', s.arrivingThisWeek);
  set('ga-stat-staying', s.currentlyStaying);
  set('ga-stat-review', s.needsReview);
  set('ga-stat-active', s.activeAccounts);
  set('ga-stat-inactive', s.inactiveAccounts);
  set('ga-stat-total', s.totalAccounts);
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

  return parts.join('');
}

function renderTable() {
  const tbody = $('guest-access-tbody');
  if (!tbody) return;

  const rows = filteredGuests();
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="5"><p class="ga-empty">${
      overview.guests.length
        ? 'No guest accounts match your filters.'
        : 'No external guest accounts yet. Use <strong>Grant access</strong> to create the first one.'
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
      <td class="ga-actions">${actionButtons(guest)}</td>
    </tr>`;
  }).join('');
}

export async function loadGuestAccessPage() {
  const tbody = $('guest-access-tbody');
  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="5"><p class="ga-empty">Loading guest accounts…</p></td></tr>';
  }

  try {
    overview = await getGuestAccessOverview();
    overview.guests = overview.guests || [];
    overview.summary = overview.summary || {};
    updateStats();
    renderReviewBanner();
    renderTable();
  } catch (err) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="5"><p class="ga-empty text-error">${escapeHtml(err.message || 'Failed to load guest accounts.')}</p></td></tr>`;
    }
  }
}

async function submitGrantAccess(e) {
  e.preventDefault();
  const btn = $('guest-access-submit');
  btn.disabled = true;
  setFeedback('Creating account…');

  try {
    const full_name = $('guest-name')?.value?.trim();
    const email = $('guest-email')?.value?.trim();
    const result = await createGuestUser({ full_name, email });

    $('guest-success-name').textContent = result.user.full_name;
    $('guest-success-email').textContent = result.user.email;
    $('guest-temp-password').textContent = result.temporaryPassword;

    setFeedback('');
    showModal('success');
    await loadGuestAccessPage();
  } catch (err) {
    setFeedback(err.message || 'Could not create account.');
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
    message = `Stay ended ${guest.stay.daysSinceCheckout} day(s) ago with no upcoming reservation.\n\nDeactivate login access for ${label}?`;
  }

  if (!window.confirm(message)) return;

  try {
    await updateUser(id, { status: nextStatus });
    await loadGuestAccessPage();
  } catch (err) {
    window.alert(err.message || `Could not ${verb} account.`);
  }
}

export function initGuestAccessPage() {
  $('grant-access-btn')?.addEventListener('click', () => showModal('form'));
  $('guest-access-modal-close')?.addEventListener('click', hideModal);
  $('guest-access-modal-cancel')?.addEventListener('click', hideModal);
  $('guest-access-modal-overlay')?.addEventListener('click', hideModal);
  $('guest-access-done')?.addEventListener('click', hideModal);
  $('guest-access-form')?.addEventListener('submit', submitGrantAccess);

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
      renderTable();
    });
  });

  $('guest-access-search')?.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim().toLowerCase();
    renderTable();
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
    if (activate) {
      toggleGuestStatus(activate.getAttribute('data-ga-activate'), 'Active');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('guest-access-modal')?.classList.contains('hidden')) {
      hideModal();
    }
  });
}
