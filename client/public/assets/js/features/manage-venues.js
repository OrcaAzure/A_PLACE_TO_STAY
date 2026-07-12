/**
 * Admin "Manage venues" modal — venue DETAILS only.
 *
 * A venue is one physical space (e.g. GMC Chapel). This modal manages the
 * space itself: name, category, capacity, minimum hours, extra-hour rate,
 * inclusions and policies. Its bookable "uses" (Church, Wedding…) and their
 * Regular/Peak prices are managed on the separate "Venue prices" tab.
 *
 * A brand-new venue is created with a single blank, un-priced use so it exists
 * as a facility row; the admin then names and prices it under Venue prices.
 * Un-priced uses stay hidden from guests until a price is set.
 */

import {
  getAdminVenues,
  saveAdminVenue,
  deleteAdminVenue,
} from '/assets/js/services/api.js';
import { confirmModal } from '/assets/js/layout/ui.js';

/** Sentinel value used by the category <select> to reveal the "new category" field. */
const ADD_CATEGORY_VALUE = '__add_category__';

let initialized = false;
let venues = [];
let selectedKey = null;
let draft = null;
let search = '';
let saving = false;
let cid = 0;

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

function peso(n) {
  if (n == null || n === '') return '—';
  return `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 0 })}`;
}

/* ---------- open / close ---------- */

function showModal() {
  $('manage-venues-overlay')?.classList.remove('hidden');
  $('manage-venues-modal')?.classList.remove('hidden');
  $('manage-venues-overlay')?.setAttribute('aria-hidden', 'false');
  $('manage-venues-modal')?.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function hideModal() {
  $('manage-venues-overlay')?.classList.add('hidden');
  $('manage-venues-modal')?.classList.add('hidden');
  $('manage-venues-overlay')?.setAttribute('aria-hidden', 'true');
  $('manage-venues-modal')?.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

export function isManageVenuesModalOpen() {
  return !$('manage-venues-modal')?.classList.contains('hidden');
}

export function closeManageVenuesModal() {
  if (isManageVenuesModalOpen()) hideModal();
}

function setLoading(on) {
  $('manage-venues-loading')?.classList.toggle('hidden', !on);
}

function setFeedback(msg, ok = false) {
  const el = $('manage-venues-feedback');
  if (!el) return;
  if (!msg) {
    el.classList.add('hidden');
    el.textContent = '';
    return;
  }
  el.textContent = msg;
  el.className = `text-body-sm mt-1 ${ok ? 'text-emerald-700' : 'text-rose-700'}`;
  el.classList.remove('hidden');
}

/* ---------- data ---------- */

async function reload({ keepSelection = true } = {}) {
  setLoading(true);
  try {
    venues = await getAdminVenues();
    if (keepSelection && selectedKey && venues.some((v) => v.key === selectedKey)) {
      selectVenue(selectedKey);
    } else if (venues.length) {
      selectVenue(venues[0].key);
    } else {
      startNew();
    }
    renderList();
  } catch (err) {
    const list = $('manage-venues-list');
    if (list) list.innerHTML = `<p class="p-3 text-body-sm text-rose-700">${escapeHtml(err.message || 'Could not load venues.')}</p>`;
  } finally {
    setLoading(false);
  }
}

function blankFunction() {
  return { facility_id: null, function_name: '', inclusions: '', policies: '', regular_rate: '', peak_rate: '', booking_count: 0, _cid: `c${cid++}` };
}

function draftFromVenue(v) {
  // Inclusions & policies are stored per use (facility row), so each use can have
  // its own. Uses & prices themselves are (re)named/priced on the Venue prices tab,
  // but we keep them on the draft so saving details never drops a use or its price.
  const functions = (v.functions || []).map((f) => ({
    facility_id: f.facility_id,
    function_name: f.function_name || '',
    inclusions: f.inclusions || '',
    policies: f.policies || '',
    regular_rate: f.regular_rate ?? '',
    peak_rate: f.peak_rate ?? '',
    booking_count: f.booking_count || 0,
    _cid: `c${cid++}`,
  }));
  return {
    key: v.key,
    name: v.name || '',
    facility_group: v.facility_group || '',
    addingCategory: false,
    newCategory: '',
    room_code: v.room_code || '',
    description: v.description || '',
    capacity_min: v.capacity_min ?? '',
    capacity_max: v.capacity_max ?? '',
    min_hours: v.min_hours ?? '',
    hourly_rate: v.hourly_rate ?? '',
    functions,
    activeUseCid: functions[0]?._cid || null,
    original_function_ids: (v.functions || []).map((f) => f.facility_id).filter(Boolean),
    isNew: false,
  };
}

function blankDraft() {
  const fn = blankFunction();
  return {
    key: '__new__',
    name: '',
    facility_group: '',
    addingCategory: false,
    newCategory: '',
    room_code: '',
    description: '',
    capacity_min: '',
    capacity_max: '',
    min_hours: '',
    hourly_rate: '',
    functions: [fn],
    activeUseCid: fn._cid,
    original_function_ids: [],
    isNew: true,
  };
}

function activeUse() {
  if (!draft?.functions?.length) return null;
  return draft.functions.find((f) => f._cid === draft.activeUseCid) || draft.functions[0];
}

/* ---------- list ---------- */

function venueMatchesSearch(v) {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  const hay = [v.name, v.facility_group, v.room_code, ...(v.functions || []).map((f) => f.function_name)]
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

function renderList() {
  const mount = $('manage-venues-list');
  const count = $('manage-venues-footer-count');
  if (!mount) return;

  const filtered = venues.filter(venueMatchesSearch);
  if (count) count.textContent = `Showing ${filtered.length} venue${filtered.length === 1 ? '' : 's'}`;

  const groups = new Map();
  for (const v of filtered) {
    const g = v.facility_group || 'Other';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(v);
  }

  const sections = [...groups.entries()].map(([group, list]) => {
    const items = list.map((v) => {
      const uses = (v.functions || []).length;
      const isSel = !draft?.isNew && v.key === selectedKey;
      const priced = (v.functions || []).filter((f) => f.regular_rate != null).length;
      const useHint = priced < uses
        ? `${uses} use${uses === 1 ? '' : 's'} · ${uses - priced} need pricing`
        : `${uses} use${uses === 1 ? '' : 's'}`;
      return `
        <button type="button" class="admin-crud-list-item ${isSel ? 'is-selected' : ''}" data-venue-key="${escapeHtml(v.key)}" role="option" aria-selected="${isSel}">
          <div class="flex items-start gap-2">
            <span class="material-symbols-outlined text-[20px] text-slate-400 mt-0.5">${escapeHtml(v.icon || 'stadium')}</span>
            <div class="min-w-0 flex-1">
              <p class="text-body-sm font-semibold text-on-surface truncate">${escapeHtml(v.name)}${v.room_code ? ` · ${escapeHtml(v.room_code)}` : ''}</p>
              <p class="text-body-sm text-on-surface-variant truncate">${escapeHtml(useHint)}</p>
            </div>
          </div>
        </button>`;
    }).join('');
    return `
      <div class="mb-3">
        <p class="px-1.5 pb-1.5 text-[0.7rem] font-bold uppercase tracking-wide text-slate-400">${escapeHtml(group)}</p>
        <div class="space-y-2">${items}</div>
      </div>`;
  }).join('');

  mount.innerHTML = sections || '<p class="p-3 text-body-sm text-on-surface-variant">No venues match your search.</p>';
}

/* ---------- detail form ---------- */

function selectVenue(key) {
  const v = venues.find((x) => x.key === key);
  if (!v) return;
  selectedKey = key;
  draft = draftFromVenue(v);
  setFeedback('');
  renderDetail();
  renderList();
  $('manage-venues-body')?.classList.add('is-mobile-form');
}

function startNew() {
  selectedKey = null;
  draft = blankDraft();
  setFeedback('');
  renderDetail();
  renderList();
  $('manage-venues-body')?.classList.add('is-mobile-form');
  requestAnimationFrame(() => $('mv-name')?.focus());
}

function onCategoryChange(value) {
  syncDraftFromForm();
  if (value === ADD_CATEGORY_VALUE) {
    draft.addingCategory = true;
    draft.newCategory = '';
    draft.facility_group = '';
  } else {
    draft.addingCategory = false;
    draft.facility_group = value;
  }
  renderDetail();
  if (draft.addingCategory) requestAnimationFrame(() => $('mv-group-new')?.focus());
}

function onUseChange(cid) {
  syncDraftFromForm();
  draft.activeUseCid = cid;
  renderDetail();
}

function categorySelectOptions() {
  const set = new Set(venues.map((v) => v.facility_group).filter(Boolean));
  const current = draft.facility_group;
  if (current && !draft.addingCategory) set.add(current);
  const list = [...set].sort((a, b) => String(a).localeCompare(String(b)));
  const opts = list.map((c) =>
    `<option value="${escapeHtml(c)}"${!draft.addingCategory && c === current ? ' selected' : ''}>${escapeHtml(c)}</option>`
  ).join('');
  const placeholderSelected = !draft.addingCategory && !current;
  return `
    <option value=""${placeholderSelected ? ' selected' : ''} disabled>Choose a category…</option>
    ${opts}
    <option value="${ADD_CATEGORY_VALUE}"${draft.addingCategory ? ' selected' : ''}>+ Add a new category…</option>`;
}

/** Dropdown to pick which use's inclusions/policies are being edited. */
function useSelectorHtml() {
  const fns = draft.functions || [];
  if (fns.length <= 1) {
    const name = fns[0]?.function_name?.trim();
    return `<p class="mf-field-hint mv-hint">${name
      ? `These apply to the <strong>${escapeHtml(name)}</strong> use.`
      : 'These apply to this venue\u2019s use.'}</p>`;
  }
  const opts = fns.map((f, i) => {
    const label = f.function_name?.trim() || `Use ${i + 1}`;
    return `<option value="${escapeHtml(f._cid)}"${f._cid === draft.activeUseCid ? ' selected' : ''}>${escapeHtml(label)}</option>`;
  }).join('');
  return `
    <div class="admin-crud-field span-full">
      <label for="mv-use-select">Which use are you editing?</label>
      <select id="mv-use-select">${opts}</select>
      <p class="mf-field-hint mv-hint">What's included and policies below apply only to this use. Rename or price uses under <strong>Venue prices</strong>.</p>
    </div>`;
}

function pricingNoteHtml() {
  if (draft.isNew) {
    return `
      <div class="mv-note mv-note--info">
        <span class="material-symbols-outlined">payments</span>
        <p>After you create this venue, set its booking uses and prices under the <strong>Venue prices</strong> tab. It stays hidden from guests until it has a price.</p>
      </div>`;
  }
  const uses = draft.functions.length;
  const unpriced = draft.functions.filter((f) => f.regular_rate === '' || f.regular_rate == null).length;
  const summary = unpriced > 0
    ? `${uses} use${uses === 1 ? '' : 's'} · ${unpriced} still need a price`
    : `${uses} use${uses === 1 ? '' : 's'} priced`;
  return `
    <div class="mv-note${unpriced > 0 ? ' mv-note--warn' : ''}">
      <span class="material-symbols-outlined">${unpriced > 0 ? 'error' : 'payments'}</span>
      <p>${escapeHtml(summary)}. Manage uses and prices under the <strong>Venue prices</strong> tab.</p>
    </div>`;
}

function renderDetail() {
  const mount = $('manage-venues-detail');
  if (!mount || !draft) return;

  const title = draft.isNew ? 'New venue' : (draft.name || 'Venue');
  const sub = draft.isNew ? 'Describe the space, then save.' : (draft.facility_group || '');
  const use = activeUse();

  mount.innerHTML = `
    <button type="button" id="mv-back" class="md:hidden inline-flex items-center gap-1 text-body-sm text-on-surface-variant mb-3">
      <span class="material-symbols-outlined text-[20px]">arrow_back</span> All venues
    </button>
    <div class="mf-detail-head">
      <div class="min-w-0">
        <p class="mf-detail-title truncate">${escapeHtml(title)}</p>
        ${sub ? `<p class="mf-detail-sub">${escapeHtml(sub)}</p>` : ''}
      </div>
      ${!draft.isNew ? `<button type="button" id="mv-delete" class="admin-crud-btn-danger shrink-0"><span class="material-symbols-outlined text-[20px]">delete</span> Delete</button>` : ''}
    </div>

    ${pricingNoteHtml()}

    <section class="mv-section">
      <p class="mv-section-title">Venue identity</p>
      <div class="admin-crud-form-grid mv-form">
        <div class="admin-crud-field span-full">
          <label for="mv-name">Venue name</label>
          <input id="mv-name" type="text" value="${escapeHtml(draft.name)}" placeholder="e.g. GMC Chapel" />
        </div>
        <div class="admin-crud-field">
          <label for="mv-group">Category</label>
          <select id="mv-group">${categorySelectOptions()}</select>
          ${draft.addingCategory ? `
            <input id="mv-group-new" type="text" class="mf-mt" value="${escapeHtml(draft.newCategory || '')}" placeholder="Name the new category (e.g. Recreation)" maxlength="100" autocomplete="off" />
            <p class="mf-field-hint mv-hint">It becomes a reusable category once you save.</p>` : ''}
        </div>
        <div class="admin-crud-field">
          <label for="mv-room-code">Booking code <span class="text-slate-400 font-normal">(optional)</span></label>
          <input id="mv-room-code" type="text" value="${escapeHtml(draft.room_code)}" placeholder="e.g. A-101" />
          <p class="mf-field-hint mv-hint">Only for spaces with a fixed staff code (like GMC conference rooms). A coded venue can only have one use.</p>
        </div>
        <div class="admin-crud-field span-full">
          <label for="mv-description">Description <span class="text-slate-400 font-normal">(optional)</span></label>
          <textarea id="mv-description" rows="2" placeholder="Short overview of the venue for guests.">${escapeHtml(draft.description)}</textarea>
        </div>
      </div>
    </section>

    <section class="mv-section">
      <p class="mv-section-title">Capacity &amp; booking rules</p>
      <div class="admin-crud-form-grid mv-form">
        <div class="admin-crud-field">
          <label for="mv-cap-min">Minimum capacity <span class="text-slate-400 font-normal">(optional)</span></label>
          <input id="mv-cap-min" type="number" min="1" step="1" value="${escapeHtml(draft.capacity_min)}" placeholder="e.g. 1" />
        </div>
        <div class="admin-crud-field">
          <label for="mv-cap-max">Maximum capacity <span class="text-slate-400 font-normal">(optional)</span></label>
          <input id="mv-cap-max" type="number" min="1" step="1" value="${escapeHtml(draft.capacity_max)}" placeholder="e.g. 100" />
        </div>
        <div class="admin-crud-field">
          <label for="mv-min-hours">Minimum booking hours <span class="text-slate-400 font-normal">(optional)</span></label>
          <input id="mv-min-hours" type="number" min="1" step="1" value="${escapeHtml(draft.min_hours)}" placeholder="e.g. 4" />
          <p class="mf-field-hint mv-hint">Set 4 for a 4-hour minimum. Leave blank to bill purely by the hour.</p>
        </div>
        <div class="admin-crud-field">
          <label for="mv-hourly-rate">Extra hour rate <span class="text-slate-400 font-normal">(optional)</span></label>
          <input id="mv-hourly-rate" type="number" min="0" step="1" value="${escapeHtml(draft.hourly_rate)}" placeholder="auto from base price" />
          <p class="mf-field-hint mv-hint">Charged for each hour beyond the minimum. Leave blank to split the base price evenly.</p>
        </div>
      </div>
    </section>

    <section class="mv-section">
      <p class="mv-section-title">Shown to guests</p>
      <p class="mf-field-hint mv-hint" style="margin-top:-0.35rem;margin-bottom:0.75rem">
        These texts appear in the guest browse details panel before they request a booking. If policies are empty, campus venue guidelines are shown automatically.
      </p>
      <div class="admin-crud-form-grid mv-form">
        ${useSelectorHtml()}
        <div class="admin-crud-field span-full">
          <label for="mv-inclusions">What's included</label>
          <textarea id="mv-inclusions" rows="3" placeholder="Equipment and inclusions, e.g. sound system, chairs, air-conditioning, parking…">${escapeHtml(use?.inclusions || '')}</textarea>
        </div>
        <div class="admin-crud-field span-full">
          <label for="mv-policies">Policies</label>
          <textarea id="mv-policies" rows="3" placeholder="House rules, setup/cleanup, cancellation notes…">${escapeHtml(use?.policies || '')}</textarea>
        </div>
      </div>
    </section>
  `;

  renderFooterActions();
}

function renderFooterActions() {
  const el = $('manage-venues-footer-actions');
  if (!el) return;
  el.innerHTML = `
    <button type="button" id="mv-cancel" class="admin-crud-btn-ghost">Close</button>
    <button type="button" id="mv-save" class="admin-crud-btn-primary">${draft?.isNew ? 'Create venue' : 'Save changes'}</button>
  `;
}

/* ---------- read form ---------- */

function syncDraftFromForm() {
  if (!draft) return;
  draft.name = $('mv-name')?.value ?? draft.name;

  // Category — either the dropdown selection or the "add new category" field.
  if (draft.addingCategory) {
    if ($('mv-group-new')) {
      draft.newCategory = $('mv-group-new').value;
      draft.facility_group = String(draft.newCategory || '').trim();
    }
  } else {
    const sel = $('mv-group');
    if (sel && sel.value !== ADD_CATEGORY_VALUE) draft.facility_group = sel.value;
  }

  draft.room_code = $('mv-room-code')?.value ?? draft.room_code;
  draft.description = $('mv-description')?.value ?? draft.description;
  draft.capacity_min = $('mv-cap-min')?.value ?? draft.capacity_min;
  draft.capacity_max = $('mv-cap-max')?.value ?? draft.capacity_max;
  draft.min_hours = $('mv-min-hours')?.value ?? draft.min_hours;
  draft.hourly_rate = $('mv-hourly-rate')?.value ?? draft.hourly_rate;

  // Inclusions/policies belong to the currently-selected use.
  const use = activeUse();
  if (use) {
    if ($('mv-inclusions')) use.inclusions = $('mv-inclusions').value;
    if ($('mv-policies')) use.policies = $('mv-policies').value;
  }
}

function buildPayload() {
  const removed = draft.original_function_ids.filter(
    (id) => !draft.functions.some((f) => Number(f.facility_id) === Number(id))
  );
  return {
    name: draft.name,
    facility_group: draft.facility_group,
    room_code: draft.room_code,
    description: draft.description,
    capacity_min: draft.capacity_min,
    capacity_max: draft.capacity_max,
    min_hours: draft.min_hours,
    hourly_rate: draft.hourly_rate,
    // Names/prices are edited on Venue prices; inclusions & policies are per use.
    functions: draft.functions.map((f) => ({
      facility_id: f.facility_id,
      function_name: f.function_name,
      inclusions: f.inclusions ?? '',
      policies: f.policies ?? '',
      regular_rate: f.regular_rate,
      peak_rate: f.peak_rate,
    })),
    removed_function_ids: removed,
  };
}

async function save() {
  if (saving) return;
  syncDraftFromForm();

  if (!String(draft.name).trim()) { setFeedback('Please enter a venue name.'); return; }
  if (!String(draft.facility_group).trim()) { setFeedback('Please enter a category.'); return; }

  const venueLabel = draft.name.trim() || 'this venue';
  const isNew = draft.isNew;
  const confirmed = await confirmModal({
    title: isNew ? 'Create venue' : 'Save changes',
    message: isNew
      ? `Are you sure you want to create the venue <strong>${escapeHtml(venueLabel)}</strong>? You'll set its uses and prices next under Venue prices.`
      : `Are you sure you want to save your changes to <strong>${escapeHtml(venueLabel)}</strong>?`,
    confirmLabel: isNew ? 'Create venue' : 'Save changes',
    elevate: true,
  });
  if (!confirmed) return;

  saving = true;
  setFeedback('Saving…');
  const btn = $('mv-save');
  if (btn) btn.disabled = true;

  try {
    const payload = buildPayload();
    const res = await saveAdminVenue(payload);
    venues = res.venues || venues;
    const match = venues.find((v) =>
      v.name === payload.name.trim()
      && v.facility_group === payload.facility_group.trim()
      && (v.room_code || '') === (payload.room_code || '').trim()
    );
    selectedKey = match ? match.key : selectedKey;
    if (match) {
      draft = draftFromVenue(match);
      renderDetail();
    }
    renderList();
    setFeedback('Saved.', true);
    window.dispatchEvent(new CustomEvent('venues:changed'));
  } catch (err) {
    setFeedback(err.message || 'Could not save venue.');
  } finally {
    saving = false;
    if ($('mv-save')) $('mv-save').disabled = false;
  }
}

async function removeVenue() {
  if (!draft || draft.isNew) return;
  const ids = draft.functions.map((f) => f.facility_id).filter(Boolean);
  if (!ids.length) return;

  const confirmed = await confirmModal({
    title: 'Delete venue',
    message: `Are you sure you want to delete <strong>${escapeHtml(draft.name)}</strong> and all of its uses? This cannot be undone.`,
    confirmLabel: 'Delete venue',
    danger: true,
    elevate: true,
  });
  if (!confirmed) return;

  setFeedback('Deleting…');
  setLoading(true);
  try {
    const res = await deleteAdminVenue(ids);
    venues = res.venues || [];
    selectedKey = null;
    if (venues.length) selectVenue(venues[0].key);
    else startNew();
    renderList();
    setFeedback('Venue deleted.', true);
    window.dispatchEvent(new CustomEvent('venues:changed'));
  } catch (err) {
    setFeedback(err.message || 'Could not delete venue.');
  } finally {
    setLoading(false);
  }
}

/* ---------- open ---------- */

async function open(detail = {}) {
  showModal();
  setFeedback('');
  if (detail.key) selectedKey = detail.key;
  await reload({ keepSelection: Boolean(detail.key) });
}

/* ---------- events ---------- */

export function initManageVenuesModal() {
  if (initialized) return;
  if (!$('manage-venues-modal')) return;
  initialized = true;

  $('manage-venues-close')?.addEventListener('click', hideModal);
  $('manage-venues-overlay')?.addEventListener('click', hideModal);
  $('manage-venues-new')?.addEventListener('click', startNew);

  const searchInput = $('manage-venues-search');
  searchInput?.addEventListener('input', (e) => {
    search = e.target.value || '';
    renderList();
  });

  $('manage-venues-list')?.addEventListener('click', (e) => {
    const item = e.target.closest('[data-venue-key]');
    if (item) selectVenue(item.getAttribute('data-venue-key'));
  });

  const detailEl = $('manage-venues-detail');
  detailEl?.addEventListener('click', (e) => {
    if (e.target.closest('#mv-delete')) { removeVenue(); return; }
    if (e.target.closest('#mv-back')) $('manage-venues-body')?.classList.remove('is-mobile-form');
  });

  detailEl?.addEventListener('change', (e) => {
    if (e.target.id === 'mv-group') { onCategoryChange(e.target.value); return; }
    if (e.target.id === 'mv-use-select') { onUseChange(e.target.value); }
  });

  $('manage-venues-footer-actions')?.addEventListener('click', (e) => {
    if (e.target.closest('#mv-save')) save();
    else if (e.target.closest('#mv-cancel')) hideModal();
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-manage-venues]')) {
      e.preventDefault();
      open();
    }
  });

  window.addEventListener('manage-venues:open', (e) => open(e.detail || {}));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isManageVenuesModalOpen()) hideModal();
  });
}
