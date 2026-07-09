import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcMealsTotal,
  calcMealsTotalWithUnitPrices,
  resolveMealUnitPricesForUpdate,
  mealUnitPriceMap,
} from '../../src/services/booking.service.js';

describe('booking meal price locking', () => {
  it('resolveMealUnitPricesForUpdate keeps stored prices for existing meal types', () => {
    const existing = [
      { meal_type: 'Breakfast', quantity: 2, unit_price: 150, subtotal: 300 },
      { meal_type: 'Lunch', quantity: 1, unit_price: 200, subtotal: 200 },
    ];
    const catalog = { Breakfast: 175, Lunch: 225, Dinner: 250 };
    const prices = resolveMealUnitPricesForUpdate(
      { Breakfast: 2, Lunch: 1, Dinner: 1 },
      catalog,
      existing,
    );
    assert.equal(prices.Breakfast, 150);
    assert.equal(prices.Lunch, 200);
    assert.equal(prices.Dinner, 250);
  });

  it('calcMealsTotalWithUnitPrices uses locked unit prices', () => {
    const total = calcMealsTotalWithUnitPrices(
      { Breakfast: 2, Dinner: 1 },
      { Breakfast: 150, Dinner: 250 },
    );
    assert.equal(total, 550);
  });

  it('calcMealsTotal uses current catalog when no lock map is provided', () => {
    const total = calcMealsTotal({ Breakfast: 2 }, { Breakfast: 175 });
    assert.equal(total, 350);
  });

  it('mealUnitPriceMap indexes stored rows by meal type', () => {
    const map = mealUnitPriceMap([
      { meal_type: 'Snack', unit_price: 75 },
    ]);
    assert.equal(map.Snack, 75);
  });
});
