import { pool } from '../../src/config/db.js';

/**
 * Delete leftover accounts created by integration test runs.
 * Test-created guests always use reserved example domains (RFC 2606),
 * so anything at @example.com / @example.org is safe to purge.
 */
export async function purgeTestAccounts() {
  const [users] = await pool.execute(
    `SELECT id FROM users WHERE email LIKE '%@example.com' OR email LIKE '%@example.org'`
  );
  if (users.length) {
    const userIds = users.map((u) => u.id);

    const [payments] = await pool.query(
      `SELECT p.id FROM payments p
       LEFT JOIN bookings_rooms br ON br.id = p.bookings_room_id
       LEFT JOIN bookings_facilities bf ON bf.id = p.bookings_facility_id
       WHERE br.user_id IN (?) OR bf.user_id IN (?)`,
      [userIds, userIds]
    );
    if (payments.length) {
      const paymentIds = payments.map((p) => p.id);
      await pool.query('DELETE FROM payment_transactions WHERE payment_id IN (?)', [paymentIds]);
      await pool.query('DELETE FROM payments WHERE id IN (?)', [paymentIds]);
    }

    await pool.query('DELETE FROM bookings_rooms WHERE user_id IN (?)', [userIds]);
    await pool.query('DELETE FROM bookings_facilities WHERE user_id IN (?)', [userIds]);
    await pool.query('DELETE FROM reservation_groups WHERE user_id IN (?)', [userIds]);
    await pool.query('DELETE FROM users WHERE id IN (?)', [userIds]);
  }

  await pool.execute(
    `DELETE FROM guest_access_requests WHERE email LIKE '%@example.com' OR email LIKE '%@example.org'`
  );

  return users.length;
}
