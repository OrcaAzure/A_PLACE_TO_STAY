/**
 * Admin "Venue prices" tab.
 *
 * The counterpart to "Room prices", but for venues. Each venue is one card; a
 * venue's bookable "uses" (Church, Wedding, Meeting…) are the rows, each with a
 * Regular and optional Peak price. Turn on "Edit" to add/rename/remove uses and
 * type prices, then Save that venue. Venue-level details (capacity, hours,
 * inclusions, policies) live in the "Manage venues" modal.
 *
 * A use with no Regular price is not bookable and is hidden from guests until
 * priced here.
 */

import { getAdminVenues, saveAdminVenue } from '/assets/js/services/api.js';
import { confirmModal } from '/assets/js/layout/ui.js';

const GUEST_AUDIENCE = 'Guest';
const GUEST_VARIANT = {
  audience: GUEST_AUDIENCE,
  age_band: 'Adult',
  currency: 'PHP',
  billing_unit: 'per segment',
  notes: '',
};

function rowAudience(row) {
  return String(row?.audience ?? GUEST_AUDIENCE).trim() || GUEST_AUDIENCE;
}

let venues = [];
/** @type {Map<string, object>} working copy keyed by venue.key */
let drafts = new Map();
let editMode = false;
let initialized = false;
let cid = 0;

function $(id) {
  return document.getElementById(id);
}

function peso(n) {
  if (n == null || n === '') return null;
  return `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 0 })}`;
}

function variantSummary() {
  return '';
}

function rateFor(fn, season) {
  const hit = (fn.rate_rows || []).find((r) => r.season === season && rowAudience(r) === GUEST_AUDIENCE);
  return hit?.rate ?? '';
}

function syncFnRates(fn, fields) {
  fn.rate_rows = fn.rate_rows || [];

  const upsert = (season, rate) => {
    const idx = fn.rate_rows.findIndex((r) => r.season === season && rowAudience(r) === GUEST_AUDIENCE);
    if (rate === '' || rate == null) {
      if (idx >= 0) fn.rate_rows.splice(idx, 1);
      return;
    }
    const row = {
      season,
      rate: Number(rate),
      ...GUEST_VARIANT,
    };
    if (idx >= 0) fn.rate_rows[idx] = { ...fn.rate_rows[idx], ...row };
    else fn.rate_rows.push(row);
  };

  upsert('Regular', fields.regular_rate);
  upsert('Peak', fields.peak_rate);
}

function decorateFn(fn) {
  return {
    ...fn,
    regular_rate: rateFor(fn, 'Regular'),
    peak_rate: rateFor(fn, 'Peak'),
    ...GUEST_VARIANT,
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ---------- drafts ---------- */

function buildDrafts() {
  drafts = new Map();
  for (const v of venues) {
    drafts.set(v.key, {
      key: v.key,
      name: v.name || '',
      facility_group: v.facility_group || '',
      room_code: v.room_code || '',
      description: v.description || '',
      capacity_min: v.capacity_min ?? '',
      capacity_max: v.capacity_max ?? '',
      min_hours: v.min_hours ?? '',
      hourly_rate: v.hourly_rate ?? '',
      inclusions: v.inclusions || '',
      policies: v.policies || '',
      icon: v.icon || 'stadium',
      functions: (v.functions || []).map((f) => ({
        facility_id: f.facility_id,
        function_name: f.function_name || '',
        rate_rows: (f.rates || []).map((r) => ({
          id: r.id,
          season: r.season,
          rate: r.rate,
          audience: GUEST_AUDIENCE,
          age_band: r.age_band,
          currency: r.currency,
          billing_unit: r.billing_unit,
          notes: r.notes,
        })),
        booking_count: f.booking_count || 0,
        _cid: `c${cid++}`,
      })),
      original_function_ids: (v.functions || []).map((f) => f.facility_id).filter(Boolean),
    });
  }
}

function blankFunction() {
  return {
    facility_id: null,
    function_name: '',
    rate_rows: [],
    booking_count: 0,
    _cid: `c${cid++}`,
  };
}

/** Read the live inputs from every card back into their drafts (before a re-render). */
function captureAllCards() {
  if (!editMode) return;
  const mount = $('venue-rates-grid-mount');
  if (!mount) return;
  mount.querySelectorAll('.fac-rate-card[data-venue-key]').forEach((card) => {
    const draft = drafts.get(card.getAttribute('data-venue-key'));
    if (!draft) return;
    card.querySelectorAll('[data-use-cid]').forEach((row) => {
      const fn = draft.functions.find((f) => f._cid === row.getAttribute('data-use-cid'));
      if (!fn) return;
      if (!row.querySelector('[data-use-field="regular_rate"]')) return;
      const fields = { function_name: fn.function_name };
      row.querySelectorAll('[data-use-field]').forEach((input) => {
        fields[input.getAttribute('data-use-field')] = input.value;
      });
      fn.function_name = fields.function_name;
      syncFnRates(fn, fields);
    });
  });
}

/* ---------- render ---------- */

function renderUseRow(draft, fnView) {
  const hasBookings = fnView.booking_count > 0;
  const single = draft.functions.length <= 1;
  const name = String(fnView.function_name || '').trim();
  const unpriced = fnView.regular_rate === '' || fnView.regular_rate == null;

  if (editMode) {
    return `
      <tr class="venue-rate-row${unpriced ? ' is-unpriced' : ''}" data-use-cid="${fnView._cid}">
        <td class="venue-rate-cell-name">
          <input type="text" class="fac-rate-input venue-rate-name-input" data-use-field="function_name"
            value="${escapeHtml(fnView.function_name)}" placeholder="${single ? 'Use name (optional)' : 'Use name'}" aria-label="Use name" />
        </td>
        <td class="fac-rate-cell">
          <input type="number" min="1" step="1" inputmode="numeric" class="fac-rate-input" data-use-field="regular_rate"
            value="${escapeHtml(fnView.regular_rate)}" placeholder="—" aria-label="Regular price" />
        </td>
        <td class="fac-rate-cell">
          <input type="number" min="1" step="1" inputmode="numeric" class="fac-rate-input" data-use-field="peak_rate"
            value="${escapeHtml(fnView.peak_rate)}" placeholder="—" aria-label="Peak price" />
        </td>
        <td class="venue-rate-cell-action">
          <button type="button" class="venue-rate-remove" data-remove-use="${fnView._cid}"
            aria-label="Remove this use" title="${hasBookings ? 'Has bookings — cannot remove' : 'Remove this use'}"
            ${single || hasBookings ? 'disabled' : ''}>
            <span class="material-symbols-outlined">delete</span>
          </button>
        </td>
      </tr>`;
  }

  const reg = peso(fnView.regular_rate);
  const peak = peso(fnView.peak_rate);
  return `
    <tr class="venue-rate-row${unpriced ? ' is-unpriced' : ''}" data-use-cid="${fnView._cid}">
      <th scope="row" class="fac-rate-row-label">
        <span class="fac-rate-row-title">${escapeHtml(name || 'Unnamed use')}</span>
        ${unpriced ? '<span class="venue-rate-flag">Set a price to make bookable</span>' : ''}
      </th>
      <td class="fac-rate-cell">${reg ? `<span class="fac-rate-price">${reg}</span>` : '<span class="fac-rate-empty">—</span>'}</td>
      <td class="fac-rate-cell">${peak ? `<span class="fac-rate-price">${peak}</span>` : '<span class="fac-rate-empty">—</span>'}</td>
    </tr>`;
}

function renderCard(draft) {
  const coded = Boolean(String(draft.room_code || '').trim());
  const headCols = editMode
    ? `<th class="fac-rate-row-label">Use</th><th class="fac-rate-season">Regular</th><th class="fac-rate-season">Peak</th><th class="venue-rate-cell-action"></th>`
    : `<th class="fac-rate-corner"></th><th class="fac-rate-season">Regular</th><th class="fac-rate-season">Peak</th>`;

  const rows = draft.functions.map((fn) => renderUseRow(draft, decorateFn(fn))).join('');

  return `
    <article class="fac-rate-card" data-venue-key="${escapeHtml(draft.key)}">
      <div class="fac-rate-card__head">
        <div class="fac-rate-card__title-wrap">
          <span class="fac-rate-card__icon material-symbols-outlined" aria-hidden="true">${escapeHtml(draft.icon)}</span>
          <div class="min-w-0">
            <h4 class="fac-rate-card__title">${escapeHtml(draft.name)}${coded ? ` · ${escapeHtml(draft.room_code)}` : ''}</h4>
            ${draft.facility_group ? `<span class="fac-rate-badge">${escapeHtml(draft.facility_group)}</span>` : ''}
          </div>
        </div>
        ${editMode ? `
          <button type="button" class="res-btn res-btn--primary fac-rate-save" data-save-venue-rate>
            <span class="material-symbols-outlined" aria-hidden="true">save</span> Save
          </button>` : ''}
      </div>
      <div class="fac-rate-table-wrap">
        <table class="fac-rate-table venue-rate-table">
          <thead><tr>${headCols}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${editMode ? `
        <div class="venue-rate-actions">
          <button type="button" class="venue-rate-add" data-add-use ${coded ? 'disabled title="A venue with a booking code can only have one use."' : ''}>
            <span class="material-symbols-outlined" aria-hidden="true">add</span> Add use
          </button>
          ${coded ? '<span class="venue-rate-hint">Coded venue — one use only.</span>' : ''}
        </div>` : ''}
      <p class="fac-rate-feedback hidden" data-rate-feedback></p>
    </article>`;
}

function paint() {
  const mount = $('venue-rates-grid-mount');
  if (!mount) return;

  if (!drafts.size) {
    mount.innerHTML = '<p class="fac-catalog-grid__empty">No venues yet. Add one under <strong>Venues → Manage venues</strong>.</p>';
  } else {
    mount.innerHTML = [...drafts.values()].map(renderCard).join('');
  }
  updateToggle();
}

function updateToggle() {
  const btn = document.querySelector('[data-venue-rates-edit-toggle]');
  if (btn) {
    btn.innerHTML = editMode
      ? '<span class="material-symbols-outlined" aria-hidden="true">check</span> Done editing'
      : '<span class="material-symbols-outlined" aria-hidden="true">edit</span> Edit uses &amp; prices';
    btn.setAttribute('aria-pressed', editMode ? 'true' : 'false');
    btn.classList.toggle('res-btn--primary', editMode);
  }
  document.querySelector('[data-venue-rates-hint]')?.classList.toggle('hidden', !editMode);
}

function findCard(key) {
  const mount = $('venue-rates-grid-mount');
  return [...(mount?.querySelectorAll('.fac-rate-card') || [])]
    .find((c) => c.dataset.venueKey === key) || null;
}

function setFeedback(card, msg, ok) {
  const el = card?.querySelector('[data-rate-feedback]');
  if (!el) return;
  if (!msg) {
    el.classList.add('hidden');
    el.textContent = '';
    return;
  }
  el.textContent = msg;
  el.className = `fac-rate-feedback ${ok ? 'fac-rate-feedback--ok' : 'fac-rate-feedback--error'}`;
}

/* ---------- actions ---------- */

function addUse(key) {
  captureAllCards();
  const draft = drafts.get(key);
  if (!draft) return;
  if (String(draft.room_code || '').trim()) return;
  draft.functions.push(blankFunction());
  paint();
}

async function removeUse(key, cidToRemove) {
  captureAllCards();
  const draft = drafts.get(key);
  if (!draft || draft.functions.length <= 1) return;
  const fn = draft.functions.find((f) => f._cid === cidToRemove);
  if (!fn || fn.booking_count > 0) return;

  const label = String(fn.function_name || '').trim() || 'this use';
  const confirmed = await confirmModal({
    title: 'Remove use',
    message: `Are you sure you want to remove <strong>${escapeHtml(label)}</strong> from ${escapeHtml(draft.name)}? Its price will be removed too.`,
    confirmLabel: 'Remove use',
    danger: true,
  });
  if (!confirmed) return;

  draft.functions = draft.functions.filter((f) => f._cid !== cidToRemove);
  paint();
}

function validate(draft) {
  const fns = draft.functions.map(decorateFn);
  if (!fns.length) return 'Add at least one use.';
  const names = fns.map((f) => String(f.function_name || '').trim());
  if (fns.length > 1) {
    if (names.some((n) => !n)) return 'Give every use a name (e.g. Wedding, Meeting).';
    const lower = names.map((n) => n.toLowerCase());
    if (new Set(lower).size !== lower.length) return 'Two uses have the same name.';
  }
  for (const f of fns) {
    if (f.regular_rate === '' || f.regular_rate == null) {
      return 'Set a Regular price for every use (or remove the use).';
    }
    if (!(Number(f.regular_rate) > 0)) return 'Regular price must be greater than 0.';
    if (f.peak_rate !== '' && f.peak_rate != null && !(Number(f.peak_rate) > 0)) {
      return 'Peak price must be greater than 0 (leave blank for none).';
    }
  }
  return null;
}

function payloadFor(draft) {
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
    inclusions: draft.inclusions,
    policies: draft.policies,
    audience: GUEST_AUDIENCE,
    functions: draft.functions.map(decorateFn).map((f) => ({
      facility_id: f.facility_id,
      function_name: f.function_name,
      regular_rate: f.regular_rate,
      peak_rate: f.peak_rate,
      audience: GUEST_AUDIENCE,
      age_band: f.age_band,
      currency: f.currency,
      billing_unit: f.billing_unit,
      notes: f.notes,
    })),
    removed_function_ids: removed,
  };
}

async function saveVenue(key) {
  captureAllCards();
  const draft = drafts.get(key);
  if (!draft) return;

  const card = findCard(key);
  const err = validate(draft);
  if (err) { setFeedback(card, err, false); return; }

  const confirmed = await confirmModal({
    title: 'Save venue prices',
    message: `Are you sure you want to save the uses and prices for <strong>${escapeHtml(draft.name)}</strong>? This affects new bookings right away.`,
    confirmLabel: 'Save changes',
  });
  if (!confirmed) return;

  const btn = card?.querySelector('[data-save-venue-rate]');
  if (btn) btn.disabled = true;
  setFeedback(card, 'Saving…', true);

  try {
    await saveAdminVenue(payloadFor(draft));
    await reload();
    setFeedback(findCard(key), 'Saved!', true);
    window.dispatchEvent(new CustomEvent('venues:changed', { detail: { source: 'venue-prices' } }));
  } catch (e) {
    setFeedback(findCard(key), e.message || 'Could not save prices.', false);
    const freshBtn = findCard(key)?.querySelector('[data-save-venue-rate]');
    if (freshBtn) freshBtn.disabled = false;
  }
}

function toggleEdit() {
  captureAllCards();
  editMode = !editMode;
  paint();
}

async function reload() {
  try {
    venues = await getAdminVenues();
    buildDrafts();
  } catch (err) {
    const mount = $('venue-rates-grid-mount');
    if (mount) {
      mount.innerHTML = `<p class="fac-catalog-grid__empty">${escapeHtml(err.message || 'Failed to load venue prices.')}</p>`;
    }
    return;
  }
  paint();
}

function init() {
  if (initialized) return;
  initialized = true;

  document.body.addEventListener('click', (e) => {
    if (e.target.closest('[data-venue-rates-edit-toggle]')) { toggleEdit(); return; }

    const card = e.target.closest('.fac-rate-card[data-venue-key]');
    if (!card) return;
    const key = card.getAttribute('data-venue-key');

    if (e.target.closest('[data-save-venue-rate]')) { saveVenue(key); return; }
    if (e.target.closest('[data-add-use]')) { addUse(key); return; }
    const rm = e.target.closest('[data-remove-use]');
    if (rm && !rm.disabled) { removeUse(key, rm.getAttribute('data-remove-use')); }
  });

  window.addEventListener('venues:changed', (e) => {
    if (e.detail?.source === 'venue-prices') return;
    reload();
  });
}

export async function bootstrapVenueRates() {
  editMode = false;
  init();
  await reload();
}
