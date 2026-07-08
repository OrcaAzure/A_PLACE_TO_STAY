/**
 * Admin catalog editor — venues, meals, and extra services.
 * Per-item Edit buttons appear only after "Edit prices" is turned on.
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
import { confirmModal, loadComponent } from '/assets/js/layout/ui.js';
import {
  normalizeAudience,
  rowAudience,
  filterByAudience,
  countByAudience,
  renderPricingAudienceTabs,
  bindPricingAudienceTabs,
  audienceTabHint,
} from '/assets/js/features/admin-pricing-audience.js';

const MEAL_NAMES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
const EXTRA_CATEGORIES = [
  'Laundry',
  'Laundry-Iron',
  'Corkage Fee',
  'Maid Service',
  'Accommodation Extras',
];

const SEASONS = ['Regular', 'Peak', 'Super Peak', 'N/A'];
const SEASONAL_EXTRA_CATEGORIES = new Set(['Accommodation Extras']);
const CURRENCIES = ['PHP', 'USD'];
const AGE_BANDS = ['Adult', 'Child', 'All Ages'];

const TAB_PANEL = { venues: 'fac-panel-venue-prices', meals: 'fac-panel-meals', extras: 'fac-panel-extras' };

function peso(n) {
  return `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 0 })}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function simpleVariantFields(row = {}, defaults = {}) {
  const ageBand = row.age_band || defaults.age_band || 'Adult';
  const currency = row.currency || defaults.currency || 'PHP';
  const audience = modalState.kind === 'extra'
    ? 'Guest'
    : normalizeAudience(activeCatalogAudience);
  return `
    <div class="catalog-row">
      <div>
        <label class="catalog-label" for="cat-age-band">Age band</label>
        <select id="cat-age-band" class="catalog-input">
          ${AGE_BANDS.map((v) => `<option value="${v}"${ageBand === v ? ' selected' : ''}>${v}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="catalog-label" for="cat-currency">Currency</label>
        <select id="cat-currency" class="catalog-input">
          ${CURRENCIES.map((v) => `<option value="${v}"${currency === v ? ' selected' : ''}>${v}</option>`).join('')}
        </select>
      </div>
    </div>
    <input type="hidden" id="cat-audience" value="${escapeHtml(audience)}" />
    <input type="hidden" id="cat-billing-unit" value="${escapeHtml(defaults.billing_unit || 'per item')}" />
  `;
}

function variantFields(row = {}, defaults = {}) {
  return simpleVariantFields(row, defaults);
}

function variantSummary(row = {}) {
  return [row.audience, row.age_band, row.currency, row.billing_unit, row.notes].filter(Boolean).join(' · ');
}

function variantChips(row = {}) {
  const chips = [
    row.age_band !== 'Adult' ? row.age_band : null,
    row.currency !== 'PHP' ? row.currency : null,
    row.billing_unit && !['per meal', 'per item'].includes(row.billing_unit) ? row.billing_unit : null,
  ].filter(Boolean);

  if (!chips.length) return '';
  return `<div class="catalog-variant-chips">${chips.map((chip) => `<span class="catalog-variant-chip">${escapeHtml(chip)}</span>`).join('')}</div>`;
}

let onRefresh = async () => {};
let catalogShellInitialized = false;
let catalogModalEventsBound = false;
let modalMountPromise = null;
let modalState = { mode: 'edit', kind: 'venue', row: null };
let activeCatalogTab = 'rooms';
let activeCatalogAudience = 'Guest';
const catalogEditMode = { venues: false, meals: false, extras: false };
const catalogCache = { venues: [], meals: [], services: [] };

async function ensureFacilityCatalogModalMounted() {
  if (document.getElementById('catalog-modal')) return;
  if (!modalMountPromise) {
    modalMountPromise = loadComponent('/components/facility-catalog-modal.html').then((html) => {
      document.body.insertAdjacentHTML('beforeend', html);
    });
  }
  await modalMountPromise;
}

function bindCatalogModalEvents() {
  if (!$('catalog-modal') || catalogModalEventsBound) return;
  catalogModalEventsBound = true;

  $('catalog-modal-close')?.addEventListener('click', hideModal);
  $('catalog-modal-overlay')?.addEventListener('click', hideModal);
  $('catalog-modal-cancel')?.addEventListener('click', hideModal);
  $('catalog-modal-save')?.addEventListener('click', () => { saveModal(); });
  $('catalog-modal-delete')?.addEventListener('click', () => { deleteRow(); });

  $('catalog-modal')?.addEventListener('click', (e) => {
    if (e.target === $('catalog-modal')) hideModal();
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
  if (!fields) return;

  const { mode, kind, row } = modalState;
  title.textContent = mode === 'add'
    ? (kind === 'venue' ? 'Add Venue Price' : kind === 'meal' ? 'Add Meal Price' : 'Add Extra Service')
    : (kind === 'venue' ? 'Edit Venue Price' : kind === 'meal' ? 'Edit Meal Price' : 'Edit Extra Service');

  const saveBtn = $('catalog-modal-save');
  if (saveBtn) saveBtn.textContent = mode === 'add' ? 'Add' : 'Save changes';

  deleteBtn?.classList.toggle('hidden', mode !== 'edit' || !row?.id);

  if (kind === 'meal') {
    fields.innerHTML = `
      <label class="catalog-label">Meal type</label>
      <select id="cat-item" class="catalog-input"${mode === 'edit' ? ' disabled' : ''}>
        ${MEAL_NAMES.map((m) => `<option value="${m}"${row?.item === m ? ' selected' : ''}>${m}</option>`).join('')}
      </select>
      <input type="hidden" id="cat-category" value="Food Service" />
      <input type="hidden" id="cat-season" value="N/A" />
      <label class="catalog-label">Price per person (₱)</label>
      <input id="cat-rate" class="catalog-input" type="number" min="1" step="1" value="${row?.rate ?? ''}" placeholder="e.g. 225" />
      ${variantFields(row, { billing_unit: 'per meal' })}
    `;
    return;
  }

  if (kind === 'extra') {
    const cat = row?.category || EXTRA_CATEGORIES[0];
    const seasonal = SEASONAL_EXTRA_CATEGORIES.has(cat);
    const seasonOptions = seasonal
      ? SEASONS.filter((s) => s !== 'N/A')
      : ['N/A'];
    const selectedSeason = row?.season && seasonOptions.includes(row.season)
      ? row.season
      : seasonOptions[0];
    fields.innerHTML = `
      <label class="catalog-label">Service type</label>
      <select id="cat-category" class="catalog-input">
        ${EXTRA_CATEGORIES.map((c) => `<option value="${escapeHtml(c)}"${c === cat ? ' selected' : ''}>${escapeHtml(c)}</option>`).join('')}
      </select>
      <label class="catalog-label">Item name</label>
      <input id="cat-item" class="catalog-input" type="text" value="${escapeHtml(row?.item || '')}" placeholder="e.g. Extra Mattress" />
      ${seasonal ? `
      <label class="catalog-label">Season</label>
      <select id="cat-season" class="catalog-input">
        ${seasonOptions.map((s) => `<option value="${s}"${selectedSeason === s ? ' selected' : ''}>${s}</option>`).join('')}
      </select>` : '<input type="hidden" id="cat-season" value="N/A" />'}
      <label class="catalog-label">Price (₱)</label>
      <input id="cat-rate" class="catalog-input" type="number" min="1" step="1" value="${row?.rate ?? ''}" placeholder="e.g. 500" />
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

async function openModal({ mode, kind, row = null }) {
  await ensureFacilityCatalogModalMounted();
  bindCatalogModalEvents();
  modalState = { mode, kind, row };
  setFeedback('');
  renderModalForm();
  showModal();
}

function readPayload() {
  const category = $('cat-category')?.value?.trim();
  const item = $('cat-item')?.value?.trim();
  const season = $('cat-season')?.value || 'N/A';
  const rate = Number($('cat-rate')?.value);
  const capMinEl = $('cat-cap-min');
  const capMaxEl = $('cat-cap-max');
  const capacity_min = capMinEl?.value ? Number(capMinEl.value) : null;
  const capacity_max = capMaxEl?.value ? Number(capMaxEl.value) : null;
  const audience = normalizeAudience($('cat-audience')?.value || activeCatalogAudience);
  const age_band = $('cat-age-band')?.value || 'Adult';
  const currency = $('cat-currency')?.value || 'PHP';
  const billing_unit = $('cat-billing-unit')?.value?.trim() || 'per item';
  const notes = $('cat-notes')?.value?.trim() || null;

  if (!category || !item || !rate || rate <= 0) {
    throw new Error('Please fill in all required fields with a valid price.');
  }

  return { category, item, season, rate, capacity_min, capacity_max, audience, age_band, currency, billing_unit, notes };
}

async function saveModal() {
  const btn = $('catalog-modal-save');
  btn.disabled = true;
  setFeedback('Saving…');

  try {
    const payload = readPayload();
    const { mode, kind, row } = modalState;

    if (mode === 'edit' && row?.id) {
      if (kind === 'meal') await updateMealRate(row.id, payload);
      else if (kind === 'extra') await updateExtraServiceRate(row.id, payload);
      else await updateFacilityRate(row.id, payload);
      setFeedback('Saved!', true);
    } else {
      if (kind === 'meal') await createMealRate(payload);
      else if (kind === 'extra') await createExtraServiceRate(payload);
      else await createFacilityRate(payload);
      setFeedback('Added!', true);
    }
    await onRefresh();
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
  const label = kind === 'meal'
    ? row.item
    : kind === 'extra'
      ? `${row.category} — ${row.item}`
      : `${row.category} — ${row.item}`;

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
  try {
    if (kind === 'meal') await deleteMealRate(row.id);
    else if (kind === 'extra') await deleteExtraServiceRate(row.id);
    else await deleteFacilityRate(row.id);
    await onRefresh();
    hideModal();
  } catch (err) {
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
      item: m.item,
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

function renderCatalogAudienceBars() {
  const mealsTabs = $('meals-audience-tabs');
  const mealHint = $('meals-audience-hint');

  renderPricingAudienceTabs(mealsTabs, {
    active: activeCatalogAudience,
    counts: countByAudience(catalogCache.meals, { pricedOnly: true }),
  });

  if (mealHint) mealHint.textContent = audienceTabHint(activeCatalogAudience);
}

function setCatalogAudience(audience) {
  const next = normalizeAudience(audience);
  if (next === activeCatalogAudience) return;
  activeCatalogAudience = next;
  renderMealsCatalog(catalogCache.meals);
}

function editBtn(kind, id) {
  return `<button type="button" class="catalog-edit-btn" data-catalog-edit="${kind}" data-id="${id}" aria-label="Edit this price">
    <span class="material-symbols-outlined text-[18px]">edit</span> Edit
  </button>`;
}

function applyEditModeClass(tab) {
  Object.entries(TAB_PANEL).forEach(([key, panelId]) => {
    $(panelId)?.classList.toggle('catalog-is-editing', catalogEditMode[key] && tab === key);
  });
}

export function toggleCatalogEditMode(ev) {
  const key = ev?.currentTarget?.getAttribute('data-catalog-for') || activeCatalogTab;
  if (!TAB_PANEL[key]) return;
  catalogEditMode[key] = !catalogEditMode[key];
  applyEditModeClass(key);
  updateCatalogToolbar(activeCatalogTab);
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
  catalogCache.meals = meals || [];
  renderCatalogAudienceBars();
  const mount = $('meals-grid-mount');
  if (!mount) return;

  const visible = filterByAudience(meals, activeCatalogAudience);

  if (!visible.length) {
    const label = escapeHtml(activeCatalogAudience);
    const hint = activeCatalogAudience === 'Guest'
      ? 'No meal prices yet. Use <strong>Add meal</strong> to get started.'
      : `No <strong>${label}</strong> meal prices yet. Use <strong>Add meal</strong> to add one for this category.`;
    mount.innerHTML = `<p class="fac-catalog-grid__empty">${hint}</p>`;
    return;
  }

  mount.innerHTML = visible.map((meal) => `
    <article class="fac-meal-card">
      <div class="fac-meal-card__icon">
        <span class="material-symbols-outlined">${escapeHtml(meal.icon || 'restaurant')}</span>
      </div>
      <h4 class="fac-meal-card__title">${escapeHtml(meal.item)}</h4>
      <p class="fac-meal-card__price">${peso(meal.rate)}</p>
      ${variantChips(meal)}
      ${editBtn('meal', meal.id)}
    </article>`).join('');
}

export function renderExtrasCatalog(services) {
  catalogCache.services = services || [];
  const mount = $('extras-grid-mount');
  if (!mount) return;

  const guestAudience = 'Guest';
  const cards = (services || []).map((group) => {
    const items = filterByAudience(group.items || [], guestAudience);
    if (!items.length) return '';

    const itemsHtml = items.map((item) => `
      <li class="catalog-price-row">
        <div class="min-w-0">
          <p class="catalog-price-row__label">${escapeHtml(item.item)}</p>
          ${item.season && item.season !== 'N/A' ? `<p class="catalog-price-row__season">${escapeHtml(item.season)}</p>` : ''}
          ${variantChips(item)}
        </div>
        <div class="catalog-price-row__meta">
          <p class="catalog-price-row__price">${peso(item.rate)}</p>
          ${editBtn('extra', item.id)}
        </div>
      </li>`).join('');

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
    return;
  }

  mount.innerHTML = cards.join('');
}

function updateCatalogToolbar(tab) {
  document.querySelectorAll('[data-catalog-edit-toggle]').forEach((editToggle) => {
    const panelTab = editToggle.getAttribute('data-catalog-for');
    if (!panelTab || !(panelTab in catalogEditMode)) return;

    const editing = catalogEditMode[panelTab];
    editToggle.innerHTML = editing
      ? '<span class="material-symbols-outlined text-[20px]">check</span> Done editing'
      : '<span class="material-symbols-outlined text-[20px]">edit</span> Edit prices';
    editToggle.classList.toggle('admin-crud-btn-primary', editing);
    editToggle.classList.toggle('admin-crud-btn-ghost', !editing);
    editToggle.setAttribute('aria-pressed', editing ? 'true' : 'false');
  });

  document.querySelectorAll('[data-catalog-edit-hint]').forEach((el) => {
    const panelTab = el.getAttribute('data-catalog-panel')
      || el.closest('[id^="fac-panel-"]')?.id?.replace('fac-panel-', '')
      || el.closest('[data-catalog-panel]')?.getAttribute('data-catalog-panel');
    if (!panelTab || panelTab === 'rooms') return;
    el.classList.toggle('hidden', !catalogEditMode[panelTab]);
  });
}

export function setCatalogToolbarTab(tab) {
  activeCatalogTab = tab;
  applyEditModeClass(tab);
  updateCatalogToolbar(tab);
}

export async function initFacilityCatalog({ refresh }) {
  onRefresh = refresh;
  await ensureFacilityCatalogModalMounted();
  bindCatalogModalEvents();

  if (catalogShellInitialized) return;
  catalogShellInitialized = true;

  document.querySelectorAll('[data-catalog-edit-toggle]').forEach((btn) => {
    btn.addEventListener('click', toggleCatalogEditMode);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isFacilityCatalogModalOpen()) hideModal();
  });

  document.body.addEventListener('click', (e) => {
    const edit = e.target.closest('[data-catalog-edit]');
    if (edit) {
      const kind = edit.getAttribute('data-catalog-edit');
      const row = resolveRow(kind, edit.getAttribute('data-id'));
      if (!row) return;
      openModal({ mode: 'edit', kind, row });
      return;
    }

    const add = e.target.closest('[data-catalog-add]');
    if (add) {
      e.preventDefault();
      openModal({ mode: 'add', kind: add.getAttribute('data-catalog-add') });
    }
  });

  bindPricingAudienceTabs($('meals-audience-tabs'), setCatalogAudience);
}
