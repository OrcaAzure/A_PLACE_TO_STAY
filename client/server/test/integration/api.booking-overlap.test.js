/**
 * Double-booking prevention and availability sync — demo-critical paths.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { api, isDbAvailable, loginAs } from '../helpers/http.mjs';

const dbReady = await isDbAvailable();

function futureDate(daysAhead) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

const CHECK_IN = futureDate(60);
const CHECK_OUT = futureDate(63);

const BLOCKED_BOOKING_RE = /already reserved|being booked by another request/i;

describe('API booking overlap & sync', { skip: dbReady ? false : 'MySQL not available' }, () => {
  let admin;
  let guestA;
  let guestB;
  let roomId;
  let bookingId;

  before(async () => {
    admin = api();
    guestA = api();
    guestB = api();
    await loginAs(admin, 'admin@aptspace.com');
    await loginAs(guestA, 'samuel.park@gracechurch.org');
    await loginAs(guestB, 'maria.santos@apts.edu.ph');

    const avail = await admin.get('/api/bookings/availability').query({
      check_in: CHECK_IN,
      check_out: CHECK_OUT,
      guest_count: 1,
    });
    assert.equal(avail.status, 200, avail.body?.message);
    const pick = (avail.body.rooms || []).find((r) => r.availability_status === 'available');
    assert.ok(pick, 'need an available room for overlap tests');
    roomId = pick.id;
  });

  after(async () => {
    if (bookingId) {
      await admin.patch(`/api/bookings/${bookingId}`).send({ status: 'Cancelled' }).catch(() => {});
      await admin.delete(`/api/bookings/${bookingId}`).catch(() => {});
    }
  });

  it('first guest can book an available room', async () => {
    const res = await guestA.post('/api/bookings').send({
      room_id: roomId,
      check_in: CHECK_IN,
      check_out: CHECK_OUT,
      guest_count: 1,
      status: 'Approved',
    });
    assert.equal(res.status, 201, res.body?.message);
    bookingId = res.body.booking?.id;
    assert.ok(bookingId);
  });

  it('availability marks the room booked for the same dates', async () => {
    const res = await guestB.get('/api/bookings/availability').query({
      check_in: CHECK_IN,
      check_out: CHECK_OUT,
      guest_count: 1,
    });
    assert.equal(res.status, 200);
    const row = (res.body.rooms || []).find((r) => r.id === roomId);
    assert.ok(row, 'room should appear in availability');
    assert.equal(row.availability_status, 'booked');
  });

  it('second guest cannot book the same room for overlapping dates', async () => {
    const res = await guestB.post('/api/bookings').send({
      room_id: roomId,
      check_in: CHECK_IN,
      check_out: CHECK_OUT,
      guest_count: 1,
      status: 'Pending',
    });
    assert.equal(res.status, 409, res.body?.message);
    assert.match(res.body?.message || '', BLOCKED_BOOKING_RE);
  });

  it('admin also cannot double-book the same room and dates', async () => {
    const res = await admin.post('/api/bookings').send({
      guest_name: 'Overlap Test',
      email: `overlap-${Date.now()}@example.com`,
      room_id: roomId,
      check_in: CHECK_IN,
      check_out: CHECK_OUT,
      guest_count: 1,
      status: 'Approved',
    });
    assert.equal(res.status, 409, res.body?.message);
    assert.match(res.body?.message || '', BLOCKED_BOOKING_RE);
  });

  it('concurrent booking attempts: only one succeeds', async () => {
    const avail = await admin.get('/api/bookings/availability').query({
      check_in: futureDate(70),
      check_out: futureDate(73),
      guest_count: 1,
    });
    const free = (avail.body.rooms || []).find((r) => r.availability_status === 'available');
    assert.ok(free, 'need a free room for concurrent test');
    const targetRoom = free.id;
    const ci = futureDate(70);
    const co = futureDate(73);
    const stamp = Date.now();

    const payload = (email) => ({
      guest_name: 'Race Test',
      email,
      room_id: targetRoom,
      check_in: ci,
      check_out: co,
      guest_count: 1,
      status: 'Approved',
    });

    const [a, b] = await Promise.all([
      admin.post('/api/bookings').send(payload(`race-a-${stamp}@example.com`)),
      admin.post('/api/bookings').send(payload(`race-b-${stamp}@example.com`)),
    ]);

    const created = [a, b].filter((r) => r.status === 201);
    const blocked = [a, b].filter((r) => r.status === 409);
    assert.equal(created.length, 1, `expected one 201, got ${a.status} and ${b.status}`);
    assert.equal(blocked.length, 1);
    assert.match(blocked[0].body?.message || '', BLOCKED_BOOKING_RE);

    for (const res of created) {
      const cleanupId = res.body.booking?.id;
      if (!cleanupId) continue;
      await admin.patch(`/api/bookings/${cleanupId}`).send({ status: 'Cancelled' }).catch(() => {});
      await admin.delete(`/api/bookings/${cleanupId}`).catch(() => {});
    }
  });

  it('after cancel, room becomes available again', async () => {
    const cancel = await admin.patch(`/api/bookings/${bookingId}`).send({ status: 'Cancelled' });
    assert.equal(cancel.status, 200);

    const res = await guestB.get('/api/bookings/availability').query({
      check_in: CHECK_IN,
      check_out: CHECK_OUT,
      guest_count: 1,
    });
    const row = (res.body.rooms || []).find((r) => r.id === roomId);
    assert.ok(row);
    assert.equal(row.availability_status, 'available');

    const retry = await guestB.post('/api/bookings').send({
      room_id: roomId,
      check_in: CHECK_IN,
      check_out: CHECK_OUT,
      guest_count: 1,
      status: 'Pending',
    });
    assert.equal(retry.status, 201, retry.body?.message);
    bookingId = retry.body.booking?.id;
  });
});
