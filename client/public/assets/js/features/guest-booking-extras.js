/**
 * Visual meals & extra fees picker for guest room bookings.
 */

import { getMealRates, getFacilitiesOverview } from '/assets/js/services/api.js';
import {
  MEAL_TYPE_LIST,
  calcMealsSubtotal,
  calcFeesSubtotal,
  calcGrandTotal,
  formatMoney,
  escapeHtml,
} from '/assets/js/features/reservation-shared.js';

const MEAL_META = {
  Breakfast: { icon: 'free_breakfast', tone: 'amber' },
  Lunch: { icon: 'lunch_dining', tone: 'orange' },
  Dinner: { icon: 'dinner_dining', tone: 'indigo' },
  Snack: { icon: 'cookie', tone: 'rose' },
};

const LAUNDRY_CATEGORIES = new Set(['Laundry', 'Laundry-Iron']);
const LAUNDRY_GROUP_ID = 'laundry';

const GROUP_LABELS = {
  'Corkage Fee': 'Corkage',
  'Maid Service': 'Maid Service',
  'Accommodation Extras': 'Room extras',
};

const GROUP_ICONS = {
  [LAUNDRY_GROUP_ID]: 'local_laundry_service',
  Laundry: 'local_laundry_service',
  'Laundry-Iron': 'iron',
  'Corkage Fee': 'restaurant',
  'Maid Service': 'cleaning_services',
  'Accommodation Extras': 'bed',
};

const FEE_ICONS = {
  Laundry: 'local_laundry_service',
  Corkage: 'wine_bar',
};

function emptyMeals() {
  return { Breakfast: 0, Lunch: 0, Dinner: 0, Snack: 0 };
}

function feeIcon(name, category = '') {
  if (LAUNDRY_CATEGORIES.has(category)) return 'local_laundry_service';
  return FEE_ICONS[name] || GROUP_ICONS[category] || 'add_circle';
}

function groupLabel(category) {
  return GROUP_LABELS[category] || category;
}

/** Build top-level fee groups; laundry sub-items stay nested until expanded. */
function buildFeeGroups(services = []) {
  const topLevel = [];
  const laundryItems = [];

  for (const group of services || []) {
    const items = (group.items || []).map((item) => ({
      name: item.item,
      amount: Number(item.rate),
      category: group.category,
    }));

    if (LAUNDRY_CATEGORIES.has(group.category)) {
      laundryItems.push(...items);
      continue;
    }

    if (!items.length) continue;

    if (items.length === 1) {
      const item = items[0];
      const genericName = /^(per person|per load|each)$/i.test(String(item.name).trim());
      topLevel.push({
        id: group.category,
        label: genericName ? groupLabel(group.category) : item.name,
        icon: GROUP_ICONS[group.category] || feeIcon(item.name, group.category),
        type: 'single',
        item,
      });
    } else {
      topLevel.push({
        id: group.category,
        label: groupLabel(group.category),
        icon: GROUP_ICONS[group.category] || 'add_circle',
        type: 'expandable',
        items,
      });
    }
  }

  if (laundryItems.length) {
    topLevel.push({
      id: LAUNDRY_GROUP_ID,
      label: 'Laundry',
      icon: GROUP_ICONS[LAUNDRY_GROUP_ID],
      type: 'expandable',
      items: laundryItems,
    });
  }

  const singles = topLevel.filter((g) => g.type === 'single');
  const expandables = topLevel.filter((g) => g.type === 'expandable');
  return [...singles, ...expandables];
}

export function createGuestBookingExtras({
  panelEl,
  mealsMount,
  feeChipsMount,
  feeSubmenuMount,
  selectedFeesMount,
  onChange = () => {},
} = {}) {
  let mealRates = { Breakfast: 175, Lunch: 225, Dinner: 225, Snack: 85 };
  let feeGroups = [];
  let expandedGroupId = null;
  let meals = emptyMeals();
  let fees = [];
  let roomSelected = false;

  function mealsSubtotal() {
    return calcMealsSubtotal(meals, mealRates);
  }

  function feesSubtotal() {
    return calcFeesSubtotal(fees);
  }

  function grandTotal(roomTotal = 0) {
    return calcGrandTotal(roomTotal, meals, fees, mealRates);
  }

  function hasExtras() {
    return mealsSubtotal() > 0 || fees.length > 0;
  }

  function getPayload() {
    return {
      meals: { ...meals },
      fees: fees.map((f) => ({ fee_name: f.name, amount: f.amount })),
    };
  }

  function setRoomSelected(selected) {
    roomSelected = Boolean(selected);
    panelEl?.classList.toggle('hidden', !roomSelected);
  }

  function reset() {
    meals = emptyMeals();
    fees = [];
    expandedGroupId = null;
    setRoomSelected(false);
    render();
    onChange();
  }

  function addFee(item) {
    if (!item?.name || Number.isNaN(Number(item.amount))) return;
    fees.push({ name: item.name, amount: Number(item.amount), category: item.category || '' });
    renderSelectedFees();
    onChange();
  }

  function renderMeals() {
    if (!mealsMount) return;
    mealsMount.innerHTML = MEAL_TYPE_LIST.map((type) => {
      const qty = meals[type] || 0;
      const price = mealRates[type] || 0;
      const meta = MEAL_META[type] || { icon: 'restaurant', tone: 'slate' };
      return `
        <article class="guest-meal-card guest-meal-card--${meta.tone}${qty > 0 ? ' is-active' : ''}" data-meal-type="${type}">
          <div class="guest-meal-card__icon" aria-hidden="true">
            <span class="material-symbols-outlined">${meta.icon}</span>
          </div>
          <div class="guest-meal-card__info">
            <strong>${type}</strong>
            <span>${formatMoney(price)} each</span>
          </div>
          <div class="guest-meal-card__stepper">
            <button type="button" class="guest-meal-step" data-meal-minus="${type}" aria-label="Less ${type}" ${qty <= 0 ? 'disabled' : ''}>−</button>
            <span class="guest-meal-qty" aria-live="polite">${qty}</span>
            <button type="button" class="guest-meal-step" data-meal-plus="${type}" aria-label="More ${type}">+</button>
          </div>
          ${qty > 0 ? `<p class="guest-meal-card__sub">${formatMoney(price * qty)}</p>` : ''}
        </article>`;
    }).join('');
  }

  function renderFeeChips() {
    if (!feeChipsMount) return;
    if (!feeGroups.length) {
      feeChipsMount.innerHTML = '<p class="guest-service-empty text-body-sm text-on-surface-variant">No extra services are configured in the catalog yet.</p>';
      return;
    }
    feeChipsMount.innerHTML = feeGroups.map((group) => {
      const isExpanded = expandedGroupId === group.id;
      if (group.type === 'single') {
        const item = group.item;
        return `
          <button type="button" class="guest-service-card" data-quick-fee="${escapeHtml(item.name)}" data-quick-amt="${item.amount}" data-quick-category="${escapeHtml(item.category || '')}">
            <span class="guest-service-card__icon" aria-hidden="true">
              <span class="material-symbols-outlined">${group.icon}</span>
            </span>
            <span class="guest-service-card__body">
              <span class="guest-service-card__title">${escapeHtml(group.label)}</span>
              <span class="guest-service-card__price">${formatMoney(item.amount)}</span>
            </span>
            <span class="material-symbols-outlined guest-service-card__add" aria-hidden="true">add</span>
          </button>`;
      }
      return `
        <button type="button" class="guest-service-card guest-service-card--expandable${isExpanded ? ' is-open' : ''}" data-fee-group="${escapeHtml(group.id)}" aria-expanded="${isExpanded ? 'true' : 'false'}">
          <span class="guest-service-card__icon" aria-hidden="true">
            <span class="material-symbols-outlined">${group.icon}</span>
          </span>
          <span class="guest-service-card__body">
            <span class="guest-service-card__title">${escapeHtml(group.label)}</span>
            <span class="guest-service-card__hint">${isExpanded ? 'Tap to close' : 'View options'}</span>
          </span>
          <span class="material-symbols-outlined guest-service-card__chevron" aria-hidden="true">${isExpanded ? 'expand_less' : 'chevron_right'}</span>
        </button>`;
    }).join('');
  }

  function renderFeeSubmenu() {
    if (!feeSubmenuMount) return;
    const group = feeGroups.find((g) => g.id === expandedGroupId && g.type === 'expandable');
    if (!group?.items?.length) {
      feeSubmenuMount.innerHTML = '';
      feeSubmenuMount.classList.add('hidden');
      return;
    }

    feeSubmenuMount.classList.remove('hidden');

    const renderSection = (title, items) => {
      if (!items.length) return '';
      return `
        <div class="guest-service-drawer__section">
          ${title ? `<p class="guest-service-drawer__section-label">${title}</p>` : ''}
          <div class="guest-service-drawer__list">
            ${items.map((item) => renderSubmenuItem(item)).join('')}
          </div>
        </div>`;
    };

    if (group.id === LAUNDRY_GROUP_ID) {
      const wash = group.items.filter((i) => i.category === 'Laundry');
      const iron = group.items.filter((i) => i.category === 'Laundry-Iron');
      feeSubmenuMount.innerHTML = `
        <div class="guest-service-drawer__bar">
          <span class="guest-service-drawer__title">${escapeHtml(group.label)}</span>
          <button type="button" class="guest-service-drawer__done" data-fee-submenu-close>Done</button>
        </div>
        ${renderSection('Wash & dry', wash)}
        ${renderSection('Iron & press', iron)}`;
      return;
    }

    feeSubmenuMount.innerHTML = `
      <div class="guest-service-drawer__bar">
        <span class="guest-service-drawer__title">${escapeHtml(group.label)}</span>
        <button type="button" class="guest-service-drawer__done" data-fee-submenu-close>Done</button>
      </div>
      ${renderSection('', group.items)}`;
  }

  function renderSubmenuItem(item) {
    return `
      <button type="button" class="guest-service-row" data-quick-fee="${escapeHtml(item.name)}" data-quick-amt="${item.amount}" data-quick-category="${escapeHtml(item.category || '')}">
        <span class="guest-service-row__name">${escapeHtml(item.name)}</span>
        <span class="guest-service-row__price">${formatMoney(item.amount)}</span>
        <span class="material-symbols-outlined guest-service-row__add" aria-hidden="true">add</span>
      </button>`;
  }

  function renderSelectedFees() {
    if (!selectedFeesMount) return;
    if (!fees.length) {
      selectedFeesMount.innerHTML = '';
      selectedFeesMount.classList.add('hidden');
      return;
    }
    selectedFeesMount.classList.remove('hidden');
    selectedFeesMount.innerHTML = `
      <p class="guest-added-extras__label">Added extras <span class="guest-added-extras__count">${fees.length}</span></p>
      <ul class="guest-added-extras__list">
        ${fees.map((f, i) => `
          <li class="guest-added-extras__item">
            <span class="guest-added-extras__name">${escapeHtml(f.name)}</span>
            <span class="guest-added-extras__amt">${formatMoney(f.amount)}</span>
            <button type="button" class="guest-added-extras__remove" data-fee-rm="${i}" aria-label="Remove ${escapeHtml(f.name)}">
              <span class="material-symbols-outlined">close</span>
            </button>
          </li>`).join('')}
      </ul>`;
  }

  function render() {
    renderMeals();
    renderFeeChips();
    renderFeeSubmenu();
    renderSelectedFees();
  }

  function bind() {
    mealsMount?.addEventListener('click', (e) => {
      const plus = e.target.closest('[data-meal-plus]');
      const minus = e.target.closest('[data-meal-minus]');
      if (plus) {
        const type = plus.dataset.mealPlus;
        meals[type] = (meals[type] || 0) + 1;
        render();
        onChange();
        return;
      }
      if (minus) {
        const type = minus.dataset.mealMinus;
        meals[type] = Math.max(0, (meals[type] || 0) - 1);
        render();
        onChange();
      }
    });

    feeChipsMount?.addEventListener('click', (e) => {
      const groupBtn = e.target.closest('[data-fee-group]');
      if (groupBtn) {
        const id = groupBtn.dataset.feeGroup;
        expandedGroupId = expandedGroupId === id ? null : id;
        render();
        return;
      }

      const chip = e.target.closest('[data-quick-fee]');
      if (!chip) return;
      addFee({
        name: chip.dataset.quickFee,
        amount: Number(chip.dataset.quickAmt),
        category: chip.dataset.quickCategory || '',
      });
      renderSelectedFees();
      onChange();
    });

    feeSubmenuMount?.addEventListener('click', (e) => {
      if (e.target.closest('[data-fee-submenu-close]')) {
        expandedGroupId = null;
        render();
        return;
      }

      const itemBtn = e.target.closest('[data-quick-fee]');
      if (!itemBtn) return;
      addFee({
        name: itemBtn.dataset.quickFee,
        amount: Number(itemBtn.dataset.quickAmt),
        category: itemBtn.dataset.quickCategory || '',
      });
      renderSelectedFees();
      onChange();
    });

    selectedFeesMount?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-fee-rm]');
      if (!btn) return;
      fees.splice(Number(btn.dataset.feeRm), 1);
      renderSelectedFees();
      onChange();
    });
  }

  async function init() {
    try {
      const [rates, catalog] = await Promise.all([
        getMealRates(),
        getFacilitiesOverview().catch(() => ({ services: [] })),
      ]);
      mealRates = { ...mealRates, ...rates };
      feeGroups = buildFeeGroups(catalog.services || []);
    } catch {
      feeGroups = [];
    }
    render();
  }

  bind();

  return {
    init,
    reset,
    setRoomSelected,
    getPayload,
    grandTotal,
    mealsSubtotal,
    feesSubtotal,
    hasExtras,
    render,
  };
}
