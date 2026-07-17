import { pool } from '../../config/db.js';
import { tableExists } from '../helpers.js';
import {
  GUEST_SELF_BOOK_EXCLUDED_CATEGORIES,
  GUEST_SELF_BOOK_EXCLUDED_ITEMS,
} from '../../constants/ancillary.js';

/** Per-row flag: show this extra fee when guests self-book online. */
export async function runExtraGuestVisibleMigration() {
  if (!(await tableExists('rates_extra_services'))) return;

  try {
    await pool.execute(
      `ALTER TABLE rates_extra_services
       ADD COLUMN guest_visible TINYINT(1) NOT NULL DEFAULT 1 AFTER notes`
    );
  } catch (err) {
    if (!/Duplicate column name/i.test(err.message)) {
      console.warn('[schema] rates_extra_services.guest_visible migration skipped:', err.message);
      return;
    }
  }

  try {
    const categoryPlaceholders = GUEST_SELF_BOOK_EXCLUDED_CATEGORIES.map(() => '?').join(', ');
    if (categoryPlaceholders) {
      await pool.execute(
        `UPDATE rates_extra_services SET guest_visible = 0 WHERE category IN (${categoryPlaceholders})`,
        GUEST_SELF_BOOK_EXCLUDED_CATEGORIES
      );
    }
    for (const item of GUEST_SELF_BOOK_EXCLUDED_ITEMS) {
      await pool.execute(
        'UPDATE rates_extra_services SET guest_visible = 0 WHERE item = ?',
        [item]
      );
    }
    console.log('[schema] rates_extra_services.guest_visible ready — legacy guest exclusions applied');
  } catch (err) {
    console.warn('[schema] rates_extra_services.guest_visible bootstrap skipped:', err.message);
  }
}
