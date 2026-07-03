/**
 * Admin Room Prices editor.
 * Shows one card per priceable room type with a season x rate-type matrix.
 * Turn on "Edit prices" to type new prices, then Save each card.
 */

import { getRoomRatesCatalog, saveRoomRates } from '/assets/js/services/api.js';
import { confirmModal } from '/assets/js/layout/ui.js';

const SEASONS = ['Regular', 'Peak', 'Super Peak'];

/** Friendly, shorter labels for the rate types. */
const ITEM_LABELS = {
  'Single/Double Occupancy': { title: 'Single / Double', sub: '1–2 guests per night' },
  'Daily Maximum': { title: 'Daily Maximum', sub: 'Full room per night' },
  'Per person per Night': { title: 'Per person / night', sub: 'Each dorm guest, per night' },
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

function itemMeta(item) {
  return ITEM_LABELS[item] || { title: item, sub: '' };
}

function renderCard(group) {
  const headCells = SEASONS.map((s) => `<th class="fac-rate-season">${escapeHtml(s)}</th>`).join('');

  const rows = group.items.map((row) => {
    const meta = itemMeta(row.item);
    const cells = SEASONS.map((season) => {
      const cell = row.cells.find((c) => c.season === season) || { rate: null };
      if (editMode) {
        return `
          <td class="fac-rate-cell">
            <input
              type="number" min="1" step="1" inputmode="numeric"
              class="fac-rate-input"
              data-item="${escapeHtml(row.item)}"
              data-season="${escapeHtml(season)}"
              value="${cell.rate ?? ''}"
              placeholder="—"
              aria-label="${escapeHtml(`${meta.title} · ${season} price`)}"
            />
          </td>`;
      }
      return `<td class="fac-rate-cell">${cell.rate != null ? `<span class="fac-rate-price">${peso(cell.rate)}</span>` : '<span class="fac-rate-empty">—</span>'}</td>`;
    }).join('');

    return `
      <tr>
        <th scope="row" class="fac-rate-row-label">
          <span class="fac-rate-row-title">${escapeHtml(meta.title)}</span>
          ${meta.sub ? `<span class="fac-rate-row-sub">${escapeHtml(meta.sub)}</span>` : ''}
        </th>
        ${cells}
      </tr>`;
  }).join('');

  return `
    <article class="fac-rate-card" data-room-type="${escapeHtml(group.room_type)}">
      <div class="fac-rate-card__head">
        <div class="fac-rate-card__title-wrap">
          <span class="fac-rate-card__icon material-symbols-outlined" aria-hidden="true">${escapeHtml(group.icon || 'meeting_room')}</span>
          <h4 class="fac-rate-card__title">${escapeHtml(group.label)}</h4>
          ${group.custom ? '<span class="fac-rate-badge">Custom type</span>' : ''}
        </div>
        ${editMode ? `
          <button type="button" class="res-btn res-btn--primary fac-rate-save" data-save-room-rate>
            <span class="material-symbols-outlined" aria-hidden="true">save</span> Save
          </button>` : ''}
      </div>
      <div class="fac-rate-table-wrap">
        <table class="fac-rate-table">
          <thead><tr><th class="fac-rate-corner"></th>${headCells}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
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

async function saveCard(card) {
  const roomType = card.dataset.roomType;
  const inputs = [...card.querySelectorAll('.fac-rate-input')];
  const rates = inputs.map((inp) => ({
    item: inp.dataset.item,
    season: inp.dataset.season,
    rate: inp.value === '' ? null : Number(inp.value),
  }));

  const invalid = rates.find((r) => r.rate != null && !(r.rate > 0));
  if (invalid) {
    setFeedback(card, 'Prices must be greater than 0 (leave blank to remove).', false);
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
    const res = await saveRoomRates({ room_type: roomType, rates });
    groups = res.room_rates || groups;
    paint();
    setFeedback(findCard(roomType), 'Saved!', true);
  } catch (err) {
    setFeedback(card, err.message || 'Could not save prices.', false);
    if (btn) btn.disabled = false;
  }
}

function toggleEdit() {
  editMode = !editMode;
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
