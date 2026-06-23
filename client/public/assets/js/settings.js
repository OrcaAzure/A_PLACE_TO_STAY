/**
 * Admin settings — profile and role summary from the database.
 */

import { getProfile, updateProfile, getAdminSummary } from './api.js';

const ROLE_DESCRIPTIONS = {
  'Super Admin': 'Full system access',
  Admin: 'Manage bookings, rooms, and users',
  'GNC View Only': 'Read-only access to reports',
  Faculty: 'Guest booking access',
  Staff: 'Guest booking access',
  Missionary: 'Guest booking access',
  Student: 'Guest booking access',
};

export async function loadAdminSettings() {
  bindTabs();

  const [{ user }, summary] = await Promise.all([
    getProfile(),
    getAdminSummary(),
  ]);

  const nameInput = document.getElementById('settings-name');
  const emailInput = document.getElementById('settings-email');
  const roleInput = document.getElementById('settings-role');

  if (nameInput) nameInput.value = user.full_name || '';
  if (emailInput) emailInput.value = user.email || '';
  if (roleInput) roleInput.value = user.role || '';

  renderRoleTable(summary.usersByRole || []);
  renderSystemInfo(summary.kpis || {});

  document.getElementById('settings-save-btn')?.addEventListener('click', async () => {
    const feedback = document.getElementById('settings-feedback');
    const btn = document.getElementById('settings-save-btn');
    btn.disabled = true;
    feedback?.classList.add('hidden');

    try {
      const result = await updateProfile({ full_name: nameInput.value.trim() });
      localStorage.setItem('user', JSON.stringify(result.user));
      if (feedback) {
        feedback.textContent = 'Profile saved.';
        feedback.className = 'text-body-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2';
        feedback.classList.remove('hidden');
      }
    } catch (err) {
      if (feedback) {
        feedback.textContent = err.message || 'Save failed';
        feedback.className = 'text-body-sm text-error bg-error-container rounded-lg px-3 py-2';
        feedback.classList.remove('hidden');
      }
    } finally {
      btn.disabled = false;
    }
  });
}

function bindTabs() {
  const tabs = document.querySelectorAll('[data-settings-tab]');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const id = tab.getAttribute('data-settings-tab');
      tabs.forEach((t) => {
        const active = t.getAttribute('data-settings-tab') === id;
        t.className = active
          ? 'px-4 py-1.5 border-b-2 border-primary text-primary text-label-sm font-bold'
          : 'px-4 py-1.5 border-b-2 border-transparent text-on-surface-variant text-label-sm';
      });
      document.querySelectorAll('[data-settings-panel]').forEach((panel) => {
        panel.classList.toggle('hidden', panel.getAttribute('data-settings-panel') !== id);
      });
    });
  });
}

function renderRoleTable(usersByRole) {
  const tbody = document.getElementById('settings-roles-tbody');
  if (!tbody) return;

  if (!usersByRole.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-center py-6 text-on-surface-variant">No users found.</td></tr>';
    return;
  }

  tbody.innerHTML = usersByRole.map((row) => `
    <tr>
      <td>${row.role}</td>
      <td>${ROLE_DESCRIPTIONS[row.role] || 'System user'}</td>
      <td>${row.count}</td>
    </tr>`).join('');
}

function renderSystemInfo(kpis) {
  setText('sys-total-rooms', kpis.totalRooms ?? '—');
  setText('sys-total-bookings', kpis.totalBookings ?? '—');
  setText('sys-pending-bookings', kpis.pending ?? '—');
  setText('sys-paid-revenue', kpis.paidRevenue != null
    ? `₱${Number(kpis.paidRevenue).toLocaleString('en-PH')}`
    : '—');
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}
