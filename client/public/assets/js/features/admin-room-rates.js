/**
 * Admin Room Prices editor — organized by audience subtabs (Guest, Category 1–3).
 */

import { getRoomRatesCatalog, saveRoomRates } from '/assets/js/services/api.js';
import { confirmModal } from '/assets/js/layout/ui.js';
import {
  PRICING_AUDIENCE_TABS,
  normalizeAudience,
  rowAudience,
  filterByAudience,
  countByAudience,
  renderPricingAudienceTabs,
  bindPricingAudienceTabs,
  audienceTabHint,
} from '/assets/js/features/admin-pricing-audience.js';

const SEASONS = ['Regular', 'Peak', 'Super Peak'];

const ITEM_HINTS = {
  'Single/Double Occupancy': '1–2 guests per night',
  'Daily Maximum': 'Full room per night',
  'Per person per Night': 'Each dorm guest, per night',
};

let groups = [];
let editMode = false;
let activeAudience = 'Guest';
let initialized = false;

function $(id) {
  return document.getElementById(id);
}

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

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

function itemHint(item) {
  return ITEM_HINTS[item] || '';
}

function isDormGroup(group) {
  return group.room_type === 'Dorm';
}

function defaultVariant(audience = activeAudience) {
  return {
    audience: normalizeAudience(audience),
    age_band: 'Adult',
    currency: 'PHP',
    billing_unit: 'per night',
    notes: null,
  };
}

function scaffoldItemsForAudience(group, audience) {
  const key = normalizeAudience(audience);
  const existing = filterByAudience(group.items, key);
  if (existing.length) return existing;

  const guestItems = filterByAudience(group.items, 'Guest');
  if (guestItems.length) {
    return guestItems.map((g) => ({
      item: g.item,
      ...defaultVariant(key),
      cells: SEASONS.map((season) => ({ season, rate: null })),
    }));
  }

  if (isDormGroup(group)) {
    return [{
      item: 'Per person per Night',
      ...defaultVariant(key),
      cells: SEASONS.map((season) => ({ season, rate: null })),
    }];
  }

  return [{
    item: '',
    ...defaultVariant(key),
    cells: SEASONS.map((season) => ({ season, rate: null })),
  }];
}

function allRoomItems() {
  return groups.flatMap((g) => g.items || []);
}

function renderAudienceBar() {
  const tabs = $('room-rates-audience-tabs');
  const hint = $('room-rates-audience-hint');
  renderPricingAudienceTabs(tabs, {
    active: activeAudience,
    counts: countByAudience(allRoomItems(), { pricedOnly: true }),
  });
  if (hint) hint.textContent = audienceTabHint(activeAudience);
}

function renderRateCells(row, { editable = false } = {}) {
  return SEASONS.map((season) => {
    const cell = row.cells.find((c) => c.season === season) || { rate: null };
    if (editable) {
      return `
        <td class="fac-rate-cell">
          <input
            type="number" min="1" step="1" inputmode="numeric"
            class="fac-rate-input"
            data-season="${escapeAttr(season)}"
            value="${cell.rate ?? ''}"
            placeholder="—"
            aria-label="${escapeAttr(`${row.item || 'Price row'} · ${season}`)}"
          />
        </td>`;
    }
    return `<td class="fac-rate-cell">${cell.rate != null ? `<span class="fac-rate-price">${peso(cell.rate)}</span>` : '<span class="fac-rate-empty">—</span>'}</td>`;
  }).join('');
}

function renderRateRow(row, { editable = false, removable = false } = {}) {
  const hint = itemHint(row.item);

  if (editable && !isDormGroup({ room_type: row._roomType })) {
    return `
      <tr data-rate-row>
        <th scope="row" class="fac-rate-row-label">
          <div class="fac-rate-row-edit">
            <input
              type="text"
              class="fac-rate-item-input"
              value="${escapeAttr(row.item)}"
              maxlength="120"
              placeholder="Price row name"
              aria-label="Price row name"
            />
            ${removable ? `
              <button type="button" class="fac-rate-row-remove" data-remove-rate-row aria-label="Remove price row">
                <span class="material-symbols-outlined" aria-hidden="true">close</span>
              </button>` : ''}
          </div>
        </th>
        ${renderRateCells(row, { editable: true })}
      </tr>`;
  }

  return `
    <tr data-rate-row>
      <th scope="row" class="fac-rate-row-label">
        <span class="fac-rate-row-title">${escapeHtml(row.item)}</span>
        ${hint ? `<span class="fac-rate-row-sub">${escapeHtml(hint)}</span>` : ''}
      </th>
      ${renderRateCells(row, { editable })}
    </tr>`;
}

function renderCard(group) {
  const items = scaffoldItemsForAudience(group, activeAudience);
  const headCells = SEASONS.map((s) => `<th class="fac-rate-season">${escapeHtml(s)}</th>`).join('');
  const editable = editMode;
  const dorm = isDormGroup(group);

  const rows = items.map((row) => renderRateRow(
    { ...row, _roomType: group.room_type },
    { editable, removable: editable && !dorm && items.length > 1 },
  )).join('');

  const addRowBtn = editable && !dorm
    ? `<div class="fac-rate-card__footer">
        <button type="button" class="fac-rate-add-row" data-add-rate-row>
          <span class="material-symbols-outlined" aria-hidden="true">add</span>
          Add price row
        </button>
      </div>`
    : '';

  const emptyHint = !items.some((i) => i.cells?.some((c) => c.rate != null))
    && normalizeAudience(activeAudience) !== 'Guest'
    ? '<p class="fac-rate-card__empty-hint">No prices for this category yet — enter amounts below or copy row names from the Guest tab.</p>'
    : '';

  return `
    <article class="fac-rate-card" data-room-type="${escapeHtml(group.room_type)}">
      <div class="fac-rate-card__head">
        <div class="fac-rate-card__title-wrap">
          <span class="fac-rate-card__icon material-symbols-outlined" aria-hidden="true">${escapeHtml(group.icon || 'meeting_room')}</span>
          <h4 class="fac-rate-card__title">${escapeHtml(group.label)}</h4>
          ${group.custom ? '<span class="fac-rate-badge">Custom type</span>' : ''}
        </div>
        ${editable ? `
          <button type="button" class="res-btn res-btn--primary fac-rate-save" data-save-room-rate>
            <span class="material-symbols-outlined" aria-hidden="true">save</span> Save
          </button>` : ''}
      </div>
      ${emptyHint}
      <div class="fac-rate-table-wrap">
        <table class="fac-rate-table">
          <thead>
            <tr>
              <th class="fac-rate-corner">${editable && !dorm ? 'Price row' : ''}</th>
              ${headCells}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${addRowBtn}
      <p class="fac-rate-feedback hidden" data-rate-feedback></p>
    </article>`;
}

function captureAllCards() {
  document.querySelectorAll('.fac-rate-card[data-room-type]').forEach((card) => syncCardToGroups(card));
}

function syncCardToGroups(card) {
  const roomType = card.dataset.roomType;
  const group = groups.find((g) => g.room_type === roomType);
  if (!group) return;

  const edited = readRowsFromCard(card).map((row) => ({
    item: row.item,
    audience: normalizeAudience(activeAudience),
    age_band: 'Adult',
    currency: 'PHP',
    billing_unit: 'per night',
    notes: null,
    cells: row.rates.map((r) => ({ season: r.season, rate: r.rate })),
  }));

  const other = (group.items || []).filter((i) => rowAudience(i) !== normalizeAudience(activeAudience));
  group.items = [...other, ...edited];
}

function paint() {
  captureAllCards();
  renderAudienceBar();

  const mount = $('room-rates-grid-mount');
  if (!mount) return;

  if (!groups.length) {
    mount.innerHTML = '<p class="fac-catalog-grid__empty">No room types to price yet. Add a room type first under <strong>Manage rooms</strong>.</p>';
  } else {
    mount.innerHTML = groups.map(renderCard).join('');
  }
  updateToggle();
}

function updateToggle() {
  const btn = document.querySelector('[data-room-rates-edit-toggle]');
  if (btn) {
    btn.innerHTML = editMode
      ? '<span class="material-symbols-outlined" aria-hidden="true">check</span> Done editing'
      : '<span class="material-symbols-outlined" aria-hidden="true">edit</span> Edit prices';
    btn.setAttribute('aria-pressed', editMode ? 'true' : 'false');
    btn.classList.toggle('res-btn--primary', editMode);
  }
  $('room-rates-audience-tabs')?.classList.toggle('fac-pricing-subtabs--editing', editMode);
  document.querySelector('[data-room-rates-hint]')?.classList.toggle('hidden', !editMode);
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

function findCard(roomType) {
  const mount = $('room-rates-grid-mount');
  return [...(mount?.querySelectorAll('.fac-rate-card') || [])]
    .find((c) => c.dataset.roomType === roomType) || null;
}

function readRowsFromCard(card) {
  return [...card.querySelectorAll('[data-rate-row]')].map((rowEl) => {
    const itemInput = rowEl.querySelector('.fac-rate-item-input');
    const item = itemInput ? itemInput.value.trim() : rowEl.querySelector('.fac-rate-row-title')?.textContent?.trim() || '';
    const rates = SEASONS.map((season) => {
      const inp = rowEl.querySelector(`[data-season="${season}"]`);
      return {
        season,
        rate: inp && inp.value !== '' ? Number(inp.value) : null,
      };
    });
    return { item, rates };
  });
}

async function saveCard(card) {
  syncCardToGroups(card);
  const roomType = card.dataset.roomType;
  const group = groups.find((g) => g.room_type === roomType);
  const rows = filterByAudience(group?.items || [], activeAudience).map((item) => ({
    item: item.item,
    audience: normalizeAudience(activeAudience),
    age_band: item.age_band || 'Adult',
    currency: item.currency || 'PHP',
    billing_unit: item.billing_unit || 'per night',
    notes: item.notes || null,
    rates: item.cells.map((c) => ({ season: c.season, rate: c.rate })),
  }));

  const pricedRows = rows.filter((row) => row.rates.some((r) => r.rate != null));
  if (!pricedRows.length) {
    const label = card.querySelector('.fac-rate-card__title')?.textContent?.trim() || 'this room type';
    const confirmed = await confirmModal({
      title: 'Clear category prices',
      message: `Remove all <strong>${escapeHtml(activeAudience)}</strong> prices for <strong>${escapeHtml(label)}</strong>?`,
      confirmLabel: 'Clear prices',
      danger: true,
    });
    if (!confirmed) return;
  } else {
    const missingName = pricedRows.find((row) => !row.item);
    if (missingName) {
      setFeedback(card, 'Every price row needs a name.', false);
      return;
    }

    const duplicate = pricedRows.find((row, idx) => pricedRows.findIndex((r) => r.item === row.item) !== idx);
    if (duplicate) {
      setFeedback(card, `Duplicate price row: "${duplicate.item}".`, false);
      return;
    }

    const invalid = pricedRows.flatMap((row) => row.rates).find((r) => r.rate != null && !(r.rate > 0));
    if (invalid) {
      setFeedback(card, 'Prices must be greater than 0 (leave blank to skip).', false);
      return;
    }

    const label = card.querySelector('.fac-rate-card__title')?.textContent?.trim() || 'this room type';
    const saveNote = normalizeAudience(activeAudience) === 'Guest'
      ? 'This affects new bookings right away.'
      : 'Stored for this category only — not used in live bookings yet.';
    const confirmed = await confirmModal({
      title: 'Save room prices',
      message: `Save <strong>${escapeHtml(activeAudience)}</strong> prices for <strong>${escapeHtml(label)}</strong>? ${saveNote}`,
      confirmLabel: 'Save changes',
    });
    if (!confirmed) return;
  }

  const btn = card.querySelector('[data-save-room-rate]');
  if (btn) btn.disabled = true;
  setFeedback(card, 'Saving…', true);

  try {
    const res = await saveRoomRates({
      room_type: roomType,
      audience: normalizeAudience(activeAudience),
      rows: pricedRows,
    });
    groups = res.room_rates || groups;
    paint();
    setFeedback(findCard(roomType), 'Saved!', true);
  } catch (err) {
    setFeedback(card, err.message || 'Could not save prices.', false);
    if (btn) btn.disabled = false;
  }
}

function addRateRow(card) {
  const tbody = card.querySelector('.fac-rate-table tbody');
  if (!tbody) return;

  const emptyRow = {
    item: '',
    ...defaultVariant(activeAudience),
    cells: SEASONS.map((season) => ({ season, rate: null })),
    _roomType: card.dataset.roomType,
  };

  tbody.insertAdjacentHTML('beforeend', renderRateRow(emptyRow, { editable: true, removable: true }));

  const rows = tbody.querySelectorAll('[data-rate-row]');
  rows.forEach((rowEl) => {
    const removeBtn = rowEl.querySelector('[data-remove-rate-row]');
    if (removeBtn) removeBtn.hidden = rows.length <= 1;
  });

  tbody.lastElementChild?.querySelector('.fac-rate-item-input')?.focus();
}

function removeRateRow(card, rowEl) {
  const tbody = card.querySelector('.fac-rate-table tbody');
  if (!tbody || tbody.querySelectorAll('[data-rate-row]').length <= 1) return;

  const itemName = rowEl.querySelector('.fac-rate-item-input')?.value?.trim()
    || rowEl.querySelector('.fac-rate-row-title')?.textContent?.trim()
    || 'this price row';
  const roomLabel = card.querySelector('.fac-rate-card__title')?.textContent?.trim() || 'this room type';

  confirmModal({
    title: 'Remove price row',
    message: `Are you sure you want to remove <strong>${escapeHtml(itemName)}</strong> from ${escapeHtml(roomLabel)}?`,
    confirmLabel: 'Remove row',
    danger: true,
    elevate: true,
  }).then((confirmed) => {
    if (!confirmed) return;
    rowEl.remove();

    const rows = tbody.querySelectorAll('[data-rate-row]');
    rows.forEach((el) => {
      const removeBtn = el.querySelector('[data-remove-rate-row]');
      if (removeBtn) removeBtn.hidden = rows.length <= 1;
    });
  });
}

function setAudience(audience) {
  const next = normalizeAudience(audience);
  if (next === activeAudience) return;
  captureAllCards();
  activeAudience = next;
  paint();
}

function toggleEdit() {
  editMode = !editMode;
  if (!editMode) captureAllCards();
  paint();
}

async function reload() {
  try {
    groups = await getRoomRatesCatalog();
  } catch (err) {
    const mount = $('room-rates-grid-mount');
    if (mount) {
      mount.innerHTML = `<p class="fac-catalog-grid__empty">${escapeHtml(err.message || 'Failed to load room prices.')}</p>`;
    }
    return;
  }
  paint();
}

function initRoomRates() {
  if (initialized) return;
  initialized = true;

  bindPricingAudienceTabs($('room-rates-audience-tabs'), setAudience);

  document.body.addEventListener('click', (e) => {
    const toggle = e.target.closest('[data-room-rates-edit-toggle]');
    if (toggle) {
      toggleEdit();
      return;
    }

    const save = e.target.closest('[data-save-room-rate]');
    if (save) {
      const card = save.closest('.fac-rate-card');
      if (card) saveCard(card);
      return;
    }

    const add = e.target.closest('[data-add-rate-row]');
    if (add) {
      const card = add.closest('.fac-rate-card');
      if (card) addRateRow(card);
      return;
    }

    const remove = e.target.closest('[data-remove-rate-row]');
    if (remove) {
      const card = remove.closest('.fac-rate-card');
      const row = remove.closest('[data-rate-row]');
      if (card && row) removeRateRow(card, row);
    }
  });
}

export function renderRoomRatesCatalog(list) {
  groups = list || [];
  paint();
}

export async function bootstrapRoomRates() {
  editMode = false;
  activeAudience = 'Guest';
  initRoomRates();
  await reload();
}
