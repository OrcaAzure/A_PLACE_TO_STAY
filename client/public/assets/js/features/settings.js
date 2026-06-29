/**
 * Admin settings — profile, roles, system info, and fiscal year configuration.
 */

import { getProfile, updateProfile, getAdminSummary, getFiscalYear, updateFiscalYearSettings } from '/assets/js/services/api.js';
import { initTabGroup } from '/assets/js/layout/tabs.js';
import { formatDate } from '/assets/js/features/reservation-shared.js';

let fiscalYearInfo = null;

const ROLE_DESCRIPTIONS = {
  'Super Admin': 'Full system access',
  Admin: 'Manage bookings, rooms, and users',
  'Supervisory User': 'Read-only access to reservations and reports',
  GMC: 'Guest booking access (GMC staff)',
  Faculty: 'Guest booking access',
  Staff: 'Guest booking access',
  Missionary: 'Guest booking access',
  'External Guest': 'Guest portal access — created by Housing admin',
};

export async function loadAdminSettings() {
  bindTabs();

  const [{ user }, summary, fyInfo] = await Promise.all([
    getProfile(),
    getAdminSummary(),
    getFiscalYear(),
  ]);
  fiscalYearInfo = fyInfo;

  const nameInput = document.getElementById('settings-name');
  const emailInput = document.getElementById('settings-email');
  const roleInput = document.getElementById('settings-role');

  if (nameInput) nameInput.value = user.full_name || '';
  if (emailInput) emailInput.value = user.email || '';
  if (roleInput) roleInput.value = user.role || '';

  renderRoleTable(summary.usersByRole || []);
  renderFiscalYearSettings(fyInfo);

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

  document.getElementById('system-settings-save-btn')?.addEventListener('click', saveSystemSettings);
}

function bindTabs() {
  initTabGroup({
    tabAttr: 'data-settings-tab',
    panelAttr: 'data-settings-panel',
    tabsSelector: '[role="tablist"]',
    panelsSelector: '.app-tab-panels',
    useHiddenClass: true,
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

function renderFiscalYearSettings(info) {
  const summary = document.getElementById('sys-fiscal-year-summary');
  const monthSelect = document.getElementById('fy-start-month');
  const dayInput = document.getElementById('fy-start-day');
  const advanceInput = document.getElementById('fy-advance-months');

  if (!info) return;

  const fy = info.currentFiscalYear;
  if (summary && fy) {
    summary.textContent = [
      `Current period: ${fy.label} (${formatDate(fy.startDate)} – ${formatDate(fy.endDate)})`,
      info.maxCheckInDate
        ? `Guests may book up to ${info.bookingAdvanceMonths} month(s) ahead (latest check-in: ${formatDate(info.maxCheckInDate)}).`
        : 'No advance booking limit for admins.',
    ].join(' ');
  }

  if (monthSelect && info.settings) monthSelect.value = String(info.settings.fiscal_year_start_month);
  if (dayInput && info.settings) dayInput.value = String(info.settings.fiscal_year_start_day);
  if (advanceInput && info.settings) advanceInput.value = String(info.settings.booking_advance_months);
  const cutoffInput = document.getElementById('guest-cancel-cutoff-days');
  const cancelSummary = document.getElementById('sys-cancellation-policy-summary');
  if (cutoffInput && info.settings) cutoffInput.value = String(info.settings.guest_cancellation_cutoff_days ?? 1);
  if (cancelSummary) {
    cancelSummary.textContent = info.cancellationPolicyLabel || 'Guests may cancel before check-in or the event date within the configured window.';
  }
}

async function saveSystemSettings() {
  const feedback = document.getElementById('system-settings-feedback');
  const btn = document.getElementById('system-settings-save-btn');
  if (!btn) return;

  btn.disabled = true;
  feedback?.classList.add('hidden');

  try {
    const cutoffRaw = document.getElementById('guest-cancel-cutoff-days')?.value;
    const payload = {
      fiscal_year_start_month: Number(document.getElementById('fy-start-month')?.value),
      fiscal_year_start_day: Number(document.getElementById('fy-start-day')?.value),
      booking_advance_months: Number(document.getElementById('fy-advance-months')?.value),
      guest_cancellation_cutoff_days: Number(cutoffRaw),
    };

    if ([payload.fiscal_year_start_month, payload.fiscal_year_start_day, payload.booking_advance_months].some((n) => Number.isNaN(n))) {
      throw new Error('Fiscal year and booking window fields must be valid numbers.');
    }
    if (Number.isNaN(payload.guest_cancellation_cutoff_days)) {
      throw new Error('Guest cancellation days must be a valid number (0–90).');
    }

    fiscalYearInfo = await updateFiscalYearSettings(payload);
    renderFiscalYearSettings(fiscalYearInfo);
    if (feedback) {
      feedback.textContent = 'System settings saved.';
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
}
