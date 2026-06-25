/**
 * Admin Guest Access — external guest account management.
 */

import { getGuestUsers, createGuestUser, updateUser, normalizeUser } from '/assets/js/services/api.js';

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

let allGuests = [];
let statusFilter = 'all';
let searchQuery = '';

function showModal(mode = 'form') {
  $('guest-access-modal-overlay')?.classList.remove('hidden');
  $('guest-access-modal')?.classList.remove('hidden');
  $('guest-access-modal-overlay')?.setAttribute('aria-hidden', 'false');
  $('guest-access-modal')?.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  $('guest-access-form')?.classList.toggle('hidden', mode !== 'form');
  $('guest-access-success')?.classList.toggle('hidden', mode !== 'success');

  if (mode === 'form') {
    $('guest-name')?.focus();
  }
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
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: '2-digit', year: 'numeric' });
}

function filteredGuests() {
  return allGuests.filter((user) => {
    const norm = normalizeUser(user);
    if (statusFilter === 'active' && user.status !== 'Active') return false;
    if (statusFilter === 'inactive' && user.status !== 'Inactive') return false;
    if (!searchQuery) return true;
    const hay = `${norm.name} ${norm.email}`.toLowerCase();
    return hay.includes(searchQuery);
  });
}

function updateStats() {
  const active = allGuests.filter((u) => u.status === 'Active').length;
  const inactive = allGuests.filter((u) => u.status === 'Inactive').length;
  $('ga-stat-active') && ($('ga-stat-active').textContent = String(active));
  $('ga-stat-inactive') && ($('ga-stat-inactive').textContent = String(inactive));
  $('ga-stat-total') && ($('ga-stat-total').textContent = String(allGuests.length));
}

function renderTable() {
  const tbody = $('guest-access-tbody');
  if (!tbody) return;

  const rows = filteredGuests();
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="4"><p class="ga-empty">${
      allGuests.length
        ? 'No guest accounts match your filters.'
        : 'No external guest accounts yet. Use <strong>Grant access</strong> to create the first one.'
    }</p></td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map((user) => {
    const norm = normalizeUser(user);
    const isActive = user.status === 'Active';
    const statusClass = isActive ? 'status-pill-approved' : 'status-pill-pending';
    const actionBtn = isActive
      ? `<button type="button" class="ga-btn-text ga-btn-text--danger" data-ga-deactivate="${user.id}">Deactivate</button>`
      : `<button type="button" class="ga-btn-text ga-btn-text--primary" data-ga-activate="${user.id}">Reactivate</button>`;

    return `<tr>
      <td class="font-medium">${escapeHtml(norm.name)}</td>
      <td>${escapeHtml(norm.email)}</td>
      <td><span class="${statusClass} text-[10px] px-2 py-0.5 rounded-full font-bold">${escapeHtml(user.status)}</span></td>
      <td>${formatDate(norm.createdAt)}</td>
      <td class="ga-actions">${actionBtn}</td>
    </tr>`;
  }).join('');
}

export async function loadGuestAccessPage() {
  const tbody = $('guest-access-tbody');
  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="5"><p class="ga-empty">Loading guest accounts…</p></td></tr>';
  }

  try {
    allGuests = await getGuestUsers();
    updateStats();
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

async function toggleGuestStatus(id, nextStatus) {
  const user = allGuests.find((u) => u.id === Number(id));
  if (!user) return;

  const verb = nextStatus === 'Inactive' ? 'deactivate' : 'reactivate';
  const label = `${user.full_name} (${user.email})`;
  if (!window.confirm(`${verb.charAt(0).toUpperCase() + verb.slice(1)} this guest account?\n\n${label}`)) {
    return;
  }

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
      setTimeout(() => {
        $('guest-copy-password').textContent = 'Copy';
      }, 1500);
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
      toggleGuestStatus(deactivate.getAttribute('data-ga-deactivate'), 'Inactive');
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
