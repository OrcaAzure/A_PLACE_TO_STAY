import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, isDbAvailable, loginAs } from '../helpers/http.mjs';

const dbReady = await isDbAvailable();
const VIEWER_EMAIL = 'viewer@aptspace.com';

describe('API View-Only Admin permissions', { skip: dbReady ? false : 'MySQL not available — run schema import and npm run dev once' }, () => {
  it('GET /api/stats/summary allows View-Only Admin', async () => {
    const agent = api();
    await loginAs(agent, VIEWER_EMAIL);
    const res = await agent.get('/api/stats/summary');
    assert.equal(res.status, 200);
  });

  it('GET /api/users allows View-Only Admin', async () => {
    const agent = api();
    await loginAs(agent, VIEWER_EMAIL);
    const res = await agent.get('/api/users');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.users));
  });

  it('GET /api/payments allows View-Only Admin', async () => {
    const agent = api();
    await loginAs(agent, VIEWER_EMAIL);
    const res = await agent.get('/api/payments');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.payments));
  });

  it('GET /api/bookings allows View-Only Admin', async () => {
    const agent = api();
    await loginAs(agent, VIEWER_EMAIL);
    const res = await agent.get('/api/bookings');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.bookings));
  });

  it('GET /api/settings/fiscal-year allows View-Only Admin', async () => {
    const agent = api();
    await loginAs(agent, VIEWER_EMAIL);
    const res = await agent.get('/api/settings/fiscal-year');
    assert.equal(res.status, 200);
  });

  it('GET /api/settings/policies is publicly readable', async () => {
    const res = await api().get('/api/settings/policies');
    assert.equal(res.status, 200);
    assert.match(res.body.rooms, /Reservation and Deposit Guidelines/);
    assert.match(res.body.venues, /Facility Setup, Cleanliness, and Restrictions/);
  });

  it('GET /api/support/contact is publicly readable', async () => {
    const res = await api().get('/api/support/contact');
    assert.equal(res.status, 200);
    assert.ok(res.body.email);
    assert.ok(res.body.telephone);
    assert.ok(res.body.mobile);
  });

  it('GET /api/users/guest-access/activity denies View-Only Admin', async () => {
    const agent = api();
    await loginAs(agent, VIEWER_EMAIL);
    const res = await agent.get('/api/users/guest-access/activity');
    assert.equal(res.status, 403);
    assert.match(res.body.message, /Forbidden/i);
  });

  it('GET /api/users/guest-access denies View-Only Admin', async () => {
    const agent = api();
    await loginAs(agent, VIEWER_EMAIL);
    const res = await agent.get('/api/users/guest-access');
    assert.equal(res.status, 403);
  });

  it('GET /api/recycle denies View-Only Admin', async () => {
    const agent = api();
    await loginAs(agent, VIEWER_EMAIL);
    const res = await agent.get('/api/recycle');
    assert.equal(res.status, 403);
    assert.match(res.body.message, /Forbidden/i);
  });

  it('GET /api/catalog/room-rates allows View-Only Admin', async () => {
    const agent = api();
    await loginAs(agent, VIEWER_EMAIL);
    const res = await agent.get('/api/catalog/room-rates');
    assert.equal(res.status, 200);
  });

  it('write endpoints return 403 for View-Only Admin', async () => {
    const agent = api();
    await loginAs(agent, VIEWER_EMAIL);

    const cases = [
      ['post', '/api/users', { full_name: 'Blocked', email: 'blocked@example.org', role: 'Guest' }],
      ['patch', '/api/settings/fiscal-year', { booking_advance_months: 6 }],
      ['patch', '/api/settings/policies', { rooms: 'Blocked', venues: 'Blocked' }],
      ['patch', '/api/settings/contact', { telephone: 'Blocked', mobile: 'Blocked' }],
      ['put', '/api/catalog/room-rates', { rates: [] }],
      ['post', '/api/facilities', { name: 'Blocked Facility' }],
      ['delete', '/api/bookings/1', null],
      ['patch', '/api/auth/me', { full_name: 'Blocked Name' }],
      ['post', '/api/users/guest-access/requests', { full_name: 'X', email: 'x@example.org' }],
      ['post', '/api/recycle/restore', { type: 'invoice', id: 1 }],
    ];

    for (const [method, path, body] of cases) {
      const req = agent[method](path);
      const res = body ? await req.send(body) : await req;
      assert.equal(res.status, 403, `${method.toUpperCase()} ${path} should be forbidden`);
      assert.match(res.body.message, /Forbidden/i);
    }
  });

  it('Super Admin retains write access', async () => {
    const agent = api();
    await loginAs(agent, 'admin@aptspace.com');
    const res = await agent.patch('/api/settings/fiscal-year').send({ booking_advance_months: 12 });
    assert.notEqual(res.status, 403, 'Super Admin should not be blocked by view-only guards');
  });

  it('Super Admin can update the public contact person and phone numbers', async () => {
    const original = await api().get('/api/support/contact');
    const agent = api();
    await loginAs(agent, 'admin@aptspace.com');
    try {
      const updated = await agent.patch('/api/settings/contact').send({
        name: 'Test Guest Services Contact',
        telephone: '(6374) 555-0100 Ext. 9',
        mobile: '0999-555-0100',
      });
      assert.equal(updated.status, 200);
      const publicContact = await api().get('/api/support/contact');
      assert.equal(publicContact.body.telephone, '(6374) 555-0100 Ext. 9');
      assert.equal(publicContact.body.mobile, '0999-555-0100');
      assert.equal(publicContact.body.name, 'Test Guest Services Contact');
      assert.equal(publicContact.body.email, original.body.email);
    } finally {
      await agent.patch('/api/settings/contact').send({
        name: original.body.name,
        telephone: original.body.telephone,
        mobile: original.body.mobile,
      });
    }
  });

  it('Super Admin retains Guest Access API access', async () => {
    const agent = api();
    await loginAs(agent, 'admin@aptspace.com');
    const res = await agent.get('/api/users/guest-access');
    assert.equal(res.status, 200);
  });

  it('Super Admin can access recycle bin', async () => {
    const agent = api();
    await loginAs(agent, 'admin@aptspace.com');
    const res = await agent.get('/api/recycle');
    assert.equal(res.status, 200);
  });
});
