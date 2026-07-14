import { pool } from '../../config/db.js';

/** Rename PCALM → Global Missions Center; purge retired buildings. */
export async function runBuildingsCleanup() {
  await pool.execute(
    `UPDATE buildings
     SET name = 'Global Missions Center',
         description = 'Main Global Missions Center building'
     WHERE name = 'PCALM'`
  );
  await pool.execute(
    `DELETE p FROM payments p
     JOIN bookings_rooms bk ON bk.id = p.bookings_room_id
     JOIN rooms r ON r.id = bk.room_id
     JOIN buildings b ON b.id = r.building_id
     WHERE b.name IN ('Thesda', 'Sampaguita', 'Peranza', 'House')`
  );
  await pool.execute(
    `DELETE bk FROM bookings_rooms bk
     JOIN rooms r ON r.id = bk.room_id
     JOIN buildings b ON b.id = r.building_id
     WHERE b.name IN ('Thesda', 'Sampaguita', 'Peranza', 'House')`
  );
  await pool.execute(
    `DELETE r FROM rooms r
     JOIN buildings b ON b.id = r.building_id
     WHERE b.name IN ('Thesda', 'Sampaguita', 'Peranza', 'House')`
  );
  await pool.execute(
    `DELETE FROM buildings WHERE name IN ('Thesda', 'Sampaguita', 'Peranza', 'House')`
  );
}
