/**
 * Internal pricing tiers for testing approval / admin booking flows.
 * Category 1 = 10% below Guest; Category 2 = 20% below Guest.
 */

import { pool } from '../../config/db.js';
import { tableExists } from '../helpers.js';

const CATEGORY_DISCOUNTS = {
  'Category 1': 0.9,
  'Category 2': 0.8,
};

function discount(rate, factor) {
  return Math.round(Number(rate) * factor * 100) / 100;
}

const GUEST_ROOM_RATES = [
  ['Superior Guest Room', 'Single/Double Occupancy', 'Regular', 2250],
  ['Superior Guest Room', 'Single/Double Occupancy', 'Peak', 2500],
  ['Superior Guest Room', 'Single/Double Occupancy', 'Super Peak', 2750],
  ['Superior Guest Room', 'Daily Maximum', 'Regular', 2800],
  ['Superior Guest Room', 'Daily Maximum', 'Peak', 3050],
  ['Superior Guest Room', 'Daily Maximum', 'Super Peak', 3400],

  ['Standard Apartment', 'Single/Double Occupancy', 'Regular', 2500],
  ['Standard Apartment', 'Single/Double Occupancy', 'Peak', 2700],
  ['Standard Apartment', 'Single/Double Occupancy', 'Super Peak', 3000],
  ['Standard Apartment', 'Daily Maximum', 'Regular', 3050],
  ['Standard Apartment', 'Daily Maximum', 'Peak', 3350],
  ['Standard Apartment', 'Daily Maximum', 'Super Peak', 3700],

  ['Deluxe 2 BR', 'Single/Double Occupancy', 'Regular', 3000],
  ['Deluxe 2 BR', 'Single/Double Occupancy', 'Peak', 3275],
  ['Deluxe 2 BR', 'Single/Double Occupancy', 'Super Peak', 3650],
  ['Deluxe 2 BR', 'Daily Maximum', 'Regular', 3750],
  ['Deluxe 2 BR', 'Daily Maximum', 'Peak', 4150],
  ['Deluxe 2 BR', 'Daily Maximum', 'Super Peak', 4500],

  ['Deluxe 3 BR', 'Single/Double Occupancy', 'Regular', 3600],
  ['Deluxe 3 BR', 'Single/Double Occupancy', 'Peak', 3650],
  ['Deluxe 3 BR', 'Single/Double Occupancy', 'Super Peak', 4450],
  ['Deluxe 3 BR', 'Daily Maximum', 'Regular', 4350],
  ['Deluxe 3 BR', 'Daily Maximum', 'Peak', 4750],
  ['Deluxe 3 BR', 'Daily Maximum', 'Super Peak', 5200],
];

const GUEST_MEAL_RATES = [
  ['Breakfast', 175],
  ['Lunch', 225],
  ['Dinner', 225],
  ['Snack', 85],
];

const GUEST_ACCOMMODATION_EXTRAS = [
  ['Per person per Night', 'Regular', 450],
  ['Per person per Night', 'Peak', 500],
  ['Per person per Night', 'Super Peak', 550],
  ['Extra Bed or Extra Person', 'Regular', 450],
  ['Extra Bed or Extra Person', 'Peak', 500],
  ['Extra Bed or Extra Person', 'Super Peak', 550],
];

async function upsertRoomRates(audience, factor) {
  for (const [roomType, item, season, guestRate] of GUEST_ROOM_RATES) {
    await pool.execute(
      `INSERT INTO rates_rooms (room_type, item, season, rate, audience)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE rate = VALUES(rate)`,
      [roomType, item, season, discount(guestRate, factor), audience],
    );
  }
}

async function upsertMealRates(audience, factor) {
  for (const [mealType, guestRate] of GUEST_MEAL_RATES) {
    await pool.execute(
      `INSERT INTO rates_meals (meal_type, rate, audience)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE rate = VALUES(rate)`,
      [mealType, discount(guestRate, factor), audience],
    );
  }
}

async function upsertAccommodationExtras(audience, factor) {
  for (const [item, season, guestRate] of GUEST_ACCOMMODATION_EXTRAS) {
    await pool.execute(
      `INSERT INTO rates_extra_services (category, item, season, rate, audience)
       VALUES ('Accommodation Extras', ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE rate = VALUES(rate)`,
      [item, season, discount(guestRate, factor), audience],
    );
  }
}

export async function seedPricingCategoryRates() {
  if (!(await tableExists('rates_rooms'))) return;

  for (const [audience, factor] of Object.entries(CATEGORY_DISCOUNTS)) {
    await upsertRoomRates(audience, factor);
    await upsertMealRates(audience, factor);
    await upsertAccommodationExtras(audience, factor);
  }

  console.log('[seed] Category 1 & 2 room, meal, and lodging-extra rates upserted');
}
