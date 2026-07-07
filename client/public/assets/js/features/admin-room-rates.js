/**
 * Admin Room Prices editor.
 * Shows one card per priceable room type with a season x rate-type matrix.
 * Turn on "Edit prices" to rename rows, add rows, type prices, then Save each card.
 */

import { getRoomRatesCatalog, saveRoomRates } from '/assets/js/services/api.js';
import { confirmModal } from '/assets/js/layout/ui.js';

const SEASONS = ['Regular', 'Peak', 'Super Peak'];

/** Friendly hints for common built-in row names. */
const ITEM_HINTS = {
  'Single/Double Occupancy': '1–2 guests per night',
  'Daily Maximum': 'Full room per night',
  'Per person per Night': 'Each dorm guest, per night',
};

let groups = [];
let editMode = false;
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
  const headCells = SEASONS.map((s) => `<th class="fac-rate-season">${escapeHtml(s)}</th>`).join('');
  const editable = editMode;
  const dorm = isDormGroup(group);

  const rows = group.items.map((row) => renderRateRow(
    { ...row, _roomType: group.room_type },
    { editable, removable: editable && !dorm && group.items.length > 1 },
  )).join('');

  const addRowBtn = editable && !dorm
    ? `<div class="fac-rate-card__footer">
        <button type="button" class="fac-rate-add-row" data-add-rate-row>
          <span class="material-symbols-outlined" aria-hidden="true">add</span>
          Add price row
        </button>
      </div>`
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

function paint() {
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
  const hint = document.querySelector('[data-room-rates-hint]');
  hint?.classList.toggle('hidden', !editMode);
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
  const roomType = card.dataset.roomType;
  const rows = readRowsFromCard(card);

  if (!rows.length) {
    setFeedback(card, 'Add at least one price row.', false);
    return;
  }

  const missingName = rows.find((row) => !row.item);
  if (missingName) {
    setFeedback(card, 'Every price row needs a name.', false);
    return;
  }

  const duplicate = rows.find((row, idx) => rows.findIndex((r) => r.item === row.item) !== idx);
  if (duplicate) {
    setFeedback(card, `Duplicate price row: "${duplicate.item}".`, false);
    return;
  }

  const invalid = rows.flatMap((row) => row.rates).find((r) => r.rate != null && !(r.rate > 0));
  if (invalid) {
    setFeedback(card, 'Prices must be greater than 0 (leave blank to skip).', false);
    return;
  }

  const emptyRow = rows.find((row) => row.rates.every((r) => r.rate == null));
  if (emptyRow) {
    setFeedback(card, `Add at least one price for "${emptyRow.item}", or remove the row.`, false);
    return;
  }

  const label = card.querySelector('.fac-rate-card__title')?.textContent?.trim() || 'this room type';
  const confirmed = await confirmModal({
    title: 'Save room prices',
    message: `Are you sure you want to save the prices for <strong>${escapeHtml(label)}</strong>? This affects new bookings right away.`,
    confirmLabel: 'Save changes',
  });
  if (!confirmed) return;

  const btn = card.querySelector('[data-save-room-rate]');
  if (btn) btn.disabled = true;
  setFeedback(card, 'Saving…', true);

  try {
    const res = await saveRoomRates({ room_type: roomType, rows });
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
  rowEl.remove();

  const rows = tbody.querySelectorAll('[data-rate-row]');
  rows.forEach((el) => {
    const removeBtn = el.querySelector('[data-remove-rate-row]');
    if (removeBtn) removeBtn.hidden = rows.length <= 1;
  });
}

function toggleEdit() {
  editMode = !editMode;
  if (!editMode) {
    paint();
    return;
  }
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
  initRoomRates();
  await reload();
}
