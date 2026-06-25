/**
 * Admin catalog editor — venues, meals, and extra services.
 * Per-item Edit buttons appear only after "Edit prices" is turned on.
 */

import {
  createFacilityRate,
  updateFacilityRate,
  deleteFacilityRate,
} from '/assets/js/services/api.js';

const MEAL_NAMES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
const EXTRA_CATEGORIES = [
  'Laundry',
  'Laundry-Iron',
  'Corkage Fee',
  'Maid Service',
  'Accommodation Extras',
];

const SEASONS = ['Regular', 'Peak', 'N/A'];

const TAB_PANEL = { venues: 'venue-prices-panel', meals: 'fac-panel-meals', extras: 'fac-panel-extras' };

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

let onRefresh = async () => {};
let modalState = { mode: 'edit', kind: 'venue', row: null };
let activeCatalogTab = 'rooms';
const catalogEditMode = { venues: false, meals: false, extras: false };
const catalogCache = { venues: [], meals: [], services: [] };

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
    `;
    return;
  }

  if (kind === 'extra') {
    const cat = row?.category || EXTRA_CATEGORIES[0];
    fields.innerHTML = `
      <label class="catalog-label">Service type</label>
      <select id="cat-category" class="catalog-input">
        ${EXTRA_CATEGORIES.map((c) => `<option value="${escapeHtml(c)}"${c === cat ? ' selected' : ''}>${escapeHtml(c)}</option>`).join('')}
      </select>
      <label class="catalog-label">Item name</label>
      <input id="cat-item" class="catalog-input" type="text" value="${escapeHtml(row?.item || '')}" placeholder="e.g. Extra Mattress" />
      <input type="hidden" id="cat-season" value="N/A" />
      <label class="catalog-label">Price (₱)</label>
      <input id="cat-rate" class="catalog-input" type="number" min="1" step="1" value="${row?.rate ?? ''}" placeholder="e.g. 500" />
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

function openModal({ mode, kind, row = null }) {
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

  if (!category || !item || !rate || rate <= 0) {
    throw new Error('Please fill in all required fields with a valid price.');
  }

  return { category, item, season, rate, capacity_min, capacity_max };
}

async function saveModal() {
  const btn = $('catalog-modal-save');
  btn.disabled = true;
  setFeedback('Saving…');

  try {
    const payload = readPayload();
    if (modalState.mode === 'edit' && modalState.row?.id) {
      await updateFacilityRate(modalState.row.id, payload);
      setFeedback('Saved!', true);
    } else {
      await createFacilityRate(payload);
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
  const label = `${modalState.row.category} — ${modalState.row.item}`;
  if (!window.confirm(`Remove this price?\n\n${label}\n\nThis cannot be undone.`)) return;

  const btn = $('catalog-modal-delete');
  btn.disabled = true;
  try {
    await deleteFacilityRate(modalState.row.id);
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
    return m ? { id: m.id, category: 'Food Service', item: m.item, season: 'N/A', rate: m.rate } : null;
  }
  if (kind === 'extra') {
    for (const group of catalogCache.services) {
      const item = group.items.find((x) => x.id === numId);
      if (item) {
        return { id: item.id, category: group.category, item: item.item, season: item.season, rate: item.rate };
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
          category: venue.category,
          item: item.item,
          season: rate.season,
          rate: rate.rate,
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

function applyEditModeClass(tab) {
  Object.entries(TAB_PANEL).forEach(([key, panelId]) => {
    $(panelId)?.classList.toggle('catalog-is-editing', catalogEditMode[key] && tab === key);
  });
}

export function toggleCatalogEditMode() {
  const key = activeCatalogTab;
  if (!TAB_PANEL[key]) return;
  catalogEditMode[key] = !catalogEditMode[key];
  applyEditModeClass(key);
  updateCatalogToolbar(key);
}

export function renderVenuesCatalog(venues) {
  catalogCache.venues = venues || [];
  const mount = $('venues-grid-mount');
  if (!mount) return;

  if (!venues?.length) {
    mount.innerHTML = '<p class="text-sm text-slate-400 col-span-full text-center py-8">No venues yet. Use <strong>Add venue</strong> to create your first price.</p>';
    return;
  }

  mount.innerHTML = venues.map((venue) => {
    const itemsHtml = venue.items.flatMap((item) =>
      item.rates.map((rate) => {
        const cap = item.capacity_max
          ? (item.capacity_min > 1 ? `${item.capacity_min}–${item.capacity_max} people` : `Up to ${item.capacity_max} people`)
          : '';
        return `
          <li class="catalog-price-row flex items-start justify-between gap-3 py-2.5 border-b border-slate-100 last:border-0">
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-slate-800">${escapeHtml(item.item)}</p>
              <p class="text-xs text-slate-500 mt-0.5">${escapeHtml(rate.season)}${cap ? ` · ${escapeHtml(cap)}` : ''}</p>
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
  const mount = $('meals-grid-mount');
  if (!mount) return;

  if (!meals?.length) {
    mount.innerHTML = '<p class="text-sm text-slate-400 col-span-full text-center py-8">No meal prices yet. Use <strong>Add meal</strong> to get started.</p>';
    return;
  }

  mount.innerHTML = meals.map((meal) => `
    <article class="meal-card catalog-meal-card">
      <div class="w-12 h-12 mx-auto rounded-full bg-slate-100 text-slate-600 flex items-center justify-center mb-3">
        <span class="material-symbols-outlined text-[28px]">${escapeHtml(meal.icon || 'restaurant')}</span>
      </div>
      <h4 class="text-base font-bold text-slate-800">${escapeHtml(meal.item)}</h4>
      <p class="text-2xl font-bold text-slate-900 mt-2">${peso(meal.rate)}</p>
      <p class="text-xs text-slate-400 mt-1 mb-3">per person</p>
      ${editBtn('meal', meal.id)}
    </article>`).join('');
}

export function renderExtrasCatalog(services) {
  catalogCache.services = services || [];
  const mount = $('extras-grid-mount');
  if (!mount) return;

  if (!services?.length) {
    mount.innerHTML = '<p class="text-sm text-slate-400 col-span-full text-center py-8">No extra services yet. Use <strong>Add extra</strong> for laundry, mattress, corkage, and other fees.</p>';
    return;
  }

  mount.innerHTML = services.map((group) => {
    const itemsHtml = group.items.map((item) => `
      <li class="catalog-price-row flex items-center justify-between gap-3 py-2.5 border-b border-slate-100 last:border-0">
        <p class="text-sm font-medium text-slate-800 min-w-0">${escapeHtml(item.item)}</p>
        <div class="flex items-center gap-3 shrink-0">
          <p class="text-sm font-bold text-slate-900">${peso(item.rate)}</p>
          ${editBtn('extra', item.id)}
        </div>
      </li>`).join('');

    return `
      <article class="venue-card">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
            <span class="material-symbols-outlined">${escapeHtml(group.icon || 'add_circle')}</span>
          </div>
          <h4 class="text-base font-bold text-slate-800">${escapeHtml(group.category)}</h4>
        </div>
        <ul>${itemsHtml}</ul>
      </article>`;
  }).join('');
}

function updateCatalogToolbar(tab) {
  const editToggle = document.querySelector('[data-catalog-edit-toggle]');
  const addVenue = document.querySelector('[data-catalog-add="venue"]');
  const addMeal = document.querySelector('[data-catalog-add="meal"]');
  const addExtra = document.querySelector('[data-catalog-add="extra"]');

  const isCatalog = ['venues', 'meals', 'extras'].includes(tab);

  editToggle?.classList.toggle('hidden', !isCatalog);
  if (editToggle && isCatalog) {
    const editing = catalogEditMode[tab];
    editToggle.innerHTML = editing
      ? '<span class="material-symbols-outlined text-[20px]">check</span> Done editing'
      : '<span class="material-symbols-outlined text-[20px]">edit</span> Edit prices';
    editToggle.classList.toggle('admin-crud-btn-primary', editing);
    editToggle.classList.toggle('admin-crud-btn-ghost', !editing);
    editToggle.setAttribute('aria-pressed', editing ? 'true' : 'false');
  }

  addVenue?.classList.toggle('hidden', tab !== 'venues');
  addMeal?.classList.toggle('hidden', tab !== 'meals');
  addExtra?.classList.toggle('hidden', tab !== 'extras');

  document.querySelectorAll('[data-catalog-edit-hint]').forEach((el) => {
    const panelTab = el.getAttribute('data-catalog-panel')
      || el.closest('[id^="fac-panel-"]')?.id?.replace('fac-panel-', '')
      || el.closest('[data-catalog-panel]')?.getAttribute('data-catalog-panel');
    if (!panelTab || panelTab === 'rooms') return;
    el.classList.toggle('hidden', !catalogEditMode[panelTab]);
  });

  if (typeof window.syncFacToolbar === 'function') window.syncFacToolbar();
}

export function setCatalogToolbarTab(tab) {
  activeCatalogTab = tab;
  applyEditModeClass(tab);
  updateCatalogToolbar(tab);
}

export function initFacilityCatalog({ refresh }) {
  onRefresh = refresh;

  $('catalog-modal-close')?.addEventListener('click', hideModal);
  $('catalog-modal-overlay')?.addEventListener('click', hideModal);
  $('catalog-modal-cancel')?.addEventListener('click', hideModal);
  $('catalog-modal-save')?.addEventListener('click', saveModal);
  $('catalog-modal-delete')?.addEventListener('click', deleteRow);

  document.querySelector('[data-catalog-edit-toggle]')?.addEventListener('click', toggleCatalogEditMode);

  $('catalog-modal')?.addEventListener('click', (e) => {
    if (e.target === $('catalog-modal')) hideModal();
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
      openModal({ mode: 'add', kind: add.getAttribute('data-catalog-add') });
    }
  });
}
