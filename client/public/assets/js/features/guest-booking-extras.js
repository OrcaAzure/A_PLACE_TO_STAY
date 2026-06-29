/**
 * Visual meals & extra fees picker for guest room bookings.
 */

import { getMealRates, getFacilitiesOverview } from '/assets/js/services/api.js';
import {
  MEAL_TYPE_LIST,
  QUICK_FEES,
  servicesToQuickFees,
  calcMealsSubtotal,
  calcFeesSubtotal,
  calcGrandTotal,
  formatMoney,
} from '/assets/js/features/reservation-shared.js';

const MEAL_META = {
  Breakfast: { icon: 'free_breakfast', tone: 'amber' },
  Lunch: { icon: 'lunch_dining', tone: 'orange' },
  Dinner: { icon: 'dinner_dining', tone: 'indigo' },
  Snack: { icon: 'cookie', tone: 'rose' },
};

const FEE_ICONS = {
  'Extra Mattress': 'bed',
  'Extra Bed': 'single_bed',
  'Extra Chair': 'chair',
  'Cleaning Fee': 'cleaning_services',
  Laundry: 'local_laundry_service',
  Corkage: 'wine_bar',
};

function emptyMeals() {
  return { Breakfast: 0, Lunch: 0, Dinner: 0, Snack: 0 };
}

function feeIcon(name) {
  return FEE_ICONS[name] || 'add_circle';
}

export function createGuestBookingExtras({
  panelEl,
  mealsMount,
  feeChipsMount,
  selectedFeesMount,
  onChange = () => {},
} = {}) {
  let mealRates = { Breakfast: 175, Lunch: 225, Dinner: 225, Snack: 85 };
  let quickFees = [...QUICK_FEES];
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
    setRoomSelected(false);
    render();
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
    feeChipsMount.innerHTML = quickFees.map((f) => `
      <button type="button" class="guest-fee-chip" data-quick-fee="${f.name}" data-quick-amt="${f.amount}">
        <span class="material-symbols-outlined guest-fee-chip__icon" aria-hidden="true">${feeIcon(f.name)}</span>
        <span class="guest-fee-chip__label">${f.name}</span>
        <span class="guest-fee-chip__price">${formatMoney(f.amount)}</span>
      </button>`).join('');
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
      <p class="guest-selected-fees__label">Added extras</p>
      <div class="guest-selected-fees__list">
        ${fees.map((f, i) => `
          <div class="guest-fee-pill">
            <span class="material-symbols-outlined guest-fee-pill__icon" aria-hidden="true">${feeIcon(f.name)}</span>
            <span class="guest-fee-pill__name">${f.name}</span>
            <span class="guest-fee-pill__amt">${formatMoney(f.amount)}</span>
            <button type="button" class="guest-fee-pill__remove" data-fee-rm="${i}" aria-label="Remove ${f.name}">×</button>
          </div>`).join('')}
      </div>`;
  }

  function render() {
    renderMeals();
    renderFeeChips();
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
      const chip = e.target.closest('[data-quick-fee]');
      if (!chip) return;
      const name = chip.dataset.quickFee;
      const amount = Number(chip.dataset.quickAmt);
      if (!name || Number.isNaN(amount)) return;
      fees.push({ name, amount });
      render();
      onChange();
    });

    selectedFeesMount?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-fee-rm]');
      if (!btn) return;
      fees.splice(Number(btn.dataset.feeRm), 1);
      render();
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
      quickFees = servicesToQuickFees(catalog.services || []);
    } catch {
      quickFees = [...QUICK_FEES];
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
