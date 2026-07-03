import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, authHeader, isDbAvailable, loginAs } from '../helpers/http.mjs';

const dbReady = await isDbAvailable();

describe('API booking permissions', { skip: dbReady ? false : 'MySQL not available — run schema import and npm run dev once' }, () => {
  const agent = api();

  it('GET /api/bookings returns 401 without a token', async () => {
    const res = await agent.get('/api/bookings');
    assert.equal(res.status, 401);
  });

  it('GET /api/bookings allows authenticated faculty', async () => {
    const facultyToken = await loginAs(agent, 'maria.santos@apts.edu.ph');
    const res = await agent.get('/api/bookings').set(authHeader(facultyToken));
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.bookings));
  });

  it('DELETE /api/bookings/:id returns 403 for faculty', async () => {
    const facultyToken = await loginAs(agent, 'maria.santos@apts.edu.ph');
    const res = await agent.delete('/api/bookings/1').set(authHeader(facultyToken));
    assert.equal(res.status, 403);
    assert.match(res.body.message, /Forbidden/);
  });

  it('DELETE /api/bookings/:id allows admin role', async () => {
    const adminToken = await loginAs(agent, 'admin@aptspace.com');
    const res = await agent.delete('/api/bookings/999999').set(authHeader(adminToken));
    assert.notEqual(res.status, 403);
    assert.ok([404, 400, 200, 204].includes(res.status), `unexpected status ${res.status}`);
  });
});
