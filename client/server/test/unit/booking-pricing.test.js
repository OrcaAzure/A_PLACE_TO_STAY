import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcMealsTotal,
  calcMealsTotalWithUnitPrices,
  resolveMealUnitPricesForUpdate,
  mealUnitPriceMap,
  calcFeesTotal,
  effectiveCapacityMin,
  validateGuestCapacity,
} from '../../src/services/booking.service.js';
import { deriveGroupRoomTotal } from '../../src/services/group.service.js';

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

describe('configured room capacity and group pricing', () => {
  it('uses each room capacity_min instead of a global dorm minimum', () => {
    for (const room of [
      { room_type: 'Dorm', capacity_min: 1, capacity_max: 2 },
      { room_type: 'Dorm', capacity_min: 2, capacity_max: 4 },
    ]) {
      assert.equal(effectiveCapacityMin(room), room.capacity_min);
      assert.equal(validateGuestCapacity(room, room.capacity_min), null);
    }
  });

  it('prices Dorm 202 at 40 guests × 5 nights × ₱450', () => {
    assert.equal(40 * 5 * 450, 90_000);
  });

  it('derives the same lodging total when the add-on-bearing room changes order', () => {
    const meals = [{ subtotal: 350_000 }];
    const fees = [{ amount: 25_000, quantity: 1 }];
    const dorm202Aggregate = { total_amount: 465_000 };
    const plainDorm202 = { total_amount: 90_000 };
    assert.equal(deriveGroupRoomTotal(dorm202Aggregate, meals, fees), 90_000);
    assert.equal(deriveGroupRoomTotal(plainDorm202, [], []), 90_000);
  });

  it('calculates fee amount by quantity', () => {
    assert.equal(calcFeesTotal([
      { amount: 500, quantity: 3 },
      { amount: 250, quantity: 2 },
    ]), 2_000);
  });
});
