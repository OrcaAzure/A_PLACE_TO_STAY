/** Non-venue categories — legacy; meals/extras use rates_meals and rates_extra_services. */

export const MEAL_CATEGORY = 'Food Service';

export const EXTRA_SERVICE_CATEGORIES = [
  'Laundry',
  'Laundry-Iron',
  'Corkage Fee',
  'Maid Service',
  'Accommodation Extras',
];

export const NON_VENUE_CATEGORIES = [MEAL_CATEGORY, ...EXTRA_SERVICE_CATEGORIES];

export const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

export const DEFAULT_MEAL_RATES = {
  Breakfast: 175,
  Lunch: 225,
  Dinner: 225,
  Snack: 85,
};

export const MEAL_ICONS = {
  Breakfast: 'free_breakfast',
  Lunch: 'lunch_dining',
  Dinner: 'dinner_dining',
  Snack: 'cookie',
};

export const SERVICE_ICONS = {
  Laundry: 'local_laundry_service',
  'Laundry-Iron': 'iron',
  'Corkage Fee': 'restaurant',
  'Maid Service': 'cleaning_services',
  'Accommodation Extras': 'bed',
};

export const ACCOMMODATION_EXTRAS_CATEGORY = 'Accommodation Extras';

export const LODGING_EXTRA_ITEM = 'Extra Bed or Extra Person';

export const PER_PERSON_NIGHT_ITEM = 'Per person per Night';

/** Shared FY26 seasonal per-person lodging rates (dorm base + apartment overflow). */
export const DEFAULT_ACCOMMODATION_SEASONAL_RATES = {
  Regular: 450,
  Peak: 500,
  'Super Peak': 550,
};

/** @deprecated alias */
export const DEFAULT_LODGING_EXTRA_RATES = DEFAULT_ACCOMMODATION_SEASONAL_RATES;

export const ACCOMMODATION_SEASONAL_ITEMS = [PER_PERSON_NIGHT_ITEM, LODGING_EXTRA_ITEM];

export const EXTRA_SERVICE_SEASONS = ['Regular', 'Peak', 'Super Peak', 'N/A'];
