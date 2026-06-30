/**
 * Admin settings — profile, roles, system info, and fiscal year configuration.
 */

import { getProfile, updateProfile, getAdminSummary, getFiscalYear, updateFiscalYearSettings } from '/assets/js/services/api.js';
import { initTabGroup } from '/assets/js/layout/tabs.js';
import { formatDate } from '/assets/js/features/reservation-shared.js';

let fiscalYearInfo = null;

const HIDDEN_ROLES = new Set(['Supervisory User', 'GNC View Only']);

const ROLE_DESCRIPTIONS = {
  'Super Admin': 'Full system access',
  Admin: 'Manage bookings, rooms, and users',
  GMC: 'Guest booking access (GMC staff)',
  Faculty: 'Guest booking access',
  Staff: 'Guest booking access',
  Missionary: 'Guest booking access',
  'External Guest': 'Guest portal access — created by Housing admin',
};

const SEASON_ORDER = ['Regular', 'Peak', 'Super Peak'];

const MONTHS = [
  { value: 1, label: 'Jan' },
  { value: 2, label: 'Feb' },
  { value: 3, label: 'Mar' },
  { value: 4, label: 'Apr' },
  { value: 5, label: 'May' },
  { value: 6, label: 'Jun' },
  { value: 7, label: 'Jul' },
  { value: 8, label: 'Aug' },
  { value: 9, label: 'Sep' },
  { value: 10, label: 'Oct' },
  { value: 11, label: 'Nov' },
  { value: 12, label: 'Dec' },
];

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

  const rows = usersByRole.filter((row) => !HIDDEN_ROLES.has(row.role));

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-center py-6 text-on-surface-variant">No users found.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((row) => `
    <tr>
      <td>${row.role}</td>
      <td>${ROLE_DESCRIPTIONS[row.role] || 'System user'}</td>
      <td>${row.count}</td>
    </tr>`).join('');
}

function monthOptions(selected) {
  return MONTHS.map((m) => `<option value="${m.value}"${Number(selected) === m.value ? ' selected' : ''}>${m.label}</option>`).join('');
}

function renderSeasonPeriodEditor(periods = []) {
  const mount = document.getElementById('season-periods-mount');
  if (!mount) return;

  const bySeason = Object.fromEntries((periods || []).map((p) => [p.season, p]));

  mount.innerHTML = SEASON_ORDER.map((season) => {
    const p = bySeason[season] || { season, start_month: 1, start_day: 1, end_month: 12, end_day: 31 };
    const badgeClass = season === 'Super Peak'
      ? 'bg-amber-100 text-amber-900'
      : season === 'Peak'
        ? 'bg-orange-100 text-orange-900'
        : 'bg-slate-100 text-slate-800';
    return `
      <div class="rounded-lg border border-outline-variant/80 p-3 bg-surface-container-low/40" data-season-period="${season}">
        <div class="flex items-center gap-2 mb-3">
          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide ${badgeClass}">${season}</span>
          <span class="text-body-sm text-on-surface-variant">Date range (repeats every year)</span>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label class="text-label-sm text-on-surface-variant block mb-1">Starts — month</label>
            <select class="season-start-month w-full border border-outline-variant rounded-lg px-2 py-2 text-body-sm">${monthOptions(p.start_month)}</select>
          </div>
          <div>
            <label class="text-label-sm text-on-surface-variant block mb-1">Starts — day</label>
            <input type="number" class="season-start-day w-full border border-outline-variant rounded-lg px-2 py-2 text-body-sm" min="1" max="31" value="${p.start_day ?? 1}" />
          </div>
          <div>
            <label class="text-label-sm text-on-surface-variant block mb-1">Ends — month</label>
            <select class="season-end-month w-full border border-outline-variant rounded-lg px-2 py-2 text-body-sm">${monthOptions(p.end_month)}</select>
          </div>
          <div>
            <label class="text-label-sm text-on-surface-variant block mb-1">Ends — day</label>
            <input type="number" class="season-end-day w-full border border-outline-variant rounded-lg px-2 py-2 text-body-sm" min="1" max="31" value="${p.end_day ?? 31}" />
          </div>
        </div>
      </div>`;
  }).join('');
}

function readSeasonPeriodsFromForm() {
  return SEASON_ORDER.map((season) => {
    const row = document.querySelector(`[data-season-period="${season}"]`);
    if (!row) return { season, start_month: 1, start_day: 1, end_month: 12, end_day: 31 };
    return {
      season,
      start_month: Number(row.querySelector('.season-start-month')?.value),
      start_day: Number(row.querySelector('.season-start-day')?.value),
      end_month: Number(row.querySelector('.season-end-month')?.value),
      end_day: Number(row.querySelector('.season-end-day')?.value),
    };
  });
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

  const seasonSummary = document.getElementById('sys-season-summary');
  const periods = info.seasonPeriods || info.settings?.season_periods || [];
  renderSeasonPeriodEditor(periods);
  if (seasonSummary) {
    const todaySeason = info.seasonForToday || info.activeLodgingSeason || 'Regular';
    const summaryText = info.seasonPeriodsSummary || '';
    seasonSummary.textContent = [
      `Today (${formatDate(new Date().toISOString().slice(0, 10))}) uses ${todaySeason} rates.`,
      summaryText ? `Calendar: ${summaryText}.` : '',
      'Update the ranges below when Housing publishes the annual season schedule.',
    ].filter(Boolean).join(' ');
  }

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
      season_periods: readSeasonPeriodsFromForm(),
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
