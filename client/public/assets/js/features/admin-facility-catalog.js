/**
 * Admin catalog editor — venues, meals, and extra services.
 * Meals/extras: turn on Edit prices to change cards; Add always opens the form.
 */

import {
  createFacilityRate,
  updateFacilityRate,
  deleteFacilityRate,
  createMealRate,
  updateMealRate,
  deleteMealRate,
  createExtraServiceRate,
  updateExtraServiceRate,
  deleteExtraServiceRate,
} from '/assets/js/services/api.js';
import { confirmModal, loadComponent, showAlertModal } from '/assets/js/layout/ui.js';
import { escapeHtml } from '/assets/js/features/reservation-shared.js';
import { refreshAdminReadOnlyUI } from '/assets/js/services/auth.js';

const DEFAULT_MEAL_NAMES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
const DEFAULT_EXTRA_CATEGORIES = [
  'Laundry',
  'Laundry-Iron',
  'Corkage Fee',
  'Maid Service',
  'Accommodation Extras',
];

let mealTypeOptions = [...DEFAULT_MEAL_NAMES];
let extraCategoryOptions = [...DEFAULT_EXTRA_CATEGORIES];

const SEASONS = ['Regular', 'Peak', 'Super Peak', 'N/A'];
const SEASONAL_EXTRA_CATEGORIES = new Set(['Accommodation Extras']);

function mealTypeName(row) {
  return String(row?.item || row?.meal_type || '').trim();
}

function normalizeMealCatalogRow(row) {
  if (!row) return null;
  const item = mealTypeName(row);
  if (!item) return null;
  return { ...row, item };
}

function syncMealTypeOptions(meals = []) {
  const seen = new Set(DEFAULT_MEAL_NAMES);
  mealTypeOptions = [...DEFAULT_MEAL_NAMES];
  for (const meal of meals) {
    const name = mealTypeName(meal);
    if (name && !seen.has(name)) {
      seen.add(name);
      mealTypeOptions.push(name);
    }
  }
}

function syncExtraCategoryOptions(services = []) {
  const seen = new Set(DEFAULT_EXTRA_CATEGORIES);
  extraCategoryOptions = [...DEFAULT_EXTRA_CATEGORIES];
  for (const group of services) {
    const name = String(group?.category || '').trim();
    if (name && !seen.has(name)) {
      seen.add(name);
      extraCategoryOptions.push(name);
    }
  }
}

function renderSelectWithAdd({ selectId, optionKey, label, options, selected, disabled = false }) {
  const opts = options.map((o) =>
    `<option value="${escapeHtml(o)}"${o === selected ? ' selected' : ''}>${escapeHtml(o)}</option>`
  ).join('');
  const addLabel = optionKey === 'meal' ? 'meal type' : 'service type';
  const maxLen = optionKey === 'meal' ? 100 : 50;
  const placeholder = optionKey === 'meal' ? 'e.g. Brunch' : 'e.g. Parking';

  return `
    <div class="catalog-field-with-add">
      <label class="catalog-label" for="${selectId}">${escapeHtml(label)}</label>
      <select id="${selectId}" class="catalog-input"${disabled ? ' disabled' : ''}>${opts}</select>
      ${disabled ? '' : `
      <button type="button" class="catalog-add-option-btn" data-catalog-add-option="${optionKey}">
        <span class="material-symbols-outlined" aria-hidden="true">add</span>
        Add ${addLabel}
      </button>
      <div class="catalog-add-option-panel hidden" data-catalog-add-option-panel="${optionKey}">
        <input type="text" class="catalog-input catalog-add-option-input" data-catalog-new-option="${optionKey}" maxlength="${maxLen}" placeholder="${placeholder}" aria-label="New ${label}" />
        <div class="catalog-add-option-actions">
          <button type="button" class="catalog-add-option-confirm admin-crud-btn-primary" data-catalog-confirm-option="${optionKey}">Add</button>
          <button type="button" class="catalog-add-option-cancel admin-crud-btn-ghost" data-catalog-cancel-option="${optionKey}">Cancel</button>
        </div>
      </div>`}
    </div>`;
}

function setSelectOptions(selectId, options, selected) {
  const sel = $(selectId);
  if (!sel) return;
  sel.innerHTML = options.map((o) =>
    `<option value="${escapeHtml(o)}"${o === selected ? ' selected' : ''}>${escapeHtml(o)}</option>`
  ).join('');
  if (selected && options.includes(selected)) sel.value = selected;
}

function hideOptionPanel(optionKey) {
  const panel = document.querySelector(`[data-catalog-add-option-panel="${optionKey}"]`);
  panel?.classList.add('hidden');
  const input = document.querySelector(`[data-catalog-new-option="${optionKey}"]`);
  if (input) input.value = '';
}

function addCustomOption(optionKey, rawName) {
  const name = String(rawName || '').trim();
  if (!name) throw new Error(`Enter a ${optionKey === 'meal' ? 'meal type' : 'service type'} name.`);
  const max = optionKey === 'meal' ? 100 : 50;
  if (name.length > max) throw new Error(`Name must be ${max} characters or fewer.`);

  if (optionKey === 'meal') {
    if (!mealTypeOptions.includes(name)) mealTypeOptions.push(name);
    setSelectOptions('cat-item', mealTypeOptions, name);
    updateMealTypeSelectedHint(name);
    return name;
  }

  if (!extraCategoryOptions.includes(name)) extraCategoryOptions.push(name);
  setSelectOptions('cat-category', extraCategoryOptions, name);
  if (SEASONAL_EXTRA_CATEGORIES.has(name)) {
    refreshExtraFormForCategory(name);
  }
  return name;
}

function updateMealTypeSelectedHint(name = '') {
  const hint = document.getElementById('cat-meal-type-hint');
  if (!hint) return;
  const label = String(name || '').trim();
  hint.textContent = label ? `Selected meal type: ${label}` : '';
  hint.classList.toggle('hidden', !label);
}

function bindMealTypeField() {
  const select = $('cat-item');
  if (!select || select.tagName !== 'SELECT') return;
  const sync = () => updateMealTypeSelectedHint(select.value);
  select.addEventListener('change', sync);
  sync();
}

function captureExtraFormDraft() {
  return {
    category: $('cat-category')?.value?.trim() || '',
    item: $('cat-item')?.value?.trim() || '',
    rate: $('cat-rate')?.value ?? '',
    season: $('cat-season')?.value || 'N/A',
  };
}

function refreshExtraFormForCategory(category) {
  if (modalState.kind !== 'extra') return;
  const draft = captureExtraFormDraft();
  modalState.row = {
    ...modalState.row,
    category: category || draft.category,
    item: draft.item || modalState.row?.item || '',
    rate: draft.rate !== '' ? Number(draft.rate) : modalState.row?.rate,
    season: draft.season || modalState.row?.season,
  };
  renderModalForm();
}

function handleCatalogOptionClick(e) {
  const toggle = e.target.closest('[data-catalog-add-option]');
  if (toggle) {
    e.preventDefault();
    const key = toggle.getAttribute('data-catalog-add-option');
    const panel = document.querySelector(`[data-catalog-add-option-panel="${key}"]`);
    const isOpen = panel && !panel.classList.contains('hidden');
    document.querySelectorAll('[data-catalog-add-option-panel]').forEach((el) => el.classList.add('hidden'));
    if (!isOpen) {
      panel?.classList.remove('hidden');
      panel?.querySelector('[data-catalog-new-option]')?.focus();
    }
    return;
  }

  const cancel = e.target.closest('[data-catalog-cancel-option]');
  if (cancel) {
    e.preventDefault();
    hideOptionPanel(cancel.getAttribute('data-catalog-cancel-option'));
    return;
  }

  const confirm = e.target.closest('[data-catalog-confirm-option]');
  if (!confirm) return;
  e.preventDefault();
  const key = confirm.getAttribute('data-catalog-confirm-option');
  const input = document.querySelector(`[data-catalog-new-option="${key}"]`);
  try {
    addCustomOption(key, input?.value);
    hideOptionPanel(key);
    setFeedback('');
  } catch (err) {
    setFeedback(err.message || 'Could not add that option.');
  }
}

function peso(n) {
  return `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 0 })}`;
}

function variantFields(row = {}, defaults = {}) {
  const source = row || {};
  const ageBand = source.age_band || defaults.age_band || 'Adult';
  const currency = source.currency || defaults.currency || 'PHP';
  const billingUnit = source.billing_unit || defaults.billing_unit || 'per item';
  return `
    <input type="hidden" id="cat-audience" value="Guest" />
    <input type="hidden" id="cat-age-band" value="${escapeHtml(ageBand)}" />
    <input type="hidden" id="cat-currency" value="${escapeHtml(currency)}" />
    <input type="hidden" id="cat-billing-unit" value="${escapeHtml(billingUnit)}" />
  `;
}

function extraGuestVisible(item) {
  if (item?.guest_visible === false || item?.guest_visible === 0 || item?.guest_visible === '0') return false;
  return true;
}

function extraGuestToggle(id, visible) {
  const on = extraGuestVisible({ guest_visible: visible });
  return `
    <button type="button"
      class="catalog-guest-toggle${on ? ' is-on' : ''}"
      data-extra-guest-visible="${id}"
      aria-pressed="${on ? 'true' : 'false'}"
      title="${on ? 'Shown to guests — click to hide' : 'Hidden from guests — click to show'}">
      <span class="catalog-guest-toggle__ui" aria-hidden="true"></span>
      <span class="catalog-guest-toggle__text">Guests</span>
    </button>`;
}

function showRowGuestToggleError(rowEl, message) {
  if (!rowEl) return;
  let hint = rowEl.querySelector('.catalog-guest-toggle-error');
  if (!hint) {
    rowEl.querySelector('.catalog-price-row__meta')?.insertAdjacentHTML(
      'afterbegin',
      '<span class="catalog-guest-toggle-error" role="alert"></span>'
    );
    hint = rowEl.querySelector('.catalog-guest-toggle-error');
  }
  if (!hint) return;
  hint.textContent = message;
  hint.classList.add('is-visible');
  window.clearTimeout(hint._errTimer);
  hint._errTimer = window.setTimeout(() => hint.classList.remove('is-visible'), 4000);
}

function bindExtrasGridActions() {
  const mount = $('extras-grid-mount');
  if (!mount || mount.dataset.guestToggleBound === '1') return;
  mount.dataset.guestToggleBound = '1';
  mount.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-extra-guest-visible]');
    if (!btn || btn.disabled) return;
    e.preventDefault();
    e.stopPropagation();
    toggleExtraGuestVisible(btn);
  });
}

function patchExtraGuestVisibleInCache(id, guestVisible) {
  catalogCache.services = catalogCache.services.map((group) => ({
    ...group,
    items: (group.items || []).map((item) => (
      Number(item.id) === Number(id) ? { ...item, guest_visible: guestVisible } : item
    )),
  }));
}

function applyExtraRowGuestVisible(rowEl, guestVisible) {
  if (!rowEl) return;
  const on = extraGuestVisible({ guest_visible: guestVisible });
  rowEl.classList.toggle('catalog-price-row--guest-off', !on);

  const btn = rowEl.querySelector('[data-extra-guest-visible]');
  if (btn) {
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.title = on ? 'Shown to guests — click to hide' : 'Hidden from guests — click to show';
  }

  const labelCol = rowEl.querySelector('.min-w-0');
  const badge = rowEl.querySelector('.catalog-price-row__guest-badge');
  if (!on && !badge && labelCol) {
    labelCol.insertAdjacentHTML('beforeend', '<p class="catalog-price-row__guest-badge">Admin only</p>');
  } else if (on && badge) {
    badge.remove();
  }
}

const guestToggleInflight = new Set();

async function toggleExtraGuestVisible(btn) {
  const id = Number(btn.getAttribute('data-extra-guest-visible'));
  if (!id || guestToggleInflight.has(id)) return;

  const next = !btn.classList.contains('is-on');
  const prev = !next;
  const row = btn.closest('.catalog-price-row');

  guestToggleInflight.add(id);
  btn.disabled = true;
  btn.classList.add('catalog-guest-toggle--saving');
  row?.querySelector('.catalog-guest-toggle-error')?.classList.remove('is-visible');

  btn.classList.toggle('is-on', next);
  btn.setAttribute('aria-pressed', next ? 'true' : 'false');
  applyExtraRowGuestVisible(row, next);

  try {
    await updateExtraServiceRate(id, { guest_visible: next });
    patchExtraGuestVisibleInCache(id, next);
  } catch (err) {
    btn.classList.toggle('is-on', prev);
    btn.setAttribute('aria-pressed', prev ? 'true' : 'false');
    applyExtraRowGuestVisible(row, prev);
    patchExtraGuestVisibleInCache(id, prev);
    showRowGuestToggleError(row, err?.message || 'Could not save. Try again.');
  } finally {
    guestToggleInflight.delete(id);
    btn.disabled = false;
    btn.classList.remove('catalog-guest-toggle--saving');
  }
}


function variantChips() {
  return '';
}

let onRefresh = async () => {};
let catalogModalEventsBound = false;
/** @type {AbortController | null} */
let catalogPageActionsAbort = null;
let modalState = { mode: 'edit', kind: 'venue', row: null };
let activeCatalogTab = 'rooms';
const catalogEditMode = { meals: false, extras: false };
const catalogCache = { venues: [], meals: [], services: [] };

function catalogOpenError(err) {
  console.error('[facility-catalog] Could not open form:', err);
  void showAlertModal(
    'Could not open form',
    err?.message || 'Could not open the price form. Refresh the page and try again.'
  );
}

async function ensureFacilityCatalogModalMounted() {
  const existing = document.getElementById('catalog-modal');
  if (existing?.isConnected) return;

  document.getElementById('catalog-modal')?.remove();
  document.getElementById('catalog-modal-overlay')?.remove();
  catalogModalEventsBound = false;

  const html = await loadComponent('/components/facility-catalog-modal.html');
  document.body.insertAdjacentHTML('beforeend', html);
  catalogModalEventsBound = false;
}

function bindCatalogModalEvents() {
  if (!$('catalog-modal') || catalogModalEventsBound) return;
  catalogModalEventsBound = true;

  $('catalog-modal-close')?.addEventListener('click', hideModal);
  $('catalog-modal-overlay')?.addEventListener('click', hideModal);
  $('catalog-modal-cancel')?.addEventListener('click', hideModal);
  $('catalog-modal-save')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    saveModal();
  });
  $('catalog-modal-delete')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    deleteRow();
  });

  $('catalog-modal')?.addEventListener('click', (e) => {
    if (e.target === $('catalog-modal')) hideModal();
  });

  $('catalog-modal')?.addEventListener('click', (e) => {
    if (e.target.closest('[data-catalog-add-option], [data-catalog-confirm-option], [data-catalog-cancel-option]')) {
      handleCatalogOptionClick(e);
    }
  });

  $('catalog-modal-fields')?.addEventListener('change', (e) => {
    if (modalState.kind !== 'extra' || modalState.mode === 'edit') return;
    if (e.target.id !== 'cat-category') return;
    refreshExtraFormForCategory(e.target.value);
  });
}

function $(id) {
  return document.getElementById(id);
}

function showModal() {
  $('catalog-modal-overlay')?.classList.remove('hidden');
  $('catalog-modal')?.classList.remove('hidden');
  $('catalog-modal-overlay')?.setAttribute('aria-hidden', 'false');
  $('catalog-modal')?.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => $('cat-rate')?.focus());
}

function hideModal() {
  $('catalog-modal-overlay')?.classList.add('hidden');
  $('catalog-modal')?.classList.add('hidden');
  $('catalog-modal-overlay')?.setAttribute('aria-hidden', 'true');
  $('catalog-modal')?.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

/** Close catalog modal when leaving Facilities or on any admin page transition. */
export function hideFacilityCatalogModal() {
  if (document.getElementById('catalog-modal')) hideModal();
}

/** Drop modal markup and page listeners when admin soft-nav leaves Facilities. */
export function teardownFacilityCatalog() {
  catalogPageActionsAbort?.abort();
  catalogPageActionsAbort = null;
  hideFacilityCatalogModal();
  document.getElementById('catalog-modal')?.remove();
  document.getElementById('catalog-modal-overlay')?.remove();
  document.getElementById('extras-grid-mount')?.removeAttribute('data-guest-toggle-bound');
  catalogModalEventsBound = false;
}

export function isFacilityCatalogModalOpen() {
  return !$('catalog-modal')?.classList.contains('hidden');
}

function setFeedback(msg, ok = false) {
  const el = $('catalog-modal-feedback');
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

function renderModalForm() {
  const title = $('catalog-modal-title');
  const fields = $('catalog-modal-fields');
  const deleteBtn = $('catalog-modal-delete');
  if (!title || !fields) return;

  const { mode, kind, row } = modalState;
  title.textContent = mode === 'add'
    ? (kind === 'venue' ? 'Add Venue Price' : kind === 'meal' ? 'Add Meal Price' : 'Add Extra Service')
    : (kind === 'venue' ? 'Edit Venue Price' : kind === 'meal' ? 'Edit Meal Price' : 'Edit Extra Service');

  const saveBtn = $('catalog-modal-save');
  if (saveBtn) saveBtn.textContent = mode === 'add' ? 'Add' : 'Save changes';

  deleteBtn?.classList.toggle('hidden', mode !== 'edit' || !row?.id);

  if (kind === 'meal') {
    const mealName = mealTypeName(row) || mealTypeOptions[0] || '';
    fields.innerHTML = `
      ${mode === 'edit' ? `
      <label class="catalog-label" for="cat-item">Meal type</label>
      <input id="cat-item" class="catalog-input" type="text" value="${escapeHtml(mealName)}" readonly />
      ` : `
      ${renderSelectWithAdd({
        selectId: 'cat-item',
        optionKey: 'meal',
        label: 'Meal type',
        options: mealTypeOptions,
        selected: mealName,
        disabled: false,
      })}
      <p id="cat-meal-type-hint" class="catalog-meal-type-hint${mealName ? '' : ' hidden'}">${mealName ? `Selected meal type: ${escapeHtml(mealName)}` : ''}</p>`}
      <input type="hidden" id="cat-category" value="Food Service" />
      <input type="hidden" id="cat-season" value="N/A" />
      <label class="catalog-label" for="cat-rate">Price per person (₱)</label>
      <input id="cat-rate" class="catalog-input" type="number" min="1" step="1" value="${row?.rate ?? ''}" placeholder="e.g. 225" />
      ${variantFields(row, { billing_unit: 'per meal' })}
    `;
    if (mode === 'add') bindMealTypeField();
    return;
  }

  if (kind === 'extra') {
    const cat = row?.category || extraCategoryOptions[0];
    const seasonal = SEASONAL_EXTRA_CATEGORIES.has(cat);
    const seasonOptions = seasonal
      ? SEASONS.filter((s) => s !== 'N/A')
      : ['N/A'];
    const selectedSeason = row?.season && seasonOptions.includes(row.season)
      ? row.season
      : seasonOptions[0];
    fields.innerHTML = `
      ${renderSelectWithAdd({
        selectId: 'cat-category',
        optionKey: 'extra',
        label: 'Service type',
        options: extraCategoryOptions,
        selected: cat,
      })}
      <label class="catalog-label" for="cat-item">Item name</label>
      <input id="cat-item" class="catalog-input" type="text" value="${escapeHtml(row?.item || '')}" placeholder="e.g. Extra Mattress" />
      ${seasonal ? `
      <label class="catalog-label">Season</label>
      <select id="cat-season" class="catalog-input">
        ${seasonOptions.map((s) => `<option value="${s}"${selectedSeason === s ? ' selected' : ''}>${s}</option>`).join('')}
      </select>` : '<input type="hidden" id="cat-season" value="N/A" />'}
      <label class="catalog-label">Price (₱)</label>
      <input id="cat-rate" class="catalog-input" type="number" min="1" step="1" value="${row?.rate ?? ''}" placeholder="e.g. 500" />
      <label class="catalog-guest-toggle catalog-guest-toggle--field" for="cat-guest-visible">
        <input id="cat-guest-visible" type="checkbox" class="catalog-guest-toggle__input" ${extraGuestVisible(row ?? { guest_visible: true }) ? 'checked' : ''} />
        <span class="catalog-guest-toggle__ui" aria-hidden="true"></span>
        <span class="catalog-guest-toggle__copy">
          <span class="catalog-guest-toggle__text">Show to guests</span>
          <span class="catalog-guest-toggle__hint">When on, this fee appears in guest booking flows.</span>
        </span>
      </label>
      ${variantFields(row, { billing_unit: seasonal ? 'per night' : 'per item' })}
    `;
    return;
  }

  fields.innerHTML = `
    <label class="catalog-label">Venue group (e.g. Prayer Mountain, GMC Chapel)</label>
    <input id="cat-category" class="catalog-input" type="text" value="${escapeHtml(row?.category || '')}" placeholder="Venue name" />
    <label class="catalog-label">Package / item name</label>
    <input id="cat-item" class="catalog-input" type="text" value="${escapeHtml(row?.item || '')}" placeholder="e.g. Four Hour minimum" />
    <label class="catalog-label">Season</label>
    <select id="cat-season" class="catalog-input">
      ${SEASONS.filter((s) => s !== 'N/A').map((s) => `<option value="${s}"${row?.season === s ? ' selected' : ''}>${s}</option>`).join('')}
    </select>
    <label class="catalog-label">Price (₱)</label>
    <input id="cat-rate" class="catalog-input" type="number" min="1" step="1" value="${row?.rate ?? ''}" placeholder="e.g. 4500" />
    ${variantFields(row, { billing_unit: 'per segment' })}
    <div class="catalog-row">
      <div>
        <label class="catalog-label">Min people (optional)</label>
        <input id="cat-cap-min" class="catalog-input" type="number" min="1" value="${row?.capacity_min ?? ''}" placeholder="1" />
      </div>
      <div>
        <label class="catalog-label">Max people (optional)</label>
        <input id="cat-cap-max" class="catalog-input" type="number" min="1" value="${row?.capacity_max ?? ''}" placeholder="100" />
      </div>
    </div>
  `;
}

async function openCatalogModal({ mode, kind, row = null }) {
  await ensureFacilityCatalogModalMounted();
  bindCatalogModalEvents();
  modalState = { mode, kind, row };
  setFeedback('');
  renderModalForm();
  showModal();
}

function readPayload() {
  const { kind } = modalState;
  const category = $('cat-category')?.value?.trim();
  const itemRaw = $('cat-item')?.value?.trim();
  const item = itemRaw;
  const season = $('cat-season')?.value || 'N/A';
  const rate = Number($('cat-rate')?.value);
  const capMinEl = $('cat-cap-min');
  const capMaxEl = $('cat-cap-max');
  const capacity_min = capMinEl?.value ? Number(capMinEl.value) : null;
  const capacity_max = capMaxEl?.value ? Number(capMaxEl.value) : null;
  const audience = $('cat-audience')?.value?.trim() || 'Guest';
  const age_band = $('cat-age-band')?.value || 'Adult';
  const currency = $('cat-currency')?.value || 'PHP';
  const billing_unit = $('cat-billing-unit')?.value?.trim() || 'per item';
  const notes = $('cat-notes')?.value?.trim() || null;

  if (kind === 'meal') {
    if (!item) throw new Error('Choose or add a meal type name.');
    if (!rate || rate <= 0) throw new Error('Enter a valid price greater than zero.');
    return {
      category: 'Food Service',
      item,
      meal_type: item,
      season: 'N/A',
      rate,
      capacity_min: null,
      capacity_max: null,
      audience,
      age_band,
      currency,
      billing_unit: billing_unit || 'per meal',
      notes,
    };
  }

  if (!category || !item || !rate || rate <= 0) {
    throw new Error('Please fill in all required fields with a valid price.');
  }

  const base = { category, item, season, rate, capacity_min, capacity_max, audience, age_band, currency, billing_unit, notes };
  if (kind === 'extra') {
    base.guest_visible = $('cat-guest-visible')?.checked !== false;
  }
  return base;
}

function catalogItemLabel(kind, row = {}) {
  const data = row || {};
  if (kind === 'meal') return mealTypeName(data) || 'Meal';
  if (kind === 'extra') return `${data.category || 'Extra'} — ${data.item || 'Service'}`;
  return `${data.category || 'Venue'} — ${data.item || 'Price'}`;
}

async function saveModal() {
  const btn = $('catalog-modal-save');
  const { mode, kind, row } = modalState;

  try {
    const payload = readPayload();
    const label = escapeHtml(catalogItemLabel(kind, { ...row, ...payload }));

    const confirmed = await confirmModal({
      title: mode === 'add'
        ? (kind === 'meal' ? 'Add meal price' : kind === 'extra' ? 'Add extra service' : 'Add venue price')
        : 'Save changes',
      message: mode === 'add'
        ? `Add <strong>${label}</strong> at <strong>${peso(payload.rate)}</strong> to the catalog?`
        : `Save changes to <strong>${label}</strong>?`,
      confirmLabel: mode === 'add' ? 'Add' : 'Save',
      elevate: true,
    });
    if (!confirmed) return;

    btn.disabled = true;
    setFeedback('Saving…');

    if (mode === 'edit' && row?.id) {
      if (kind === 'meal') {
        const updated = await updateMealRate(row.id, payload);
        applyMealCatalogUpsert(updated?.meal);
      } else if (kind === 'extra') await updateExtraServiceRate(row.id, payload);
      else await updateFacilityRate(row.id, payload);
      setFeedback('Saved!', true);
    } else {
      if (kind === 'meal') {
        const created = await createMealRate(payload);
        applyMealCatalogUpsert(created?.meal);
      } else if (kind === 'extra') await createExtraServiceRate(payload);
      else await createFacilityRate(payload);
      setFeedback('Added!', true);
    }
    await refreshCatalogAfterMutation();
    setTimeout(hideModal, 400);
  } catch (err) {
    setFeedback(err.message || 'Could not save.');
  } finally {
    btn.disabled = false;
  }
}

async function deleteRow() {
  if (!modalState.row?.id) return;

  const { kind, row } = modalState;
  const label = catalogItemLabel(kind, row);

  const confirmed = await confirmModal({
    title: 'Remove price listing',
    message: `Are you sure you want to remove <strong>${escapeHtml(label)}</strong>? This cannot be undone.`,
    confirmLabel: 'Remove',
    danger: true,
    elevate: true,
  });
  if (!confirmed) return;

  const btn = $('catalog-modal-delete');
  btn.disabled = true;
  const numId = row.id;
  try {
    if (kind === 'meal') await deleteMealRate(numId);
    else if (kind === 'extra') await deleteExtraServiceRate(numId);
    else await deleteFacilityRate(numId);
    applyCatalogRemoval(kind, numId);
    await refreshCatalogAfterMutation();
    hideModal();
  } catch (err) {
    await refreshCatalogAfterMutation();
    setFeedback(err.message || 'Could not delete.');
  } finally {
    btn.disabled = false;
  }
}

function resolveRow(kind, id) {
  const numId = Number(id);
  if (kind === 'meal') {
    const m = catalogCache.meals.find((x) => x.id === numId);
    return m ? {
      id: m.id,
      category: 'Food Service',
      item: mealTypeName(m),
      season: 'N/A',
      rate: m.rate,
      audience: m.audience,
      age_band: m.age_band,
      currency: m.currency,
      billing_unit: m.billing_unit,
      notes: m.notes,
    } : null;
  }
  if (kind === 'extra') {
    for (const group of catalogCache.services) {
      const item = group.items.find((x) => x.id === numId);
      if (item) {
        return {
          id: item.id,
          category: group.category,
          item: item.item,
          season: item.season,
          rate: item.rate,
          guest_visible: item.guest_visible,
          audience: item.audience,
          age_band: item.age_band,
          currency: item.currency,
          billing_unit: item.billing_unit,
          notes: item.notes,
        };
      }
    }
    return null;
  }
  for (const venue of catalogCache.venues) {
    for (const item of venue.items) {
      const rate = item.rates.find((r) => r.id === numId);
      if (rate) {
        return {
          id: rate.id,
          facility_id: item.facility_id,
          category: venue.category,
          item: item.item,
          season: rate.season,
          rate: rate.rate,
          audience: rate.audience,
          age_band: rate.age_band,
          currency: rate.currency,
          billing_unit: rate.billing_unit,
          notes: rate.notes,
          capacity_min: item.capacity_min,
          capacity_max: item.capacity_max,
        };
      }
    }
  }
  return null;
}

function editBtn(kind, id) {
  return `<button type="button" class="catalog-edit-btn" data-catalog-edit="${kind}" data-id="${id}" aria-label="Edit this price">
    <span class="material-symbols-outlined text-[18px]">edit</span> Edit
  </button>`;
}

function applyMealCatalogUpsert(rawMeal) {
  const meal = normalizeMealCatalogRow(rawMeal);
  if (!meal?.id) return;
  const next = catalogCache.meals.filter((m) => Number(m.id) !== Number(meal.id));
  next.push(meal);
  next.sort((a, b) => mealTypeName(a).localeCompare(mealTypeName(b)));
  renderMealsCatalog(next);
}

function applyCatalogRemoval(kind, id) {
  const numId = Number(id);
  if (kind === 'meal') {
    catalogCache.meals = catalogCache.meals.filter((m) => m.id !== numId);
    renderMealsCatalog(catalogCache.meals);
    return;
  }
  if (kind === 'extra') {
    catalogCache.services = catalogCache.services
      .map((group) => ({
        ...group,
        items: (group.items || []).filter((item) => item.id !== numId),
      }))
      .filter((group) => (group.items || []).length > 0);
    renderExtrasCatalog(catalogCache.services);
  }
}

async function refreshCatalogAfterMutation() {
  if (typeof onRefresh === 'function') {
    await onRefresh();
  }
}

function deleteBtn(kind, id) {
  return `<button type="button" class="catalog-delete-btn" data-catalog-delete="${kind}" data-id="${id}" aria-label="Remove this price">
    <span class="material-symbols-outlined text-[18px]">delete</span> Remove
  </button>`;
}

async function deleteCatalogItem(kind, id) {
  const row = resolveRow(kind, id);
  if (!row?.id) return;

  const label = escapeHtml(catalogItemLabel(kind, row));
  const confirmed = await confirmModal({
    title: 'Remove price listing',
    message: `Are you sure you want to remove <strong>${label}</strong>? This cannot be undone.`,
    confirmLabel: 'Remove',
    danger: true,
    elevate: true,
  });
  if (!confirmed) return;

  const numId = row.id;
  try {
    if (kind === 'meal') await deleteMealRate(numId);
    else if (kind === 'extra') await deleteExtraServiceRate(numId);
    else await deleteFacilityRate(numId);
    applyCatalogRemoval(kind, numId);
    await refreshCatalogAfterMutation();
  } catch (err) {
    await refreshCatalogAfterMutation();
    showAlertModal('Could not remove', err.message || 'Could not remove this price.');
  }
}

export function setCatalogToolbarTab(tab) {
  if (tab !== 'meals') catalogEditMode.meals = false;
  if (tab !== 'extras') catalogEditMode.extras = false;
  activeCatalogTab = tab;
  applyEditModeClass();
  updateCatalogToolbar();
}

function applyEditModeClass() {
  $('fac-panel-meals')?.classList.toggle('catalog-is-editing', catalogEditMode.meals);
  $('fac-panel-extras')?.classList.toggle('catalog-is-editing', catalogEditMode.extras);
}

export function toggleCatalogEditMode(ev) {
  const key = ev?.currentTarget?.getAttribute('data-catalog-for');
  if (!key || !(key in catalogEditMode)) return;
  catalogEditMode[key] = !catalogEditMode[key];
  applyEditModeClass();
  updateCatalogToolbar();
}

function updateCatalogToolbar() {
  document.querySelectorAll('[data-catalog-edit-toggle]').forEach((editToggle) => {
    const panelTab = editToggle.getAttribute('data-catalog-for');
    if (!panelTab || !(panelTab in catalogEditMode)) return;

    const editing = catalogEditMode[panelTab];
    editToggle.innerHTML = editing
      ? '<span class="material-symbols-outlined text-[20px]" aria-hidden="true">check</span> Done editing'
      : '<span class="material-symbols-outlined text-[20px]" aria-hidden="true">edit</span> Edit prices';
    editToggle.classList.toggle('res-btn--primary', editing);
    editToggle.setAttribute('aria-pressed', editing ? 'true' : 'false');
  });

  document.querySelectorAll('[data-catalog-edit-hint]').forEach((el) => {
    const panelTab = el.getAttribute('data-catalog-panel');
    if (!panelTab || !(panelTab in catalogEditMode)) return;
    el.classList.toggle('hidden', !catalogEditMode[panelTab]);
  });
}

export function renderVenuesCatalog(venues) {
  catalogCache.venues = venues || [];
  const mount = $('venues-grid-mount');
  if (!mount) return;

  if (!venues?.length) {
    mount.innerHTML = '<p class="fac-catalog-grid__empty">No venues yet. Use <strong>Add venue</strong> to create your first price.</p>';
    return;
  }

  mount.innerHTML = venues.map((venue) => {
    const itemsHtml = venue.items.flatMap((item) =>
      item.rates.map((rate) => {
        const cap = item.capacity_max
          ? (item.capacity_min > 1 ? `${item.capacity_min}–${item.capacity_max} people` : `Up to ${item.capacity_max} people`)
          : '';
        const title = item.label || item.name || item.item;
        const subtitle = item.description
          || (item.room_code && item.name && item.room_code !== item.name ? item.name : '');
        return `
          <li class="catalog-price-row flex items-start justify-between gap-3 py-2.5 border-b border-slate-100 last:border-0">
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-slate-800">${escapeHtml(title)}</p>
              ${subtitle ? `<p class="text-xs text-slate-500 mt-0.5">${escapeHtml(subtitle)}</p>` : ''}
              <p class="text-xs text-slate-500 mt-0.5">${escapeHtml(rate.season)}${cap ? ` · ${escapeHtml(cap)}` : ''}</p>
              <p class="text-xs text-slate-500 mt-0.5">${escapeHtml(variantSummary(rate))}</p>
            </div>
            <div class="text-right shrink-0 flex flex-col items-end gap-1.5">
              <p class="text-sm font-bold text-slate-900">${peso(rate.rate)}</p>
              ${editBtn('venue', rate.id)}
            </div>
          </li>`;
      })
    ).join('');

    return `
      <article class="venue-card">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
            <span class="material-symbols-outlined">${escapeHtml(venue.icon || 'place')}</span>
          </div>
          <h4 class="text-base font-bold text-slate-800">${escapeHtml(venue.category)}</h4>
        </div>
        <ul class="space-y-0">${itemsHtml}</ul>
      </article>`;
  }).join('');
}

export function renderMealsCatalog(meals) {
  catalogCache.meals = (meals || []).map((meal) => normalizeMealCatalogRow(meal)).filter(Boolean);
  syncMealTypeOptions(catalogCache.meals);
  const mount = $('meals-grid-mount');
  if (!mount) return;

  const visible = catalogCache.meals;

  if (!visible.length) {
    mount.innerHTML = '<p class="fac-catalog-grid__empty">No meal prices yet. Use <strong>Add meal</strong> to get started.</p>';
    refreshAdminReadOnlyUI();
    return;
  }

  mount.innerHTML = visible.map((meal) => `
    <article class="fac-meal-card">
      <div class="fac-meal-card__icon">
        <span class="material-symbols-outlined">${escapeHtml(meal.icon || 'restaurant')}</span>
      </div>
      <h4 class="fac-meal-card__title">${escapeHtml(mealTypeName(meal) || 'Meal')}</h4>
      <p class="fac-meal-card__price">${peso(meal.rate)}</p>
      ${variantChips(meal)}
      <div class="catalog-card-actions">
        ${editBtn('meal', meal.id)}
        ${deleteBtn('meal', meal.id)}
      </div>
    </article>`).join('');
  refreshAdminReadOnlyUI();
}

export function renderExtrasCatalog(services) {
  catalogCache.services = services || [];
  syncExtraCategoryOptions(catalogCache.services);
  const mount = $('extras-grid-mount');
  if (!mount) return;

  const cards = (services || []).map((group) => {
    const items = group.items || [];
    if (!items.length) return '';

    const itemsHtml = items.map((item) => {
      const guestOn = extraGuestVisible(item);
      return `
      <li class="catalog-price-row${guestOn ? '' : ' catalog-price-row--guest-off'}">
        <div class="min-w-0">
          <p class="catalog-price-row__label">${escapeHtml(item.item)}</p>
          ${item.season && item.season !== 'N/A' ? `<p class="catalog-price-row__season">${escapeHtml(item.season)}</p>` : ''}
          ${variantChips(item)}
          ${guestOn ? '' : '<p class="catalog-price-row__guest-badge">Admin only</p>'}
        </div>
        <div class="catalog-price-row__meta">
          ${extraGuestToggle(item.id, item.guest_visible)}
          <p class="catalog-price-row__price">${peso(item.rate)}</p>
          <div class="catalog-card-actions">
            ${editBtn('extra', item.id)}
            ${deleteBtn('extra', item.id)}
          </div>
        </div>
      </li>`;
    }).join('');

    return `
      <article class="fac-extra-card">
        <div class="fac-extra-card__head">
          <div class="fac-extra-card__icon">
            <span class="material-symbols-outlined">${escapeHtml(group.icon || 'add_circle')}</span>
          </div>
          <h4 class="fac-extra-card__title">${escapeHtml(group.category)}</h4>
        </div>
        <ul class="fac-extra-card__list">${itemsHtml}</ul>
      </article>`;
  }).filter(Boolean);

  if (!cards.length) {
    mount.innerHTML = '<p class="fac-catalog-grid__empty">No extra services yet. Use <strong>Add extra</strong> for laundry, mattress, corkage, and other fees.</p>';
    refreshAdminReadOnlyUI();
    return;
  }

  mount.innerHTML = cards.join('');
  bindExtrasGridActions();
  refreshAdminReadOnlyUI();
}

function handleCatalogPageClick(e) {
  if (e.target.closest('[data-extra-guest-visible]')) return;

  const editToggle = e.target.closest('[data-catalog-edit-toggle]');
  if (editToggle) {
    e.preventDefault();
    toggleCatalogEditMode({ currentTarget: editToggle });
    return;
  }

  const edit = e.target.closest('[data-catalog-edit]');
  if (edit) {
    const kind = edit.getAttribute('data-catalog-edit');
    const panelTab = kind === 'meal' ? 'meals' : kind === 'extra' ? 'extras' : null;
    if (panelTab && !catalogEditMode[panelTab]) return;

    const row = resolveRow(kind, edit.getAttribute('data-id'));
    if (!row) return;
    e.preventDefault();
    openCatalogModal({ mode: 'edit', kind, row }).catch(catalogOpenError);
    return;
  }

  const del = e.target.closest('[data-catalog-delete]');
  if (del) {
    const kind = del.getAttribute('data-catalog-delete');
    const panelTab = kind === 'meal' ? 'meals' : kind === 'extra' ? 'extras' : null;
    if (panelTab && !catalogEditMode[panelTab]) return;
    e.preventDefault();
    deleteCatalogItem(kind, del.getAttribute('data-id'));
    return;
  }

  const add = e.target.closest('[data-catalog-add]');
  if (!add) return;
  e.preventDefault();
  openCatalogModal({ mode: 'add', kind: add.getAttribute('data-catalog-add') }).catch(catalogOpenError);
}

function bindCatalogPageActions() {
  catalogPageActionsAbort?.abort();
  catalogPageActionsAbort = new AbortController();
  const { signal } = catalogPageActionsAbort;

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isFacilityCatalogModalOpen()) hideModal();
  }, { signal });

  document.addEventListener('click', handleCatalogPageClick, { signal, capture: true });
}

export async function initFacilityCatalog({ refresh }) {
  onRefresh = refresh;
  await ensureFacilityCatalogModalMounted();
  bindCatalogModalEvents();
  bindCatalogPageActions();
  bindExtrasGridActions();
}
