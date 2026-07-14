/**
 * Shared visual markup for admin & guest reservation wizards
 * (room cards, meal grids, confirm summaries).
 */

import { roomPreviewImage } from '/assets/js/features/facility-display.js';
import {
  escapeHtml,
  formatMoney,
  MEAL_MAX_QTY,
  clampMealQty,
  mealTypesOrdered,
  DORM_MIN_GUEST_COUNT,
  dormPriceLabel,
  availLabel,
  recommendationReason,
  calcMealsSubtotal,
} from '/assets/js/features/reservation-shared.js';

export const WIZARD_MEAL_META = {
  Breakfast: { icon: 'free_breakfast', tone: 'amber' },
  Lunch: { icon: 'lunch_dining', tone: 'orange' },
  Dinner: { icon: 'dinner_dining', tone: 'indigo' },
  Snack: { icon: 'cookie', tone: 'rose' },
};

export function mealMetaFor(type) {
  return WIZARD_MEAL_META[type] || { icon: 'restaurant', tone: 'slate' };
}

export function renderWizardMealGrid(meals, mealRates, { idPrefix = 'wiz' } = {}) {
  const cards = mealTypesOrdered(mealRates).map((type) => {
    const qty = clampMealQty(meals[type]);
    const price = Number(mealRates[type]) || 0;
    const meta = mealMetaFor(type);
    const inputId = `${idPrefix}-meal-qty-${String(type).toLowerCase().replace(/\s+/g, '-')}`;
    return `
      <article class="guest-meal-card guest-meal-card--${meta.tone}${qty > 0 ? ' is-active' : ''}" data-meal-type="${escapeHtml(type)}">
        <div class="guest-meal-card__icon" aria-hidden="true">
          <span class="material-symbols-outlined">${meta.icon}</span>
        </div>
        <div class="guest-meal-card__info">
          <strong>${escapeHtml(type)}</strong>
          <span>${formatMoney(price)} each</span>
        </div>
        <div class="guest-meal-card__qty">
          <label class="res-sr-only" for="${inputId}">${escapeHtml(type)} quantity</label>
          <input type="number" id="${inputId}" class="guest-meal-qty-input" data-meal-qty="${escapeHtml(type)}" min="0" max="${MEAL_MAX_QTY}" step="1" value="${qty}" inputmode="numeric" aria-label="${escapeHtml(type)} quantity" />
        </div>
        <p class="guest-meal-card__sub${qty > 0 ? '' : ' guest-meal-card__sub--empty'}" data-meal-sub="${escapeHtml(type)}">${qty > 0 ? formatMoney(price * qty) : ''}</p>
      </article>`;
  }).join('');

  return `
    <div class="guest-meals-grid wiz-meals-grid">
      ${cards}
    </div>
    <p class="wiz-meals-total">Meals subtotal: <strong data-meals-total>${formatMoney(calcMealsSubtotal(meals, mealRates))}</strong></p>`;
}

/** Compact meal rows for guest modify wizard — easier to scan than four narrow cards. */
export function renderGuestModifyMealList(meals, mealRates) {
  const rows = mealTypesOrdered(mealRates).map((type) => {
    const qty = clampMealQty(meals[type]);
    const price = Number(mealRates[type]) || 0;
    const meta = mealMetaFor(type);
    return `
      <div class="guest-modify-meal-row${qty > 0 ? ' is-active' : ''}" data-meal-type="${escapeHtml(type)}">
        <div class="guest-modify-meal-row__icon guest-modify-meal-row__icon--${meta.tone}" aria-hidden="true">
          <span class="material-symbols-outlined">${meta.icon}</span>
        </div>
        <div class="guest-modify-meal-row__info">
          <strong>${escapeHtml(type)}</strong>
          <span>${formatMoney(price)} each</span>
        </div>
        <div class="guest-modify-meal-row__qty">
          <button type="button" class="guest-modify-meal-row__btn" data-meal-minus="${escapeHtml(type)}" aria-label="Fewer ${escapeHtml(type)}">−</button>
          <input type="number" class="guest-meal-qty-input guest-modify-meal-row__input" data-meal-qty="${escapeHtml(type)}" min="0" max="${MEAL_MAX_QTY}" step="1" value="${qty}" inputmode="numeric" aria-label="${escapeHtml(type)} quantity" />
          <button type="button" class="guest-modify-meal-row__btn" data-meal-plus="${escapeHtml(type)}" aria-label="More ${escapeHtml(type)}">+</button>
        </div>
        <span class="guest-modify-meal-row__sub${qty > 0 ? '' : ' is-empty'}" data-meal-sub="${escapeHtml(type)}">${qty > 0 ? formatMoney(price * qty) : ''}</span>
      </div>`;
  }).join('');

  return `
    <div class="guest-modify-meals">
      ${rows}
      <div class="guest-modify-meals__total">
        <span>Meals subtotal</span>
        <strong data-meals-total>${formatMoney(calcMealsSubtotal(meals, mealRates))}</strong>
      </div>
    </div>`;
}

export function renderWizardRoomTypeFilter(types, current, {
  idPrefix = 'wiz',
  attr = 'data-wiz-room-type',
  title = 'Room type',
  allLabel = 'All types',
  clearLabel = 'Clear room type',
  buttonLabel = title,
} = {}) {
  if (!types.length) return '';
  const activeLabel = current
    ? (types.find(([key]) => key === current)?.[1] || current)
    : buttonLabel;
  const panelId = `${idPrefix}-room-type-filter-panel`;
  const toggleId = `${idPrefix}-room-type-filter-toggle`;
  const labelId = `${idPrefix}-room-type-filter-label`;

  return `
    <div class="fac-filter-wrap wiz-room-type-filter">
      <button type="button" id="${toggleId}" class="fac-filter-btn${current ? ' fac-filter-btn--active' : ''}" aria-expanded="false" aria-controls="${panelId}" aria-haspopup="true">
        <span class="material-symbols-outlined" aria-hidden="true">filter_list</span>
        <span id="${labelId}">${escapeHtml(activeLabel)}</span>
      </button>
      <div id="${panelId}" class="fac-filter-panel hidden" role="menu" aria-label="Filter by ${escapeHtml(title.toLowerCase())}">
        <p class="fac-filter-panel__title">${escapeHtml(title)}</p>
        <button type="button" class="fac-filter-option${!current ? ' is-active' : ''}" ${attr}="" role="menuitem">${escapeHtml(allLabel)}</button>
        ${types.map(([key, label]) => `
          <button type="button" class="fac-filter-option${current === key ? ' is-active' : ''}" ${attr}="${escapeHtml(key)}" role="menuitem">${escapeHtml(label)}</button>
        `).join('')}
        <button type="button" class="fac-filter-clear${current ? '' : ' hidden'}" data-wiz-room-type-clear role="menuitem">${escapeHtml(clearLabel)}</button>
      </div>
    </div>`;
}

let wizardRoomTypeFilterDocBound = false;

function resetFilterPanelStyle(panel) {
  panel.style.position = '';
  panel.style.top = '';
  panel.style.left = '';
  panel.style.right = '';
  panel.style.bottom = '';
  panel.style.zIndex = '';
  panel.style.minWidth = '';
  panel.style.width = '';
  panel.style.maxHeight = '';
  panel.style.overflowY = '';
  panel.style.overscrollBehavior = '';
}

function positionFilterPanel(toggle, panel) {
  const rect = toggle.getBoundingClientRect();
  const panelWidth = Math.max(panel.offsetWidth || 0, 224);
  const gap = 6;
  const edge = 8;
  let left = rect.right - panelWidth;
  left = Math.max(edge, Math.min(left, window.innerWidth - panelWidth - edge));

  const spaceBelow = window.innerHeight - rect.bottom - gap - edge;
  const spaceAbove = rect.top - gap - edge;
  const preferBelow = spaceBelow >= spaceAbove;
  const available = Math.max(preferBelow ? spaceBelow : spaceAbove, 0);
  const maxHeight = Math.min(available || 12 * 16, window.innerHeight * 0.7);

  panel.style.position = 'fixed';
  panel.style.left = `${left}px`;
  panel.style.right = 'auto';
  panel.style.zIndex = '320';
  panel.style.minWidth = '14rem';
  panel.style.width = `${panelWidth}px`;
  panel.style.maxHeight = `${maxHeight}px`;
  panel.style.overflowY = 'auto';
  panel.style.overscrollBehavior = 'contain';

  if (preferBelow) {
    panel.style.top = `${rect.bottom + gap}px`;
    panel.style.bottom = 'auto';
  } else {
    panel.style.top = 'auto';
    panel.style.bottom = `${window.innerHeight - rect.top + gap}px`;
  }
}

function restoreFilterPanel(panel) {
  const homeId = panel.dataset.filterHome;
  const home = homeId ? document.getElementById(homeId) : null;
  panel.classList.add('hidden');
  panel.classList.remove('wiz-room-type-filter-panel--portal');
  resetFilterPanelStyle(panel);
  if (home && panel.parentElement !== home) {
    home.appendChild(panel);
  } else if (!home && panel.parentElement === document.body) {
    panel.remove();
  }
  delete panel.dataset.filterHome;
}

export function closeAllWizardRoomTypePanels() {
  document.querySelectorAll('.wiz-room-type-filter-panel--portal').forEach(restoreFilterPanel);
  document.querySelectorAll('.wiz-room-type-filter .fac-filter-panel').forEach((panel) => {
    if (!panel.classList.contains('hidden')) restoreFilterPanel(panel);
    else {
      panel.classList.add('hidden');
      resetFilterPanelStyle(panel);
    }
  });
  document.querySelectorAll('.wiz-room-type-filter .fac-filter-btn').forEach((btn) => {
    btn.setAttribute('aria-expanded', 'false');
  });
}

function openFilterPanel(toggle, panel, wrap, idPrefix) {
  if (!wrap.id) wrap.id = `${idPrefix}-room-type-filter-home`;
  panel.dataset.filterHome = wrap.id;
  // Escape modal overflow/transform so the menu can scroll fully.
  document.body.appendChild(panel);
  panel.classList.add('wiz-room-type-filter-panel--portal');
  panel.classList.remove('hidden');
  positionFilterPanel(toggle, panel);
  toggle.setAttribute('aria-expanded', 'true');
}

/** Dropdown room-type filter — same pattern as Facilities / Guest Access. */
export function bindWizardRoomTypeFilter(container, { idPrefix, onChange }) {
  if (!container) return;
  const wrap = container.querySelector('.wiz-room-type-filter');
  if (!wrap) return;

  const toggle = wrap.querySelector(`#${idPrefix}-room-type-filter-toggle`);
  const panel = wrap.querySelector(`#${idPrefix}-room-type-filter-panel`)
    || document.querySelector(`#${idPrefix}-room-type-filter-panel`);
  if (!toggle || !panel) return;

  toggle.onclick = (e) => {
    e.stopPropagation();
    const isOpen = panel.classList.contains('wiz-room-type-filter-panel--portal')
      && !panel.classList.contains('hidden');
    closeAllWizardRoomTypePanels();
    if (!isOpen) openFilterPanel(toggle, panel, wrap, idPrefix);
  };

  const bindOptionClicks = () => {
    panel.querySelectorAll('[data-wiz-room-type]').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const value = btn.getAttribute('data-wiz-room-type') || '';
        closeAllWizardRoomTypePanels();
        onChange(value);
      };
    });
    const clearBtn = panel.querySelector('[data-wiz-room-type-clear]');
    if (clearBtn) {
      clearBtn.onclick = (e) => {
        e.stopPropagation();
        closeAllWizardRoomTypePanels();
        onChange('');
      };
    }
  };
  bindOptionClicks();

  if (!wizardRoomTypeFilterDocBound) {
    wizardRoomTypeFilterDocBound = true;
    document.addEventListener('click', (e) => {
      if (e.target.closest('.wiz-room-type-filter')) return;
      if (e.target.closest('.wiz-room-type-filter-panel--portal')) return;
      closeAllWizardRoomTypePanels();
    });
    window.addEventListener('resize', closeAllWizardRoomTypePanels);
    document.addEventListener('scroll', (e) => {
      if (!document.querySelector('.wiz-room-type-filter-panel--portal')) return;
      if (e.target?.closest?.('.wiz-room-type-filter-panel--portal')) return;
      closeAllWizardRoomTypePanels();
    }, true);
  }
}

export function syncWizardMealCards(root, meals, mealRates) {
  if (!root) return;
  mealTypesOrdered(mealRates).forEach((type) => {
    const qty = clampMealQty(meals[type]);
    const price = Number(mealRates[type]) || 0;
    const card = [...root.querySelectorAll('[data-meal-type]')].find((el) => el.getAttribute('data-meal-type') === type);
    card?.classList.toggle('is-active', qty > 0);
    const input = root.querySelector(`[data-meal-qty="${type}"]`);
    if (input) input.value = qty;
    const sub = root.querySelector(`[data-meal-sub="${type}"]`);
    if (sub) {
      sub.textContent = qty > 0 ? formatMoney(price * qty) : '';
      sub.classList.toggle('guest-meal-card__sub--empty', qty <= 0);
      sub.classList.toggle('is-empty', qty <= 0);
    }
  });
  const total = root.querySelector('[data-meals-total]');
  if (total) total.textContent = formatMoney(calcMealsSubtotal(meals, mealRates));
}

export function renderWizardRoomCard(room, {
  selected = false,
  guestCount = 1,
  recommended = false,
  bookable = true,
  visible = true,
} = {}) {
  const av = availLabel(room.availability_status);
  const dormMin = room.availability_status === 'dorm_min_guests';
  const img = roomPreviewImage({
    roomNumber: room.room_number,
    room_type: room.room_type,
    room_type_label: room.room_type_label,
    bed_count: room.bed_count,
  });
  const perPerson = dormPriceLabel(room, guestCount, room.nights);
  const capLabel = room.room_type === 'Dorm'
    ? `Min ${room.dorm_booking_minimum || DORM_MIN_GUEST_COUNT} pax · up to ${room.capacity_max} guests`
    : `${room.capacity_min}–${room.capacity_max} guests`;
  const topPick = recommended && room.recommendation_rank === 1;
  const building = room.building_name ? `${escapeHtml(room.building_name)} ` : '';

  const classes = [
    'wiz-room-option',
    selected ? 'is-selected' : '',
    dormMin ? 'is-dorm-min' : '',
    !bookable ? 'is-disabled' : '',
    recommended ? 'is-recommended' : '',
  ].filter(Boolean).join(' ');

  return `
    <button type="button" class="${classes} wiz-room-card--grid" data-room-id="${room.id}" aria-pressed="${selected ? 'true' : 'false'}" ${visible ? '' : 'disabled tabindex="-1"'}>
      <div class="wiz-room-option__media">
        <img src="${escapeHtml(img)}" alt="" loading="lazy" />
        ${selected ? '<span class="wiz-room-option__badge wiz-room-option__badge--selected">Selected</span>' : ''}
        ${!selected && topPick ? '<span class="wiz-room-option__badge">Top pick</span>' : ''}
        ${!selected && recommended && !topPick ? '<span class="wiz-room-option__badge wiz-room-option__badge--alt">Suggested</span>' : ''}
      </div>
      <div class="wiz-room-option__content">
        <div class="wiz-room-option__body">
          <div class="wiz-room-option__head">
            <p class="wiz-room-option__title">${building}Room ${escapeHtml(room.room_number)}</p>
            <span class="res-pill ${av.cls}">${av.text}</span>
          </div>
          <p class="wiz-room-option__meta">${escapeHtml(room.room_type_label || room.room_type)} · ${capLabel}</p>
          ${perPerson ? `<p class="wiz-room-option__hint">${escapeHtml(perPerson)}</p>` : ''}
          ${dormMin ? `<p class="wiz-room-option__warn">Minimum ${room.dorm_booking_minimum || DORM_MIN_GUEST_COUNT} guests required to book.</p>` : ''}
          ${!bookable && room.availability_status === 'booked' ? '<p class="wiz-room-option__warn">Already booked on these dates.</p>' : ''}
          ${recommended ? `<p class="wiz-room-option__reason">${escapeHtml(recommendationReason(room, guestCount))}</p>` : ''}
        </div>
        <div class="wiz-room-option__price">
          <p class="wiz-room-option__amount">${room.estimated_total != null ? formatMoney(room.estimated_total) : '—'}</p>
          ${room.nights ? `<p class="wiz-room-option__nights">${room.nights} night(s)</p>` : ''}
        </div>
      </div>
    </button>`;
}

export function renderWizardGroupRoomCard(room, { selected = false, guestCount = 1 } = {}) {
  const img = roomPreviewImage({
    roomNumber: room.room_number,
    room_type: room.room_type,
    room_type_label: room.room_type_label,
    bed_count: room.bed_count,
  });
  const building = room.building_name ? `${escapeHtml(room.building_name)} ` : '';

  return `
    <article class="wiz-group-room-card wiz-room-card--grid${selected ? ' is-selected' : ''}">
      <div class="wiz-room-option__media">
        <img src="${escapeHtml(img)}" alt="" loading="lazy" />
      </div>
      <div class="wiz-room-option__content">
        <div class="wiz-group-room-card__info">
          <p class="wiz-room-option__title">${building}Room ${escapeHtml(room.room_number)}</p>
          <p class="wiz-room-option__meta">${escapeHtml(room.room_type_label || room.room_type)} · Fits ${room.capacity_min}–${room.capacity_max} guests</p>
          ${room.estimated_total != null ? `<p class="wiz-group-room-card__price">${formatMoney(room.estimated_total)}</p>` : ''}
        </div>
        <div class="wiz-group-room-card__actions">
          <button type="button" class="res-btn ${selected ? 'res-btn--ghost' : 'res-btn--primary'}" data-room-toggle="${room.id}">
            ${selected ? 'Remove room' : 'Add room'}
          </button>
          ${selected ? `
          <div class="wiz-group-room-card__guests">
            <span class="res-label">Guests</span>
            <div class="res-qty">
              <button type="button" data-room-guest-minus="${room.id}" aria-label="Fewer guests">−</button>
              <span>${guestCount}</span>
              <button type="button" data-room-guest-plus="${room.id}" aria-label="More guests">+</button>
            </div>
          </div>` : ''}
        </div>
      </div>
    </article>`;
}

export function renderWizardConfirmCard(title, bodyHtml) {
  return `
    <section class="wiz-confirm-card">
      <h4 class="wiz-confirm-card__title">${escapeHtml(title)}</h4>
      <div class="wiz-confirm-card__body">${bodyHtml}</div>
    </section>`;
}

export function renderWizardPriceSummary({ lines = [], grandLabel = 'Grand total', grandTotal = 0 }) {
  const rows = lines.map(({ label, value }) => `
    <div class="guest-total-line">
      <span>${escapeHtml(label)}</span>
      <span>${typeof value === 'number' ? formatMoney(value) : value}</span>
    </div>`).join('');

  return `
    <div class="guest-total-breakdown wiz-confirm-summary">
      ${rows}
      <div class="guest-total-line guest-total-line--grand">
        <span>${escapeHtml(grandLabel)}</span>
        <span>${formatMoney(grandTotal)}</span>
      </div>
    </div>`;
}

export function renderGuestModifyRoomRow(room, { selected = false, guestCount = 1 } = {}) {
  const building = room.building_name ? `${escapeHtml(room.building_name)} ` : '';
  const cap = room.room_type === 'Dorm'
    ? `Up to ${room.capacity_max} guests`
    : `${room.capacity_min}–${room.capacity_max} guests`;
  return `
    <button type="button" class="guest-modify-room-row${selected ? ' is-selected' : ''}" data-room-id="${room.id}">
      <span class="guest-modify-room-row__radio" aria-hidden="true"></span>
      <span class="guest-modify-room-row__main">
        <strong>${building}Room ${escapeHtml(room.room_number)}</strong>
        <span>${escapeHtml(room.room_type_label || room.room_type)} · ${cap}</span>
      </span>
      <span class="guest-modify-room-row__price">${room.estimated_total != null ? formatMoney(room.estimated_total) : ''}</span>
    </button>`;
}

export function renderGuestModifyGroupRoomRow(room, { selected = false, guestCount = 1 } = {}) {
  const building = room.building_name ? `${escapeHtml(room.building_name)} ` : '';
  return `
    <div class="guest-modify-group-room${selected ? ' is-selected' : ''}">
      <div class="guest-modify-group-room__main">
        <strong>${building}Room ${escapeHtml(room.room_number)}</strong>
        <span>${escapeHtml(room.room_type_label || room.room_type)} · ${room.capacity_min}–${room.capacity_max} guests</span>
      </div>
      ${selected ? `
        <div class="guest-modify-group-room__qty" role="group" aria-label="Guests in this room">
          <button type="button" data-room-guest-minus="${room.id}" aria-label="Fewer guests">−</button>
          <span>${guestCount}</span>
          <button type="button" data-room-guest-plus="${room.id}" aria-label="More guests">+</button>
        </div>
        <button type="button" class="guest-modify-group-room__toggle" data-room-toggle="${room.id}">Remove</button>
      ` : `
        <button type="button" class="guest-modify-group-room__add" data-room-toggle="${room.id}">Add</button>
      `}
    </div>`;
}
