/**
 * Visual meals & extra fees picker for guest room bookings.
 */

import { getMealRates, getFacilitiesOverview } from '/assets/js/services/api.js';
import {
  calcMealsSubtotal,
  calcFeesSubtotal,
  calcGrandTotal,
  formatMoney,
  escapeHtml,
  clampMealQty,
  readMealQtyInput,
  MEAL_MAX_QTY,
  mealTypesOrdered,
  ensureMealsShape,
} from '/assets/js/features/reservation-shared.js';
import { getGuestSelfBookFeeCatalog, LAUNDRY_GROUP_ID } from '/assets/js/features/booking-fee-picker.js';

const MEAL_META = {
  Breakfast: { icon: 'free_breakfast', tone: 'amber' },
  Lunch: { icon: 'lunch_dining', tone: 'orange' },
  Dinner: { icon: 'dinner_dining', tone: 'indigo' },
  Snack: { icon: 'cookie', tone: 'rose' },
};

function emptyMeals(mealRates = {}) {
  return ensureMealsShape({}, mealRates);
}

export function createGuestBookingExtras({
  panelEl,
  mealsMount,
  feeChipsMount,
  feeSubmenuMount,
  selectedFeesMount,
  allergenInputId = 'booking-meal-allergens',
  onChange = () => {},
} = {}) {
  const feeServicesBlock = panelEl?.querySelector('[data-guest-extras-services]');
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
    const allergenEl = document.getElementById(allergenInputId);
    return {
      meals: { ...meals },
      fees: fees.map((f) => ({ fee_name: f.name, amount: f.amount })),
      meal_allergen_notes: allergenEl?.value?.trim() || undefined,
    };
  }

  function setRoomSelected(selected) {
    roomSelected = Boolean(selected);
    panelEl?.classList.toggle('hidden', !roomSelected);
  }

  function reset() {
    meals = emptyMeals(mealRates);
    fees = [];
    expandedGroupId = null;
    const allergenEl = document.getElementById(allergenInputId);
    if (allergenEl) allergenEl.value = '';
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
    mealsMount.innerHTML = mealTypesOrdered(mealRates).map((type) => {
      const qty = meals[type] || 0;
      const price = mealRates[type] || 0;
      const meta = MEAL_META[type] || { icon: 'restaurant', tone: 'slate' };
      return `
        <article class="guest-meal-card guest-meal-card--${meta.tone}${qty > 0 ? ' is-active' : ''}" data-meal-type="${type}">
          <div class="guest-meal-card__icon" aria-hidden="true">
            <span class="material-symbols-outlined">${meta.icon}</span>
          </div>
          <div class="guest-meal-card__info">
            <strong>${escapeHtml(type)}</strong>
            <span>${formatMoney(price)} each</span>
          </div>
          <div class="guest-meal-card__qty">
            <input type="number" class="guest-meal-qty-input" data-meal-qty="${type}" min="0" max="${MEAL_MAX_QTY}" step="1" value="${qty}" inputmode="numeric" aria-label="${type} quantity" />
          </div>
          ${qty > 0 ? `<p class="guest-meal-card__sub" data-meal-sub="${type}">${formatMoney(price * qty)}</p>` : `<p class="guest-meal-card__sub guest-meal-card__sub--empty" data-meal-sub="${type}"></p>`}
        </article>`;
    }).join('');
  }

  function renderFeeChips() {
    if (!feeChipsMount) return;
    feeServicesBlock?.classList.toggle('hidden', !feeGroups.length);
    if (!feeGroups.length) {
      feeChipsMount.innerHTML = '';
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
    const label = item.label || item.name;
    return `
      <button type="button" class="guest-service-row" data-quick-fee="${escapeHtml(item.name)}" data-quick-amt="${item.amount}" data-quick-category="${escapeHtml(item.category || '')}">
        <span class="guest-service-row__name">${escapeHtml(label)}</span>
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

  function syncMealSubtotals() {
    mealTypesOrdered(mealRates).forEach((type) => {
      const qty = clampMealQty(meals[type]);
      const sub = mealsMount?.querySelector(`[data-meal-sub="${type}"]`);
      if (!sub) return;
      const price = mealRates[type] || 0;
      if (qty > 0) {
        sub.textContent = formatMoney(price * qty);
        sub.classList.remove('guest-meal-card__sub--empty');
      } else {
        sub.textContent = '';
        sub.classList.add('guest-meal-card__sub--empty');
      }
      const card = mealsMount?.querySelector(`[data-meal-type="${type}"]`);
      card?.classList.toggle('is-active', qty > 0);
    });
  }

  function render() {
    renderMeals();
    renderFeeChips();
    renderFeeSubmenu();
    renderSelectedFees();
  }

  function bind() {
    mealsMount?.addEventListener('input', (e) => {
      const input = e.target.closest('[data-meal-qty]');
      if (!input) return;
      const type = input.dataset.mealQty;
      const raw = String(input.value ?? '').trim();
      // Keep typed digits intact; clamp only after blur.
      meals[type] = raw === '' ? 0 : readMealQtyInput(input);
      syncMealSubtotals();
      onChange();
    });

    mealsMount?.addEventListener('blur', (e) => {
      const input = e.target.closest('[data-meal-qty]');
      if (!input) return;
      const type = input.dataset.mealQty;
      meals[type] = readMealQtyInput(input);
      input.value = meals[type];
      syncMealSubtotals();
      onChange();
    }, true);

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

  function applyState({ meals: nextMeals, fees: nextFees, meal_allergen_notes } = {}) {
    if (nextMeals) meals = ensureMealsShape(nextMeals, mealRates);
    if (Array.isArray(nextFees)) {
      fees = nextFees.map((f) => ({
        name: f.fee_name || f.name,
        amount: Number(f.amount),
        category: f.category || '',
      })).filter((f) => f.name && !Number.isNaN(f.amount));
    }
    const allergenEl = document.getElementById(allergenInputId);
    if (allergenEl) allergenEl.value = meal_allergen_notes || '';
    render();
    onChange();
  }

  async function init() {
    try {
      const [rates, catalog] = await Promise.all([
        getMealRates(),
        getFacilitiesOverview({ fresh: true }).catch(() => ({ services: [] })),
      ]);
      mealRates = { ...mealRates, ...rates };
      meals = ensureMealsShape(meals, mealRates);
      feeGroups = getGuestSelfBookFeeCatalog(catalog.services || []).feeGroups;
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
    applyState,
    getPayload,
    grandTotal,
    mealsSubtotal,
    feesSubtotal,
    hasExtras,
    render,
  };
}
