import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, isDbAvailable, loginAs } from '../helpers/http.mjs';

const dbReady = await isDbAvailable();

describe('API user permissions', { skip: dbReady ? false : 'MySQL not available — run schema import and npm run dev once' }, () => {
  it('GET /api/users returns 403 for non-admin', async () => {
    const agent = api();
    await loginAs(agent, 'maria.santos@apts.edu.ph');
    const res = await agent.get('/api/users');
    assert.equal(res.status, 403);
  });

  it('GET /api/users/:id blocks IDOR for non-admin', async () => {
    const facultyAgent = api();
    const adminAgent = api();
    await loginAs(facultyAgent, 'maria.santos@apts.edu.ph');
    await loginAs(adminAgent, 'admin@aptspace.com');

    const me = await facultyAgent.get('/api/auth/me');
    const facultyUserId = me.body.user.id;
    const adminMe = await adminAgent.get('/api/auth/me');
    const adminUserId = adminMe.body.user.id;

    assert.notEqual(facultyUserId, adminUserId);
    const res = await facultyAgent.get(`/api/users/${adminUserId}`);
    assert.equal(res.status, 403);
    assert.equal(res.body.message, 'Forbidden');
  });

  it('GET /api/users/:id allows users to read their own profile', async () => {
    const agent = api();
    await loginAs(agent, 'maria.santos@apts.edu.ph');
    const me = await agent.get('/api/auth/me');
    const facultyUserId = me.body.user.id;

    const res = await agent.get(`/api/users/${facultyUserId}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.user.id, facultyUserId);
    assert.equal(res.body.user.email, 'maria.santos@apts.edu.ph');
  });

  it('GET /api/users allows admin to list users', async () => {
    const agent = api();
    await loginAs(agent, 'admin@aptspace.com');
    const res = await agent.get('/api/users');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.users));
    assert.ok(res.body.users.length > 0);
  });
});
