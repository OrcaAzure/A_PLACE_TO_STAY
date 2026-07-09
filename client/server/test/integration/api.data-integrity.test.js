/**
 * Data-integrity guards: room delete protection, meal price locking.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { api, isDbAvailable, loginAs } from '../helpers/http.mjs';
import { pool } from '../../src/config/db.js';

const dbReady = await isDbAvailable();

function futureDate(daysAhead) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

describe('API data integrity guards', { skip: dbReady ? false : 'MySQL not available' }, () => {
  let admin;
  let roomId;
  let bookingId;
  let originalBreakfastRate;

  const CHECK_IN = futureDate(60);
  const CHECK_OUT = futureDate(63);

  before(async () => {
    admin = api();
    await loginAs(admin, 'admin@aptspace.com');

    const avail = await admin.get('/api/bookings/availability').query({
      check_in: CHECK_IN,
      check_out: CHECK_OUT,
      guest_count: 1,
    });
    const available = (avail.body.rooms || []).find((r) => r.availability_status === 'available');
    assert.ok(available, 'need an available room');
    roomId = available.id;

    const [rateRows] = await pool.query(
      `SELECT id, rate FROM rates_meals WHERE meal_type = 'Breakfast' LIMIT 1`
    );
    assert.ok(rateRows.length, 'Breakfast rate must exist in seed data');
    originalBreakfastRate = Number(rateRows[0].rate);

    const createRes = await admin.post('/api/bookings').send({
      guest_name: 'Price Lock Test',
      email: `price-lock-${Date.now()}@example.com`,
      room_id: roomId,
      check_in: CHECK_IN,
      check_out: CHECK_OUT,
      guest_count: 1,
      status: 'Approved',
      meals: { Breakfast: 2 },
    });
    assert.equal(createRes.status, 201, createRes.body?.message);
    bookingId = createRes.body.booking.id;
  });

  it('DELETE /api/rooms/:id returns 409 when room has active reservations', async () => {
    const res = await admin.delete(`/api/rooms/${roomId}`);
    assert.equal(res.status, 409, res.body?.message);
    assert.match(res.body.message, /active reservation/i);
  });

  it('PATCH booking preserves meal unit prices after catalog rate increases', async () => {
    const before = await admin.get(`/api/bookings/${bookingId}`);
    const breakfastBefore = before.body.booking.meals.find((m) => m.meal_type === 'Breakfast');
    assert.ok(breakfastBefore);
    const lockedUnit = Number(breakfastBefore.unit_price);
    const lockedTotal = Number(before.body.booking.total_amount);

    await pool.query(
      `UPDATE rates_meals SET rate = ? WHERE meal_type = 'Breakfast'`,
      [originalBreakfastRate + 500]
    );

    const patchRes = await admin.patch(`/api/bookings/${bookingId}`).send({
      notes: 'Minor note update only',
      meals: { Breakfast: 2 },
      status: 'Approved',
    });
    assert.equal(patchRes.status, 200, patchRes.body?.message);

    const after = await admin.get(`/api/bookings/${bookingId}`);
    const breakfastAfter = after.body.booking.meals.find((m) => m.meal_type === 'Breakfast');
    assert.equal(Number(breakfastAfter.unit_price), lockedUnit);
    assert.equal(Number(after.body.booking.total_amount), lockedTotal);
  });

  after(async () => {
    if (originalBreakfastRate != null) {
      await pool.query(
        `UPDATE rates_meals SET rate = ? WHERE meal_type = 'Breakfast'`,
        [originalBreakfastRate]
      ).catch(() => {});
    }
    if (bookingId) {
      await admin.patch(`/api/bookings/${bookingId}`).send({ status: 'Cancelled' }).catch(() => {});
      await admin.delete(`/api/bookings/${bookingId}`).catch(() => {});
    }
  });
});
