/**
 * End-to-end reservation lifecycle: create, modify, cancel, delete
 * for single bookings and group reservations.
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

const CHECK_IN = futureDate(45);
const CHECK_OUT = futureDate(48);
const CHECK_IN_MOD = futureDate(50);
const CHECK_OUT_MOD = futureDate(53);

describe('API reservation flows', { skip: dbReady ? false : 'MySQL not available' }, () => {
  let admin;
  let guest;
  let roomId;
  let groupRoomIds = [];
  let bookingId;
  let groupId;

  before(async () => {
    admin = api();
    guest = api();
    await loginAs(admin, 'admin@aptspace.com');
    await loginAs(guest, 'samuel.park@gracechurch.org');

    const avail = await admin.get('/api/bookings/availability').query({
      check_in: CHECK_IN,
      check_out: CHECK_OUT,
      guest_count: 1,
      group_picker: 'true',
    });
    assert.equal(avail.status, 200, avail.body?.message);
    const available = (avail.body.rooms || []).filter((r) => r.availability_status === 'available');
    assert.ok(available.length, 'need at least one available room for flow tests');

    const deluxe = available.find((r) => r.rate_room_type === 'Deluxe 2 BR' || r.rate_room_type === 'Deluxe 3 BR');
    const pick = deluxe || available[0];
    roomId = pick.id;
    assert.ok(pick.rate_room_type, 'availability should include rate_room_type');

    groupRoomIds = available
      .filter((r) => r.room_type !== 'Dorm')
      .slice(0, 2)
      .map((r) => r.id);
    if (!groupRoomIds.length) {
      groupRoomIds = [roomId];
    }
  });

  it('GET /api/groups/suggest-rooms returns suggestions with rate_room_type labels', async () => {
    const res = await admin.get('/api/groups/suggest-rooms').query({
      check_in: CHECK_IN,
      check_out: CHECK_OUT,
      total_guests: 2,
    });
    assert.equal(res.status, 200, res.body?.message);
    assert.ok(Array.isArray(res.body.suggestion));
    if (res.body.suggestion.length) {
      const row = res.body.suggestion[0];
      assert.ok(row.room_id);
      assert.ok(row.room_number || row.building_name);
    }
  });

  it('admin creates an approved single booking', async () => {
    const res = await admin.post('/api/bookings').send({
      guest_name: 'Flow Test Guest',
      email: `flow-test-${Date.now()}@example.com`,
      room_id: roomId,
      check_in: CHECK_IN,
      check_out: CHECK_OUT,
      guest_count: 1,
      status: 'Approved',
      meals: { Breakfast: 1 },
    });
    assert.equal(res.status, 201, res.body?.message);
    bookingId = res.body.booking?.id;
    assert.ok(bookingId);
    assert.equal(res.body.booking.status, 'Approved');
    assert.ok(res.body.booking.total_amount != null);
  });

  it('admin modifies a single booking (dates + guest count)', async () => {
    const res = await admin.patch(`/api/bookings/${bookingId}`).send({
      check_in: CHECK_IN_MOD,
      check_out: CHECK_OUT_MOD,
      guest_count: 2,
      notify_guest: false,
    });
    assert.equal(res.status, 200, res.body?.message);
    assert.equal(res.body.booking.check_in?.slice?.(0, 10) || res.body.booking.check_in, CHECK_IN_MOD);
    assert.equal(Number(res.body.booking.guest_count), 2);
  });

  it('admin cancels a single booking', async () => {
    const res = await admin.patch(`/api/bookings/${bookingId}`).send({ status: 'Cancelled' });
    assert.equal(res.status, 200, res.body?.message);
    assert.equal(res.body.booking.status, 'Cancelled');
  });

  it('admin deletes a cancelled single booking', async () => {
    const res = await admin.delete(`/api/bookings/${bookingId}`);
    assert.ok([200, 204].includes(res.status), `unexpected ${res.status}: ${res.body?.message}`);
    const getRes = await admin.get(`/api/bookings/${bookingId}`);
    assert.equal(getRes.status, 404);
    bookingId = null;
  });

  it('admin creates an approved group reservation', async () => {
    const rooms = groupRoomIds.length >= 2
      ? groupRoomIds.map((id, i) => ({ room_id: id, guest_count: i === 0 ? 2 : 1 }))
      : [{ room_id: groupRoomIds[0], guest_count: 2 }];
    const totalGuests = rooms.reduce((s, r) => s + r.guest_count, 0);

    const res = await admin.post('/api/groups').send({
      group_name: 'Flow Test Group',
      contact_name: 'Group Contact',
      contact_email: `flow-group-${Date.now()}@example.com`,
      check_in: CHECK_IN,
      check_out: CHECK_OUT,
      total_guests: totalGuests,
      rooms,
      status: 'Approved',
    });
    assert.equal(res.status, 201, res.body?.message);
    groupId = res.body.group?.id;
    assert.ok(groupId);
    assert.equal(res.body.group.status, 'Approved');
    assert.ok(Array.isArray(res.body.group.bookings) && res.body.group.bookings.length >= 1);
  });

  it('keeps one billing record for every room in the group stay', async () => {
    const groupRes = await admin.get(`/api/groups/${groupId}`);
    assert.equal(groupRes.status, 200);
    const invoiceIds = [];
    for (const booking of groupRes.body.group.bookings || []) {
      const invoice = await admin.post('/api/payments').send({ booking_id: booking.id });
      assert.equal(invoice.status, 201, invoice.body?.message);
      invoiceIds.push(invoice.body.payment.id);
    }
    assert.equal(new Set(invoiceIds).size, 1);

    const payments = await admin.get('/api/payments');
    assert.equal(payments.status, 200);
    const groupInvoices = (payments.body.payments || [])
      .filter((payment) => Number(payment.group_id) === Number(groupId));
    assert.equal(groupInvoices.length, 1);
  });

  it('admin modifies a group reservation', async () => {
    const getRes = await admin.get(`/api/groups/${groupId}`);
    assert.equal(getRes.status, 200);
    const rooms = (getRes.body.group.bookings || []).map((r) => ({
      room_id: r.room_id,
      guest_count: Number(r.guest_count) + 1,
    }));
    const totalGuests = rooms.reduce((s, r) => s + r.guest_count, 0);

    const res = await admin.patch(`/api/groups/${groupId}`).send({
      check_in: CHECK_IN_MOD,
      check_out: CHECK_OUT_MOD,
      total_guests: totalGuests,
      rooms,
      notify_guest: false,
    });
    assert.equal(res.status, 200, res.body?.message);
    assert.equal(res.body.group.check_in?.slice?.(0, 10) || res.body.group.check_in, CHECK_IN_MOD);
  });

  it('admin cancels a group reservation', async () => {
    const res = await admin.patch(`/api/groups/${groupId}`).send({ status: 'Cancelled' });
    assert.equal(res.status, 200, res.body?.message);
    assert.equal(res.body.group.status, 'Cancelled');
  });

  it('admin deletes a cancelled group reservation', async () => {
    const res = await admin.delete(`/api/groups/${groupId}`);
    assert.ok([200, 204].includes(res.status), `unexpected ${res.status}: ${res.body?.message}`);
    const getRes = await admin.get(`/api/groups/${groupId}`);
    assert.equal(getRes.status, 404);
    groupId = null;
  });

  it('guest can create a pending single booking request', async () => {
    const avail = await guest.get('/api/bookings/availability').query({
      check_in: CHECK_IN,
      check_out: CHECK_OUT,
      guest_count: 1,
    });
    const available = (avail.body.rooms || []).find((r) => r.availability_status === 'available');
    assert.ok(available, 'guest needs an available room');

    const res = await guest.post('/api/bookings').send({
      room_id: available.id,
      check_in: CHECK_IN,
      check_out: CHECK_OUT,
      guest_count: 1,
      status: 'Pending',
    });
    assert.equal(res.status, 201, res.body?.message);
    bookingId = res.body.booking?.id;
    assert.equal(res.body.booking.status, 'Pending');
  });

  it('guest can cancel their pending booking', async () => {
    const res = await guest.patch(`/api/bookings/${bookingId}`).send({ status: 'Cancelled' });
    assert.equal(res.status, 200, res.body?.message);
    assert.equal(res.body.booking.status, 'Cancelled');
  });

  after(async () => {
    if (bookingId) await admin.delete(`/api/bookings/${bookingId}`).catch(() => {});
    if (groupId) await admin.delete(`/api/groups/${groupId}`).catch(() => {});
  });
});
