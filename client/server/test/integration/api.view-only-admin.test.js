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

  it('GET /api/users/guest-access/activity allows View-Only Admin', async () => {
    const agent = api();
    await loginAs(agent, VIEWER_EMAIL);
    const res = await agent.get('/api/users/guest-access/activity');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.entries));
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
      ['put', '/api/catalog/room-rates', { rates: [] }],
      ['post', '/api/facilities', { name: 'Blocked Facility' }],
      ['delete', '/api/bookings/1', null],
      ['patch', '/api/auth/me', { full_name: 'Blocked Name' }],
      ['post', '/api/users/guest-access/requests', { full_name: 'X', email: 'x@example.org' }],
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
});
