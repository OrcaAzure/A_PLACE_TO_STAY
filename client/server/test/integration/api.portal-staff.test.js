import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, isDbAvailable, loginAs } from '../helpers/http.mjs';

const dbReady = await isDbAvailable();
const VIEWER_EMAIL = 'viewer@aptspace.com';
const TEST_STAFF_EMAIL = 'supervisor.test@apts.edu.ph';

describe('API portal staff (Team Access)', { skip: dbReady ? false : 'MySQL not available' }, () => {
  it('GET /api/users/portal-staff allows Super Admin', async () => {
    const agent = api();
    await loginAs(agent, 'admin@aptspace.com');
    const res = await agent.get('/api/users/portal-staff');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.staff));
    assert.ok(res.body.summary);
  });

  it('GET /api/users/portal-staff denies View-Only Admin', async () => {
    const agent = api();
    await loginAs(agent, VIEWER_EMAIL);
    const res = await agent.get('/api/users/portal-staff');
    assert.equal(res.status, 403);
  });

  it('POST /api/users/portal-staff creates a view-only admin for internal email', async () => {
    const agent = api();
    await loginAs(agent, 'admin@aptspace.com');

    const res = await agent.post('/api/users/portal-staff').send({
      full_name: 'Test Supervisor',
      email: TEST_STAFF_EMAIL,
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.user.role, 'View-Only Admin');
    assert.equal(res.body.user.email, TEST_STAFF_EMAIL);
    assert.ok(res.body.temporaryPassword);
  });

  it('POST /api/users/portal-staff rejects external email', async () => {
    const agent = api();
    await loginAs(agent, 'admin@aptspace.com');

    const res = await agent.post('/api/users/portal-staff').send({
      full_name: 'External Person',
      email: 'external@example.org',
    });

    assert.equal(res.status, 400);
    assert.match(res.body.message, /internal APTS email/i);
  });

  it('PATCH /api/users/portal-staff/:id can deactivate view-only admin', async () => {
    const agent = api();
    await loginAs(agent, 'admin@aptspace.com');

    const list = await agent.get('/api/users/portal-staff');
    const member = list.body.staff.find((u) => u.email === TEST_STAFF_EMAIL);
    assert.ok(member, 'expected test staff account from prior test');

    const res = await agent.patch(`/api/users/portal-staff/${member.id}`).send({ status: 'Inactive' });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.status, 'Inactive');
  });

  it('DELETE /api/users/portal-staff/:id removes view-only admin', async () => {
    const agent = api();
    await loginAs(agent, 'admin@aptspace.com');

    const list = await agent.get('/api/users/portal-staff');
    const member = list.body.staff.find((u) => u.email === TEST_STAFF_EMAIL);
    assert.ok(member, 'expected test staff account from prior test');

    const res = await agent.delete(`/api/users/portal-staff/${member.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.deleted, true);

    const after = await agent.get('/api/users/portal-staff');
    assert.ok(!after.body.staff.some((u) => u.id === member.id));
  });

  it('GET /api/users/portal-staff/activity allows Super Admin', async () => {
    const agent = api();
    await loginAs(agent, 'admin@aptspace.com');
    const res = await agent.get('/api/users/portal-staff/activity');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.entries));
  });
});
