/**
 * Admin settings — profile and booking rules (Chrome-style layout).
 */

import { getProfile, updateProfile, changePassword, getFiscalYear, updateFiscalYearSettings } from '/assets/js/services/api.js';
import { formatRoleLabel } from '/assets/js/services/auth.js';
import { formatDate } from '/assets/js/features/reservation-shared.js';
import { openModal, closeModal } from '/assets/js/layout/ui.js';

let fiscalYearInfo = null;

const SEASON_ORDER = ['Regular', 'Peak', 'Super Peak'];

const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

const SEASON_BADGE_CLASS = {
  Regular: 'settings-season-badge--regular',
  Peak: 'settings-season-badge--peak',
  'Super Peak': 'settings-season-badge--super',
};

const NAV_ACTIVE = 'settings-nav__item--active';

let settingsUiBound = false;

function bindSettingsUi() {
  if (settingsUiBound) return;
  settingsUiBound = true;

  bindNavigation();
  document.getElementById('settings-save-btn')?.addEventListener('click', saveProfile);
  document.getElementById('settings-password-btn')?.addEventListener('click', savePassword);
  document.getElementById('system-settings-save-btn')?.addEventListener('click', saveSystemSettings);
}

export function teardownAdminSettings() {
  settingsUiBound = false;
}

export async function loadAdminSettings() {
  bindSettingsUi();

  const [{ user }, fyInfo] = await Promise.all([getProfile(), getFiscalYear()]);
  fiscalYearInfo = fyInfo;

  const nameInput = document.getElementById('settings-name');

  if (nameInput) nameInput.value = user.full_name || '';

  updateProfileHeader(user);
  const bannerName = document.getElementById('settings-banner-name');
  if (bannerName) bannerName.dataset.fallback = user.full_name || 'User';
  bindNamePreview();
  renderFiscalYearSettings(fyInfo);
}

async function saveProfile() {
  const feedback = document.getElementById('settings-feedback');
  const btn = document.getElementById('settings-save-btn');
  const nameInput = document.getElementById('settings-name');
  btn.disabled = true;
  feedback?.classList.add('hidden');

  try {
    const result = await updateProfile({ full_name: nameInput.value.trim() });
    localStorage.setItem('user', JSON.stringify(result.user));
    updateProfileHeader(result.user);
    refreshAdminChromeName(result.user);
    showFeedback(feedback, 'Saved.');
  } catch (err) {
    showFeedback(feedback, err.message || 'Save failed', true);
  } finally {
    btn.disabled = false;
  }
}

async function savePassword() {
  const feedback = document.getElementById('settings-password-feedback');
  const btn = document.getElementById('settings-password-btn');
  const current = document.getElementById('settings-current-password')?.value || '';
  const next = document.getElementById('settings-new-password')?.value || '';
  const confirm = document.getElementById('settings-confirm-password')?.value || '';

  feedback?.classList.add('hidden');

  if (!current || !next || !confirm) {
    showFeedback(feedback, 'Fill in all password fields.', true);
    return;
  }
  if (next.length < 6) {
    showFeedback(feedback, 'New password must be at least 6 characters.', true);
    return;
  }
  if (next !== confirm) {
    showFeedback(feedback, 'New passwords do not match.', true);
    return;
  }

  btn.disabled = true;
  try {
    const result = await changePassword({ current_password: current, new_password: next });
    ['settings-current-password', 'settings-new-password', 'settings-confirm-password'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    showFeedback(feedback, result.message || 'Password updated.');
  } catch (err) {
    showFeedback(feedback, err.message || 'Update failed', true);
  } finally {
    btn.disabled = false;
  }
}

function updateProfileHeader(user) {
  const name = user.full_name || 'User';
  const email = user.email || '';
  const initials = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';

  const avatar = document.getElementById('settings-avatar');
  const bannerName = document.getElementById('settings-banner-name');
  const emailEl = document.getElementById('settings-profile-email');
  const emailDisplay = document.getElementById('settings-email-display');
  const roleEl = document.getElementById('settings-account-role');
  const memberEl = document.getElementById('settings-member-since');

  if (avatar) avatar.textContent = initials;
  if (bannerName) bannerName.textContent = name;
  if (emailEl) emailEl.textContent = email;
  if (emailDisplay) emailDisplay.textContent = email;
  if (roleEl) roleEl.textContent = formatRoleLabel(user.role) || 'User';
  if (memberEl && user.created_at) {
    const joined = new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    memberEl.textContent = `Member since ${joined}`;
  } else if (memberEl) {
    memberEl.textContent = '';
  }
}

function bindNamePreview() {
  const nameInput = document.getElementById('settings-name');
  const bannerName = document.getElementById('settings-banner-name');
  if (!nameInput || !bannerName) return;
  nameInput.addEventListener('input', () => {
    bannerName.textContent = nameInput.value.trim() || bannerName.dataset.fallback || '—';
  });
}

function refreshAdminChromeName(user) {
  const name = user.full_name || 'User';
  const initial = name.charAt(0).toUpperCase();
  document.querySelectorAll('.admin-user-chip__name').forEach((el) => {
    el.textContent = name;
  });
  document.querySelector('.admin-user-chip__avatar')?.replaceChildren(document.createTextNode(initial));
}

function bindNavigation() {
  const tabs = document.querySelectorAll('.settings-nav__item[data-settings-tab]');
  const panels = document.querySelectorAll('[data-settings-panel]');
  if (!tabs.length || !panels.length) return;

  const switchTo = (id) => {
    tabs.forEach((tab) => {
      const active = tab.getAttribute('data-settings-tab') === id;
      tab.classList.toggle(NAV_ACTIVE, active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    panels.forEach((panel) => {
      const show = panel.getAttribute('data-settings-panel') === id;
      panel.classList.toggle('is-tab-hidden', !show);
      panel.classList.toggle('hidden', !show);
    });
  };

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => switchTo(tab.getAttribute('data-settings-tab')));
  });

  switchTo('account');
}

function showFeedback(el, message, isError = false) {
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('settings-feedback--error', isError);
  el.classList.remove('hidden');
}

function renderStatusGrid(info) {
  const mount = document.getElementById('settings-status-grid');
  if (!mount || !info) return;

  const todaySeason = info.seasonForToday || info.activeLodgingSeason || 'Regular';

  mount.innerHTML = `
    <article class="settings-status-card">
      <span class="settings-status-card__label">Today's rates</span>
      <span class="settings-status-card__value">${todaySeason}</span>
      <span class="settings-status-card__hint">Based on today's date</span>
    </article>
    <article class="settings-status-card">
      <span class="settings-status-card__label">Guest booking window</span>
      <span class="settings-status-card__value">${info.bookingAdvanceMonths} month${info.bookingAdvanceMonths === 1 ? '' : 's'} ahead</span>
      <span class="settings-status-card__hint">${info.maxCheckInDate ? `Until ${formatDate(info.maxCheckInDate)}` : 'Admins are not limited'}</span>
    </article>`;
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
    const badgeClass = SEASON_BADGE_CLASS[season] || 'settings-season-badge--regular';
    return `
      <div class="settings-season-row" data-season-period="${season}">
        <div class="settings-season-row__head">
          <span class="settings-season-badge ${badgeClass}">${season}</span>
          <span class="text-body-sm text-on-surface-variant">Repeats every year</span>
        </div>
        <div class="settings-season-dates">
          <div class="settings-date-pair">
            <span class="settings-date-pair__label">From</span>
            <select class="season-start-month" aria-label="${season} start month">${monthOptions(p.start_month)}</select>
            <input type="number" class="season-start-day" min="1" max="31" value="${p.start_day ?? 1}" aria-label="${season} start day" />
          </div>
          <div class="settings-date-pair">
            <span class="settings-date-pair__label">Until</span>
            <select class="season-end-month" aria-label="${season} end month">${monthOptions(p.end_month)}</select>
            <input type="number" class="season-end-day" min="1" max="31" value="${p.end_day ?? 31}" aria-label="${season} end day" />
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
  const advanceHint = document.getElementById('sys-advance-hint');
  const advanceInput = document.getElementById('fy-advance-months');

  if (!info) return;

  renderStatusGrid(info);

  if (advanceHint && info.maxCheckInDate) {
    advanceHint.textContent = `Latest guest check-in: ${formatDate(info.maxCheckInDate)}.`;
  }

  if (advanceInput && info.settings) advanceInput.value = String(info.settings.booking_advance_months);

  const seasonSummary = document.getElementById('sys-season-summary');
  const periods = info.seasonPeriods || info.settings?.season_periods || [];
  renderSeasonPeriodEditor(periods);
  if (seasonSummary) {
    const todaySeason = info.seasonForToday || info.activeLodgingSeason || 'Regular';
    seasonSummary.textContent = `Today uses ${todaySeason} rates. Update when Housing publishes the annual schedule.`;
  }

  const cutoffInput = document.getElementById('guest-cancel-cutoff-hours');
  const cancelSummary = document.getElementById('sys-cancellation-policy-summary');
  if (cutoffInput && info.settings) {
    cutoffInput.value = String(info.settings.guest_cancellation_cutoff_hours ?? 24);
  }
  if (cancelSummary) {
    cancelSummary.textContent = info.cancellationPolicyLabel || 'How many days before check-in or an event a guest must cancel online.';
  }
}

async function saveSystemSettings() {
  const feedback = document.getElementById('system-settings-feedback');
  const btn = document.getElementById('system-settings-save-btn');
  if (!btn) return;

  feedback?.classList.add('hidden');

  const cutoffRaw = document.getElementById('guest-cancel-cutoff-hours')?.value;
  const payload = {
    booking_advance_months: Number(document.getElementById('fy-advance-months')?.value),
    guest_cancellation_cutoff_hours: Number(cutoffRaw),
    season_periods: readSeasonPeriodsFromForm(),
  };

  if (Number.isNaN(payload.booking_advance_months)) {
    showFeedback(feedback, 'Please check the booking window number.', true);
    return;
  }
  if (Number.isNaN(payload.guest_cancellation_cutoff_hours)) {
    showFeedback(feedback, 'Cancellation hours must be a number from 0 to 2160.', true);
    return;
  }

  const result = await confirmSaveBookingRules();
  if (result === 'discard') {
    if (fiscalYearInfo) renderFiscalYearSettings(fiscalYearInfo);
    feedback?.classList.add('hidden');
    return;
  }
  if (result !== 'confirm') return;

  btn.disabled = true;
  try {
    fiscalYearInfo = await updateFiscalYearSettings(payload);
    renderFiscalYearSettings(fiscalYearInfo);
    showFeedback(feedback, 'Booking rules saved.');
  } catch (err) {
    showFeedback(feedback, err.message || 'Save failed — please try again.', true);
  } finally {
    btn.disabled = false;
  }
}

function confirmSaveBookingRules() {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      closeModal();
      resolve(value);
    };

    openModal(
      'Save changes',
      `
        <p class="text-[0.9375rem] text-on-surface-variant leading-relaxed m-0">
          Are you sure you want to save your changes?
        </p>
        <div class="flex justify-end gap-3 mt-6 pt-5 border-t border-outline-variant">
          <button type="button" class="settings-confirm-cancel px-4 py-2.5 rounded-lg border border-outline-variant text-on-surface-variant font-semibold text-sm hover:bg-surface-variant/30 transition-colors min-h-[2.75rem]" data-action="discard">
            Cancel
          </button>
          <button type="button" class="settings-confirm-save btn-primary px-5 py-2.5 min-h-[2.75rem]" data-action="confirm">
            Confirm
          </button>
        </div>
      `,
    );

    const body = document.getElementById('modalBody');
    body?.querySelector('[data-action="discard"]')?.addEventListener('click', () => finish('discard'), { once: true });
    body?.querySelector('[data-action="confirm"]')?.addEventListener('click', () => finish('confirm'), { once: true });

    document.getElementById('modal-close')?.addEventListener('click', () => finish('discard'), { once: true });
    document.getElementById('modal-overlay')?.addEventListener('click', () => finish('discard'), { once: true });
  });
}
