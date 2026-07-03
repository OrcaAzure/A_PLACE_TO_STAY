import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, authHeader, isDbAvailable, loginAs } from '../helpers/http.mjs';

const dbReady = await isDbAvailable();

describe('API user permissions', { skip: dbReady ? false : 'MySQL not available — run schema import and npm run dev once' }, () => {
  const agent = api();

  it('GET /api/users returns 403 for non-admin', async () => {
    const facultyToken = await loginAs(agent, 'maria.santos@apts.edu.ph');
    const res = await agent.get('/api/users').set(authHeader(facultyToken));
    assert.equal(res.status, 403);
  });

  it('GET /api/users/:id blocks IDOR for non-admin', async () => {
    const facultyToken = await loginAs(agent, 'maria.santos@apts.edu.ph');
    const adminToken = await loginAs(agent, 'admin@aptspace.com');

    const me = await agent.get('/api/auth/me').set(authHeader(facultyToken));
    const facultyUserId = me.body.user.id;
    const adminMe = await agent.get('/api/auth/me').set(authHeader(adminToken));
    const adminUserId = adminMe.body.user.id;

    assert.notEqual(facultyUserId, adminUserId);
    const res = await agent.get(`/api/users/${adminUserId}`).set(authHeader(facultyToken));
    assert.equal(res.status, 403);
    assert.equal(res.body.message, 'Forbidden');
  });

  it('GET /api/users/:id allows users to read their own profile', async () => {
    const facultyToken = await loginAs(agent, 'maria.santos@apts.edu.ph');
    const me = await agent.get('/api/auth/me').set(authHeader(facultyToken));
    const facultyUserId = me.body.user.id;

    const res = await agent.get(`/api/users/${facultyUserId}`).set(authHeader(facultyToken));
    assert.equal(res.status, 200);
    assert.equal(res.body.user.id, facultyUserId);
    assert.equal(res.body.user.email, 'maria.santos@apts.edu.ph');
  });

  it('GET /api/users allows admin to list users', async () => {
    const adminToken = await loginAs(agent, 'admin@aptspace.com');
    const res = await agent.get('/api/users').set(authHeader(adminToken));
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.users));
    assert.ok(res.body.users.length > 0);
  });
});
