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
