/**
 * Admin Team Access — Super Admin workflow for View-Only Admin (supervisory) accounts.
 * Mirrors Guest Access UX: list, grant access with temp password, activate/deactivate.
 */

import {
  getPortalStaffOverview,
  createPortalStaffUser,
  updatePortalStaffUser,
  getPortalStaffActivity,
} from '/assets/js/services/api.js';
import { openModal, closeModal } from '/assets/js/layout/ui.js';
import { escapeHtml } from '/assets/js/features/reservation-shared.js';
import { refreshAdminReadOnlyUI } from '/assets/js/services/auth.js';

function $(id) {
  return document.getElementById(id);
}

let overview = { summary: {}, staff: [] };
let activityEntries = [];
let statusFilter = 'all';
let searchQuery = '';
let activeTab = 'main';
let shellInitialized = false;
/** @type {AbortController | null} */
let pageAbort = null;

const FILTER_LABELS = {
  all: 'All accounts',
  active: 'Active only',
  inactive: 'Inactive only',
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INTERNAL_SUFFIXES = ['@apts.edu.ph', '@apts.edu'];

function isInternalEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  return INTERNAL_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: '2-digit', year: 'numeric' });
}

function formatRelativeTime(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(iso);
}

function elevateConfirmModal() {
  document.getElementById('modal-overlay')?.classList.add('ga-modal-top');
  document.getElementById('app-modal')?.classList.add('ga-modal-top');
}

function resetConfirmModalLayer() {
  document.getElementById('modal-overlay')?.classList.remove('ga-modal-top');
  document.getElementById('app-modal')?.classList.remove('ga-modal-top');
}

function confirmActionsHtml({ confirmLabel = 'Confirm', danger = false } = {}) {
  const confirmClass = danger
    ? 'ga-confirm-danger px-5 py-2.5 min-h-[2.75rem]'
    : 'btn-primary px-5 py-2.5 min-h-[2.75rem]';
  return `
    <div class="flex justify-end gap-3 mt-6 pt-5 border-t border-outline-variant">
      <button type="button" class="settings-confirm-cancel px-4 py-2.5 rounded-lg border border-outline-variant text-on-surface-variant font-semibold text-sm hover:bg-surface-variant/30 transition-colors min-h-[2.75rem]" data-action="cancel">Cancel</button>
      <button type="button" class="${confirmClass}" data-action="confirm">${escapeHtml(confirmLabel)}</button>
    </div>`;
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

    requestAnimationFrame(() => {
      elevateConfirmModal();
      openModal(title, bodyHtml);
      const body = document.getElementById('modalBody');
      body?.querySelector('[data-action="cancel"]')?.addEventListener('click', () => finish(false), { once: true });
      body?.querySelector('[data-action="confirm"]')?.addEventListener('click', () => finish(true), { once: true });
      document.getElementById('modal-close')?.addEventListener('click', () => finish(false), { once: true });
      document.getElementById('modal-overlay')?.addEventListener('click', () => finish(false), { once: true });
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

function setFormFeedback(msg) {
  const el = $('team-access-feedback');
  if (!el) return;
  if (!msg) {
    el.textContent = '';
    el.className = 'ga-form-feedback hidden';
    return;
  }
  el.textContent = msg;
  el.className = 'ga-form-feedback ga-form-feedback--error';
  el.classList.remove('hidden');
}

function clearFormValidation() {
  setFormFeedback('');
  $('team-name')?.classList.remove('ga-input--error');
  $('team-email')?.classList.remove('ga-input--error');
}

function validateForm({ full_name, email }) {
  if (!full_name && !email) return 'Full name and email are required.';
  if (!full_name) return 'Full name is required.';
  if (!email) return 'Email address is required.';
  if (!EMAIL_PATTERN.test(email)) return 'Please enter a valid email address.';
  if (!isInternalEmail(email)) return 'Team access requires an internal APTS email (@apts.edu or @apts.edu.ph).';
  return null;
}

function showAddModal(mode = 'form') {
  if (mode === 'form') clearFormValidation();
  $('team-access-modal-overlay')?.classList.remove('hidden');
  const modal = $('team-access-modal');
  modal?.classList.remove('hidden', 'pointer-events-none');
  modal?.classList.add('pointer-events-auto');
  $('team-access-form')?.classList.toggle('hidden', mode !== 'form');
  $('team-access-success')?.classList.toggle('hidden', mode !== 'success');
  const title = $('team-access-modal-title');
  if (title) title.textContent = mode === 'success' ? 'Access granted' : 'Add view-only admin';
  if (mode === 'form') $('team-name')?.focus();
  document.body.style.overflow = 'hidden';
}

function hideAddModal() {
  $('team-access-modal-overlay')?.classList.add('hidden');
  const modal = $('team-access-modal');
  modal?.classList.add('hidden', 'pointer-events-none');
  modal?.classList.remove('pointer-events-auto');
  document.body.style.overflow = '';
  $('team-access-form')?.reset();
  clearFormValidation();
  $('team-access-success')?.classList.add('hidden');
  $('team-access-form')?.classList.remove('hidden');
}

function showGrantSuccess({ full_name, email, temporaryPassword }) {
  $('team-success-name').textContent = full_name;
  $('team-success-email').textContent = email;
  if (temporaryPassword) {
    $('team-temp-password').textContent = temporaryPassword;
    $('team-temp-password-wrap')?.classList.remove('hidden');
  } else {
    $('team-temp-password-wrap')?.classList.add('hidden');
  }
  showAddModal('success');
}

function filteredStaff() {
  return (overview.staff || []).filter((member) => {
    if (statusFilter === 'active' && member.status !== 'Active') return false;
    if (statusFilter === 'inactive' && member.status !== 'Inactive') return false;
    if (!searchQuery) return true;
    const hay = [member.full_name, member.email].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(searchQuery);
  });
}

function updateStats() {
  const s = overview.summary || {};
  const set = (id, val) => { if ($(id)) $(id).textContent = String(val ?? '—'); };
  set('ta-stat-total', s.total);
  set('ta-stat-active', s.active);
  set('ta-stat-inactive', s.inactive);
}

function updateAccountsCount() {
  const countEl = $('ta-accounts-count');
  if (!countEl) return;
  const total = overview.staff?.length || 0;
  const visible = filteredStaff().length;
  if (!total) {
    countEl.textContent = 'No view-only admin accounts yet';
    return;
  }
  if (statusFilter !== 'all' || searchQuery) {
    countEl.textContent = `${visible} of ${total} accounts`;
    return;
  }
  countEl.textContent = `${total} account${total === 1 ? '' : 's'}`;
}

function updateFilterUi() {
  const label = $('ta-filter-label');
  const toggle = $('ta-filter-toggle');
  if (label) label.textContent = FILTER_LABELS[statusFilter] || FILTER_LABELS.all;
  if (toggle) toggle.classList.toggle('ga-filter-btn--active', statusFilter !== 'all');
  document.querySelectorAll('[data-ta-filter]').forEach((btn) => {
    const active = btn.getAttribute('data-ta-filter') === statusFilter;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function setFilterPanelOpen(open) {
  const panel = $('ta-filter-panel');
  const toggle = $('ta-filter-toggle');
  if (!panel) return;
  panel.classList.toggle('hidden', !open);
  toggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function closeAllRowMenus() {
  document.querySelectorAll('.ga-row-menu').forEach((wrap) => {
    wrap.querySelector('.ga-row-menu__panel')?.classList.add('hidden');
    wrap.querySelector('.ga-row-menu__trigger')?.setAttribute('aria-expanded', 'false');
  });
}

function toggleRowMenu(memberId) {
  const wrap = document.querySelector(`.ga-row-menu[data-ta-row-menu="${memberId}"]`);
  if (!wrap) return;
  const panel = wrap.querySelector('.ga-row-menu__panel');
  const trigger = wrap.querySelector('.ga-row-menu__trigger');
  const willOpen = panel?.classList.contains('hidden');
  closeAllRowMenus();
  if (willOpen && panel && trigger) {
    panel.classList.remove('hidden');
    trigger.setAttribute('aria-expanded', 'true');
  }
}

function actionMenu(member) {
  const isActive = member.status === 'Active';
  const menuId = `ta-row-menu-${member.id}`;
  const items = isActive
    ? `<button type="button" class="ga-row-menu__item ga-row-menu__item--danger" role="menuitem" data-ta-deactivate="${member.id}">Deactivate</button>`
    : `<button type="button" class="ga-row-menu__item" role="menuitem" data-ta-activate="${member.id}">Reactivate</button>`;

  return `<div class="ga-row-menu" data-ta-row-menu="${member.id}">
    <button type="button" class="ga-row-menu__trigger" aria-label="Actions for ${escapeHtml(member.full_name)}" aria-haspopup="true" aria-expanded="false" aria-controls="${menuId}" data-ta-menu-toggle="${member.id}">
      <span class="material-symbols-outlined" aria-hidden="true">more_vert</span>
    </button>
    <div id="${menuId}" class="ga-row-menu__panel hidden" role="menu">${items}</div>
  </div>`;
}

function renderAccountsTable() {
  const tbody = $('team-access-tbody');
  if (!tbody) return;

  const rows = filteredStaff();
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="5"><p class="ga-empty">${
      overview.staff?.length
        ? 'No accounts match your search or filter.'
        : 'No view-only admin accounts yet. Use <strong>Add view-only admin</strong> to grant supervisory access.'
    }</p></td></tr>`;
    updateAccountsCount();
    refreshAdminReadOnlyUI();
    return;
  }

  tbody.innerHTML = rows.map((member) => {
    const statusClass = member.status === 'Active' ? 'status-pill-approved' : 'status-pill-pending';
    return `<tr>
      <td class="font-medium">${escapeHtml(member.full_name)}</td>
      <td>${escapeHtml(member.email)}</td>
      <td>View-Only Admin</td>
      <td><span class="ga-access-pill ${statusClass}">${escapeHtml(member.status)}</span></td>
      <td class="ga-col-actions">${actionMenu(member)}</td>
    </tr>`;
  }).join('');

  updateAccountsCount();
  refreshAdminReadOnlyUI();
}

function renderActivityList() {
  const list = $('team-activity-list');
  if (!list) return;
  if (!activityEntries.length) {
    list.innerHTML = '<li class="ga-empty">No team access activity recorded yet.</li>';
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

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('[data-ta-tab]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.getAttribute('data-ta-tab') === tab);
  });
  $('ta-panel-main')?.classList.toggle('hidden', tab !== 'main');
  $('ta-panel-activity')?.classList.toggle('hidden', tab !== 'activity');
  if (tab === 'activity') loadTeamAccessActivity();
}

async function refreshTeamAccessData({ background = false } = {}) {
  await loadTeamAccessPage({ background });
}

export async function loadTeamAccessPage({ background = false } = {}) {
  if (!background) {
    statusFilter = 'all';
    searchQuery = '';
    const searchEl = $('team-access-search');
    if (searchEl) searchEl.value = '';
    updateFilterUi();
    const tbody = $('team-access-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="5"><p class="ga-empty">Loading…</p></td></tr>';
  }

  try {
    overview = await getPortalStaffOverview();
    overview.staff = overview.staff || [];
    overview.summary = overview.summary || {};
  } catch (err) {
    overview = { summary: {}, staff: [] };
    const tbody = $('team-access-tbody');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="5"><p class="ga-empty text-error">${escapeHtml(err.message || 'Failed to load team accounts.')}</p></td></tr>`;
    }
  }

  updateStats();
  renderAccountsTable();
}

async function loadTeamAccessActivity({ background = false } = {}) {
  const list = $('team-activity-list');
  if (!background && list) list.innerHTML = '<li class="ga-empty">Loading activity…</li>';

  try {
    activityEntries = await getPortalStaffActivity(30);
    renderActivityList();
  } catch (err) {
    if (list) {
      list.innerHTML = `<li class="ga-empty text-error">${escapeHtml(err.message || 'Failed to load activity.')}</li>`;
    }
  }
}

async function submitAddTeam(e) {
  e.preventDefault();
  const btn = $('team-access-submit');
  const full_name = $('team-name')?.value?.trim() || '';
  const email = $('team-email')?.value?.trim() || '';

  clearFormValidation();
  const validationError = validateForm({ full_name, email });
  if (validationError) {
    setFormFeedback(validationError);
    $('team-name')?.classList.toggle('ga-input--error', !full_name);
    $('team-email')?.classList.toggle('ga-input--error', !email || !isInternalEmail(email));
    return;
  }

  const confirmed = await confirmAction(
    'Grant view-only access',
    `Create view-only admin access for <strong>${escapeHtml(full_name)}</strong> (${escapeHtml(email)})? A temporary password will be emailed.`,
  );
  if (!confirmed) return;

  btn.disabled = true;
  setFormFeedback('');

  try {
    const result = await createPortalStaffUser({ full_name, email });
    showGrantSuccess({
      full_name: result.user.full_name,
      email: result.user.email,
      temporaryPassword: result.temporaryPassword,
    });
    await refreshTeamAccessData({ background: true });
  } catch (err) {
    setFormFeedback(err.message || 'Could not complete this action.');
  } finally {
    btn.disabled = false;
  }
}

async function toggleStaffStatus(id, nextStatus) {
  const member = overview.staff.find((u) => u.id === Number(id));
  if (!member) return;

  const label = `${escapeHtml(member.full_name)} (${escapeHtml(member.email)})`;
  const isDeactivate = nextStatus === 'Inactive';
  const confirmed = await confirmAction(
    isDeactivate ? 'Deactivate account' : 'Reactivate account',
    isDeactivate
      ? `Deactivate view-only access for ${label}? They will no longer be able to sign in.`
      : `Reactivate view-only access for ${label}?`,
    { confirmLabel: 'Confirm', danger: isDeactivate },
  );
  if (!confirmed) return;

  try {
    await updatePortalStaffUser(id, { status: nextStatus });
    await refreshTeamAccessData({ background: true });
  } catch (err) {
    await showAlertModal('Could not update account', escapeHtml(err.message || 'Could not update account.'));
  }
}

function bindPageListeners() {
  pageAbort?.abort();
  if (!document.getElementById('team-access-tbody')) return;

  searchQuery = $('team-access-search')?.value?.trim().toLowerCase() || '';
  pageAbort = new AbortController();
  const { signal } = pageAbort;

  document.querySelectorAll('[data-ta-tab]').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.getAttribute('data-ta-tab')), { signal });
  });

  $('add-team-btn')?.addEventListener('click', () => showAddModal('form'), { signal });

  document.querySelectorAll('[data-ta-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      statusFilter = btn.getAttribute('data-ta-filter') || 'all';
      updateFilterUi();
      setFilterPanelOpen(false);
      renderAccountsTable();
    }, { signal });
  });

  $('ta-filter-toggle')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const panel = $('ta-filter-panel');
    setFilterPanelOpen(panel?.classList.contains('hidden'));
  }, { signal });

  document.addEventListener('click', (e) => {
    if (!document.getElementById('team-access-tbody')) return;
    if (e.target.closest('.ga-filter-wrap')) return;
    setFilterPanelOpen(false);
    if (!e.target.closest('.ga-row-menu')) closeAllRowMenus();
  }, { signal });

  $('team-access-search')?.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim().toLowerCase();
    renderAccountsTable();
  }, { signal });

  $('team-access-tbody')?.addEventListener('click', (e) => {
    const menuToggle = e.target.closest('[data-ta-menu-toggle]');
    if (menuToggle) {
      e.stopPropagation();
      toggleRowMenu(menuToggle.getAttribute('data-ta-menu-toggle'));
      return;
    }
    const deactivate = e.target.closest('[data-ta-deactivate]');
    if (deactivate) {
      closeAllRowMenus();
      toggleStaffStatus(deactivate.getAttribute('data-ta-deactivate'), 'Inactive');
      return;
    }
    const activate = e.target.closest('[data-ta-activate]');
    if (activate) {
      closeAllRowMenus();
      toggleStaffStatus(activate.getAttribute('data-ta-activate'), 'Active');
    }
  }, { signal });

  updateFilterUi();
}

export function initTeamAccessPage() {
  if (!shellInitialized) {
    shellInitialized = true;
    $('team-access-modal-close')?.addEventListener('click', hideAddModal);
    $('team-access-modal-cancel')?.addEventListener('click', hideAddModal);
    $('team-access-modal-overlay')?.addEventListener('click', hideAddModal);
    $('team-access-done')?.addEventListener('click', hideAddModal);
    $('team-access-form')?.addEventListener('submit', submitAddTeam);
    $('team-name')?.addEventListener('input', clearFormValidation);
    $('team-email')?.addEventListener('input', clearFormValidation);
    $('team-copy-password')?.addEventListener('click', async () => {
      const value = $('team-temp-password')?.textContent?.trim();
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        $('team-copy-password').textContent = 'Copied';
        setTimeout(() => { $('team-copy-password').textContent = 'Copy'; }, 1500);
      } catch {
        await showAlertModal('Could not copy', 'Please select and copy the password manually.');
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('team-access-modal')?.classList.contains('hidden')) {
        hideAddModal();
      }
    });
  }

  bindPageListeners();
}
