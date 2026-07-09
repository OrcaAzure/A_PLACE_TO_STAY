/**
 * Admin settings — profile and booking rules (Chrome-style layout).
 */

import { getProfile, updateProfile, changePassword, getFiscalYear, updateFiscalYearSettings, previewSeasonCalendar } from '/assets/js/services/api.js';
import { formatRoleLabel, updateCachedUser } from '/assets/js/services/auth.js';
import { formatDate } from '/assets/js/features/reservation-shared.js';
import { openModal, closeModal } from '/assets/js/layout/ui.js';

let fiscalYearInfo = null;

const SEASON_ORDER = ['Peak', 'Super Peak'];

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

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const SEASON_BADGE_CLASS = {
  Regular: 'settings-season-badge--regular',
  Peak: 'settings-season-badge--peak',
  'Super Peak': 'settings-season-badge--super',
};

const WEEKEND_DAY_OPTIONS = [
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

let periodRowId = 0;
let seasonPreviewTimer = null;

const NAV_ACTIVE = 'settings-nav__item--active';

let settingsUiBound = false;

function bindSettingsUi() {
  if (settingsUiBound) return;
  settingsUiBound = true;

  bindNavigation();
  document.getElementById('settings-save-btn')?.addEventListener('click', saveProfile);
  document.getElementById('settings-password-btn')?.addEventListener('click', savePassword);
  document.getElementById('system-settings-save-btn')?.addEventListener('click', saveSystemSettings);
  document.getElementById('season-add-period')?.addEventListener('click', () => {
    const periods = readSeasonPeriodsFromForm();
    periods.push(defaultPeriodRow());
    renderSeasonPeriodList(periods);
    scheduleSeasonPreview();
  });
  document.getElementById('season-add-weekend')?.addEventListener('click', () => {
    const periods = readSeasonPeriodsFromForm();
    periods.push(thisWeekendRow());
    renderSeasonPeriodList(periods);
    scheduleSeasonPreview();
  });
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
    updateCachedUser(result.user);
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

function seasonOptions(selected) {
  return SEASON_ORDER.map((s) => `<option value="${s}"${s === selected ? ' selected' : ''}>${s}</option>`).join('');
}

function monthOptionsShort(selected) {
  return MONTHS.map((m, i) => `<option value="${m.value}"${Number(selected) === m.value ? ' selected' : ''}>${MONTHS_SHORT[i]}</option>`).join('');
}

function seasonPillsHtml(row) {
  return SEASON_ORDER.map((season) => {
    const checked = row.season === season ? ' checked' : '';
    const mod = season === 'Super Peak' ? 'super' : 'peak';
    return `
      <label class="rate-season-pill rate-season-pill--${mod}">
        <input type="radio" class="period-season" name="period-season-${row._id}" value="${season}"${checked} />
        <span>${season}</span>
      </label>`;
  }).join('');
}

function renderWeekendRule(rule = {}) {
  const mount = document.getElementById('season-weekend-mount');
  if (!mount) return;

  const enabled = Boolean(rule.enabled);
  const days = Array.isArray(rule.days) ? rule.days : [5, 6, 0];
  const season = rule.season || 'Peak';

  mount.innerHTML = `
    <div class="rate-weekend">
      <label class="rate-weekend__switch">
        <input type="checkbox" id="season-weekend-enabled" ${enabled ? 'checked' : ''} />
        <span class="rate-weekend__switch-ui" aria-hidden="true"></span>
        <span class="rate-weekend__switch-copy">
          <span class="rate-weekend__switch-title">Apply different rates on weekends</span>
          <span class="rate-weekend__switch-hint">Weekdays stay at Regular</span>
        </span>
      </label>
      <div class="rate-weekend__panel${enabled ? ' is-open' : ''}">
        <div class="rate-weekend__group">
          <span class="rate-field-label">Days</span>
          <div class="rate-weekend__days" role="group" aria-label="Weekend days">
            ${WEEKEND_DAY_OPTIONS.map((d) => `
              <label class="rate-weekend__day">
                <input type="checkbox" class="season-weekend-day" value="${d.value}" ${days.includes(d.value) ? 'checked' : ''} />
                <span>${d.label}</span>
              </label>`).join('')}
          </div>
        </div>
        <div class="rate-weekend__group">
          <span class="rate-field-label">Season</span>
          <select id="season-weekend-season" class="rate-field rate-field--season" aria-label="Weekend season">${seasonOptions(season)}</select>
        </div>
      </div>
    </div>`;

  const enabledInput = mount.querySelector('#season-weekend-enabled');
  const panel = mount.querySelector('.rate-weekend__panel');
  enabledInput?.addEventListener('change', () => {
    panel?.classList.toggle('is-open', enabledInput.checked);
    scheduleSeasonPreview();
  });

  mount.querySelector('#season-weekend-season')?.addEventListener('change', scheduleSeasonPreview);
  mount.querySelectorAll('.season-weekend-day').forEach((el) => {
    el.addEventListener('change', scheduleSeasonPreview);
  });
}

function readWeekendRuleFromForm() {
  const enabled = Boolean(document.getElementById('season-weekend-enabled')?.checked);
  const days = [...document.querySelectorAll('.season-weekend-day:checked')].map((el) => Number(el.value));
  const season = document.getElementById('season-weekend-season')?.value || 'Peak';
  return { enabled, days: days.length ? days : [5, 6, 0], season };
}

function defaultPeriodRow() {
  periodRowId += 1;
  return {
    _id: `p-${periodRowId}`,
    season: 'Peak',
    start_month: 4,
    start_day: 1,
    end_month: 5,
    end_day: 31,
    label: '',
  };
}

function shortMonthDay(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function thisWeekendRow(season = 'Peak') {
  periodRowId += 1;
  const today = new Date();
  const fri = new Date(today);
  const day = today.getDay();
  const daysUntilFri = day <= 5 ? 5 - day : 5 - day + 7;
  fri.setDate(today.getDate() + daysUntilFri);
  const sun = new Date(fri);
  sun.setDate(fri.getDate() + 2);

  return {
    _id: `p-${periodRowId}`,
    season,
    start_month: fri.getMonth() + 1,
    start_day: fri.getDate(),
    end_month: sun.getMonth() + 1,
    end_day: sun.getDate(),
    label: `Weekend (${shortMonthDay(fri)}–${shortMonthDay(sun)})`,
  };
}

function renderPeriodRow(row) {
  return `
    <div class="rate-period" data-period-id="${row._id}">
      <div class="rate-period__top">
        <div class="rate-period__seasons" role="radiogroup" aria-label="Season">${seasonPillsHtml(row)}</div>
        <button type="button" class="rate-period__remove" aria-label="Remove period">
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </div>
      <div class="rate-period__dates">
        <div class="rate-period__date-block">
          <span class="rate-field-label">From</span>
          <div class="rate-period__date-inputs">
            <select class="period-start-month rate-field rate-field--month" aria-label="Start month">${monthOptionsShort(row.start_month)}</select>
            <input type="number" class="period-start-day rate-field rate-field--day" min="1" max="31" value="${row.start_day ?? 1}" aria-label="Start day" />
          </div>
        </div>
        <div class="rate-period__date-block">
          <span class="rate-field-label">To</span>
          <div class="rate-period__date-inputs">
            <select class="period-end-month rate-field rate-field--month" aria-label="End month">${monthOptionsShort(row.end_month)}</select>
            <input type="number" class="period-end-day rate-field rate-field--day" min="1" max="31" value="${row.end_day ?? 31}" aria-label="End day" />
          </div>
        </div>
      </div>
      <input type="text" class="period-label rate-period__note" maxlength="120" placeholder="Note (optional)" value="${escapeAttr(row.label || '')}" />
    </div>`;
}

function bindPeriodRow(rowEl) {
  rowEl.querySelector('.rate-period__remove')?.addEventListener('click', () => {
    rowEl.remove();
    const mount = document.getElementById('season-periods-list');
    const empty = document.getElementById('season-periods-empty');
    empty?.classList.toggle('hidden', Boolean(mount?.children.length));
    scheduleSeasonPreview();
  });

  rowEl.querySelectorAll('.period-season').forEach((radio) => {
    radio.addEventListener('change', () => {
      if (radio.checked) scheduleSeasonPreview();
    });
  });

  rowEl.querySelectorAll('select, input').forEach((el) => {
    if (el.classList.contains('period-season')) return;
    el.addEventListener('change', scheduleSeasonPreview);
    el.addEventListener('input', scheduleSeasonPreview);
  });
}

function renderSeasonPeriodList(periods = []) {
  const mount = document.getElementById('season-periods-list');
  const empty = document.getElementById('season-periods-empty');
  if (!mount) return;

  const rows = (periods || []).map((row) => ({
    ...row,
    _id: row._id || `p-${++periodRowId}`,
  }));

  mount.innerHTML = rows.map((row) => renderPeriodRow(row)).join('');
  empty?.classList.toggle('hidden', rows.length > 0);
  mount.querySelectorAll('.rate-period').forEach(bindPeriodRow);
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function renderSeasonPreviewShell() {
  const mount = document.getElementById('season-preview-mount');
  if (!mount || mount.dataset.bound) return;
  mount.dataset.bound = '1';

  const today = new Date();
  const fri = new Date(today);
  fri.setDate(today.getDate() + ((5 - today.getDay() + 7) % 7 || 7));
  const checkout = new Date(fri);
  checkout.setDate(fri.getDate() + 4);

  const toInput = (d) => d.toISOString().slice(0, 10);

  mount.innerHTML = `
    <div class="rate-preview">
      <div class="rate-preview__dates">
        <label class="rate-preview__field">
          <span class="rate-field-label">Check-in</span>
          <input type="date" id="season-preview-check-in" class="rate-field rate-field--date" value="${toInput(fri)}" />
        </label>
        <label class="rate-preview__field">
          <span class="rate-field-label">Check-out</span>
          <input type="date" id="season-preview-check-out" class="rate-field rate-field--date" value="${toInput(checkout)}" />
        </label>
      </div>
      <div id="season-preview-result" class="rate-preview__result" aria-live="polite"></div>
    </div>`;

  mount.querySelector('#season-preview-check-in')?.addEventListener('change', scheduleSeasonPreview);
  mount.querySelector('#season-preview-check-out')?.addEventListener('change', scheduleSeasonPreview);
}

function readSeasonPeriodsFromForm() {
  return [...document.querySelectorAll('.rate-period')].map((row) => ({
    season: row.querySelector('.period-season:checked')?.value || 'Peak',
    start_month: Number(row.querySelector('.period-start-month')?.value),
    start_day: Number(row.querySelector('.period-start-day')?.value),
    end_month: Number(row.querySelector('.period-end-month')?.value),
    end_day: Number(row.querySelector('.period-end-day')?.value),
    label: row.querySelector('.period-label')?.value?.trim() || '',
  }));
}

function scheduleSeasonPreview() {
  clearTimeout(seasonPreviewTimer);
  seasonPreviewTimer = setTimeout(refreshSeasonPreview, 280);
}

async function refreshSeasonPreview() {
  const result = document.getElementById('season-preview-result');
  const checkIn = document.getElementById('season-preview-check-in')?.value;
  const checkOut = document.getElementById('season-preview-check-out')?.value;
  if (!result || !checkIn || !checkOut) return;

  if (checkOut <= checkIn) {
    result.innerHTML = '<p class="rate-preview__message rate-preview__message--error">Check-out must be after check-in.</p>';
    return;
  }

  result.innerHTML = '<p class="rate-preview__message">Calculating…</p>';

  try {
    const data = await previewSeasonCalendar({
      check_in: checkIn,
      check_out: checkOut,
      season_periods: readSeasonPeriodsFromForm(),
      weekend_rule: readWeekendRuleFromForm(),
    });

    if (!data.nights?.length) {
      result.innerHTML = '<p class="rate-preview__message">No nights in this range.</p>';
      return;
    }

    const chips = data.nights.map((night) => {
      const badge = SEASON_BADGE_CLASS[night.season] || 'settings-season-badge--regular';
      const label = formatDate(night.date);
      return `<span class="rate-preview__night"><span class="rate-preview__night-date">${label}</span><span class="settings-season-badge ${badge}">${night.season}</span></span>`;
    }).join('');

    const summary = data.seasons?.length > 1
      ? `Mixed stay — ${data.seasons.join(', ')}`
      : `${data.seasons?.[0] || 'Regular'} for all nights`;

    result.innerHTML = `
      <p class="rate-preview__summary">${summary}</p>
      <div class="rate-preview__nights">${chips}</div>`;
  } catch (err) {
    result.innerHTML = `<p class="rate-preview__message rate-preview__message--error">${escapeAttr(err.message || 'Preview failed')}</p>`;
  }
}

function readSeasonCalendarFromForm() {
  return {
    season_periods: readSeasonPeriodsFromForm(),
    weekend_rule: readWeekendRuleFromForm(),
  };
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
  const settings = info.settings || {};
  const periods = info.seasonPeriods || settings.season_periods || [];
  const weekendRule = info.weekendRule || settings.weekend_rule || { enabled: false, days: [5, 6, 0], season: 'Peak' };

  renderWeekendRule(weekendRule);
  renderSeasonPeriodList(periods);
  renderSeasonPreviewShell();
  scheduleSeasonPreview();

  if (seasonSummary) {
    const todaySeason = info.seasonForToday || info.activeLodgingSeason || 'Regular';
    seasonSummary.textContent = `Today: ${todaySeason}. Unlisted dates are Regular — weekends and special periods repeat every year.`;
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
    ...readSeasonCalendarFromForm(),
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
