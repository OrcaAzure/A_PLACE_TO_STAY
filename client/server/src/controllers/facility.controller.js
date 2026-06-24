import { pool } from '../config/db.js';

const SERVICE_CATEGORIES = new Set([
  'Food Service',
  'Laundry',
  'Laundry-Iron',
  'Corkage Fee',
  'Maid Service',
]);

const CATEGORY_ICONS = {
  Garden: 'park',
  'GMC Chapel': 'church',
  'Burdine Commons': 'groups',
  GMC: 'school',
  'Prayer Mountain': 'landscape',
  'Prayer Tower': 'water_lux',
  'Basketball Court': 'sports_basketball',
  'Childrens Playground': 'child_care',
  'Rec Center': 'fitness_center',
};

export const getVenueFacilities = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, category, item, season, rate, capacity_min, capacity_max
       FROM facilities
       ORDER BY category ASC, item ASC,
         FIELD(season, 'Regular', 'Peak', 'N/A') ASC`
    );

    const venues = [];
    const byCategory = new Map();

    for (const row of rows) {
      if (SERVICE_CATEGORIES.has(row.category)) continue;

      if (!byCategory.has(row.category)) {
        byCategory.set(row.category, {
          category: row.category,
          icon: CATEGORY_ICONS[row.category] || 'place',
          items: new Map(),
        });
      }

      const group = byCategory.get(row.category);
      const key = row.item;
      if (!group.items.has(key)) {
        group.items.set(key, {
          id: row.id,
          item: row.item,
          capacity_min: row.capacity_min,
          capacity_max: row.capacity_max,
          rates: [],
        });
      }
      group.items.get(key).rates.push({
        id: row.id,
        season: row.season,
        rate: Number(row.rate),
      });
    }

    for (const venue of byCategory.values()) {
      venues.push({
        category: venue.category,
        icon: venue.icon,
        items: [...venue.items.values()],
      });
    }

    res.status(200).json({ venues });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
