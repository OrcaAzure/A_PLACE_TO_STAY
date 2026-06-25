/**
 * Admin catalog editor — venues, meals, and extra services (boomer-friendly).
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

function $(id) {
  return document.getElementById(id);
}

function showModal() {
  $('catalog-modal-overlay')?.classList.remove('hidden');
  $('catalog-modal')?.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function hideModal() {
  $('catalog-modal-overlay')?.classList.add('hidden');
  $('catalog-modal')?.classList.add('hidden');
  document.body.style.overflow = '';
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

  // venue
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
  $('cat-rate')?.focus();
}

function readPayload() {
  const category = $('cat-category')?.value?.trim();
  const item = $('cat-item')?.value?.trim();
  const season = $('cat-season')?.value || 'N/A';
  const rate = Number($('cat-rate')?.value);
  const capacity_min = $('cat-cap-min')?.value ? Number($('cat-cap-min').value) : null;
  const capacity_max = $('cat-cap-max')?.value ? Number($('cat-cap-max').value) : null;

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

function editBtn(row, kind) {
  return `<button type="button" class="catalog-edit-btn" data-catalog-edit="${kind}" data-id="${row.id}"
    data-category="${escapeHtml(row.category || '')}" data-item="${escapeHtml(row.item || '')}"
    data-season="${escapeHtml(row.season || 'N/A')}" data-rate="${row.rate ?? ''}"
    data-cap-min="${row.capacity_min ?? ''}" data-cap-max="${row.capacity_max ?? ''}">
    <span class="material-symbols-outlined text-[18px]">edit</span> Edit
  </button>`;
}

export function renderVenuesCatalog(venues) {
  const mount = $('venues-grid-mount');
  if (!mount) return;

  if (!venues?.length) {
    mount.innerHTML = '<p class="text-sm text-slate-400 col-span-full text-center py-8">No venues yet. Tap “Add Venue Price” to create one.</p>';
    return;
  }

  mount.innerHTML = venues.map((venue) => {
    const itemsHtml = venue.items.flatMap((item) =>
      item.rates.map((rate) => {
        const cap = item.capacity_max
          ? (item.capacity_min > 1 ? `${item.capacity_min}–${item.capacity_max} people` : `Up to ${item.capacity_max} people`)
          : '';
        const row = {
          id: rate.id,
          category: venue.category,
          item: item.item,
          season: rate.season,
          rate: rate.rate,
          capacity_min: item.capacity_min,
          capacity_max: item.capacity_max,
        };
        return `
          <li class="flex items-start justify-between gap-3 py-2.5 border-b border-slate-100 last:border-0">
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-slate-800">${escapeHtml(item.item)}</p>
              <p class="text-xs text-slate-500 mt-0.5">${escapeHtml(rate.season)}${cap ? ` · ${escapeHtml(cap)}` : ''}</p>
            </div>
            <div class="text-right shrink-0 flex flex-col items-end gap-1.5">
              <p class="text-sm font-bold text-slate-900">${peso(rate.rate)}</p>
              ${editBtn(row, 'venue')}
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
  const mount = $('meals-grid-mount');
  if (!mount) return;

  if (!meals?.length) {
    mount.innerHTML = '<p class="text-sm text-slate-400 col-span-full text-center py-8">No meal prices yet.</p>';
    return;
  }

  mount.innerHTML = meals.map((meal) => {
    const row = { id: meal.id, category: 'Food Service', item: meal.item, season: 'N/A', rate: meal.rate };
    return `
      <article class="meal-card catalog-meal-card">
        <div class="w-12 h-12 mx-auto rounded-full bg-slate-100 text-slate-600 flex items-center justify-center mb-3">
          <span class="material-symbols-outlined text-[28px]">${escapeHtml(meal.icon || 'restaurant')}</span>
        </div>
        <h4 class="text-base font-bold text-slate-800">${escapeHtml(meal.item)}</h4>
        <p class="text-2xl font-bold text-slate-900 mt-2">${peso(meal.rate)}</p>
        <p class="text-xs text-slate-400 mt-1 mb-3">per person</p>
        ${editBtn(row, 'meal')}
      </article>`;
  }).join('');
}

export function renderExtrasCatalog(services) {
  const mount = $('extras-grid-mount');
  if (!mount) return;

  if (!services?.length) {
    mount.innerHTML = '<p class="text-sm text-slate-400 col-span-full text-center py-8">No extra services yet. Add laundry, mattress, corkage, and other fees here.</p>';
    return;
  }

  mount.innerHTML = services.map((group) => {
    const itemsHtml = group.items.map((item) => {
      const row = { id: item.id, category: group.category, item: item.item, season: item.season, rate: item.rate };
      return `
        <li class="flex items-center justify-between gap-3 py-2.5 border-b border-slate-100 last:border-0">
          <p class="text-sm font-medium text-slate-800 min-w-0">${escapeHtml(item.item)}</p>
          <div class="flex items-center gap-3 shrink-0">
            <p class="text-sm font-bold text-slate-900">${peso(item.rate)}</p>
            ${editBtn(row, 'extra')}
          </div>
        </li>`;
    }).join('');

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

export function initFacilityCatalog({ refresh }) {
  onRefresh = refresh;

  $('catalog-modal-close')?.addEventListener('click', hideModal);
  $('catalog-modal-overlay')?.addEventListener('click', hideModal);
  $('catalog-modal-cancel')?.addEventListener('click', hideModal);
  $('catalog-modal-save')?.addEventListener('click', saveModal);
  $('catalog-modal-delete')?.addEventListener('click', deleteRow);

  document.body.addEventListener('click', (e) => {
    const edit = e.target.closest('[data-catalog-edit]');
    if (edit) {
      openModal({
        mode: 'edit',
        kind: edit.getAttribute('data-catalog-edit'),
        row: {
          id: Number(edit.getAttribute('data-id')),
          category: edit.getAttribute('data-category'),
          item: edit.getAttribute('data-item'),
          season: edit.getAttribute('data-season'),
          rate: Number(edit.getAttribute('data-rate')),
          capacity_min: edit.getAttribute('data-cap-min') || null,
          capacity_max: edit.getAttribute('data-cap-max') || null,
        },
      });
      return;
    }

    const add = e.target.closest('[data-catalog-add]');
    if (add) {
      openModal({ mode: 'add', kind: add.getAttribute('data-catalog-add') });
    }
  });
}

export function setCatalogToolbarTab(tab) {
  const roomsBtn = document.querySelector('[data-open-manage-facilities]');
  const addVenue = document.querySelector('[data-catalog-add="venue"]');
  const addMeal = document.querySelector('[data-catalog-add="meal"]');
  const addExtra = document.querySelector('[data-catalog-add="extra"]');

  roomsBtn?.classList.toggle('hidden', tab !== 'rooms');
  addVenue?.classList.toggle('hidden', tab !== 'venues');
  addMeal?.classList.toggle('hidden', tab !== 'meals');
  addExtra?.classList.toggle('hidden', tab !== 'extras');
}
