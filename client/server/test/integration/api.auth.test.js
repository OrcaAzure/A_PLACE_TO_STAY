import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, authHeader, isDbAvailable, loginAs } from '../helpers/http.mjs';

const dbReady = await isDbAvailable();

describe('API auth', { skip: dbReady ? false : 'MySQL not available — run schema import and npm run dev once' }, () => {
  const agent = api();

  before(() => {
    assert.ok(dbReady);
  });

  it('GET /api returns running message', async () => {
    const res = await agent.get('/api');
    assert.equal(res.status, 200);
    assert.match(res.body.message, /running/i);
  });

  it('GET /api/health reports database connectivity', async () => {
    const res = await agent.get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.db, 'connected');
  });

  it('GET /api/auth/me returns 401 without a token', async () => {
    const res = await agent.get('/api/auth/me');
    assert.equal(res.status, 401);
    assert.equal(res.body.message, 'Unauthorized');
  });

  it('GET /api/auth/me returns 401 for an invalid token', async () => {
    const res = await agent
      .get('/api/auth/me')
      .set(authHeader('not-a-valid-jwt'));
    assert.equal(res.status, 401);
  });

  it('POST /api/auth/login rejects missing credentials', async () => {
    const res = await agent.post('/api/auth/login').send({ email: '', password: '' });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /required/i);
  });

  it('POST /api/auth/login rejects wrong password', async () => {
    const res = await agent.post('/api/auth/login').send({
      email: 'admin@aptspace.com',
      password: 'wrong-password',
    });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /invalid/i);
  });

  it('POST /api/auth/login succeeds for seeded admin', async () => {
    const user = await loginAs(agent, 'admin@aptspace.com');
    assert.equal(user.email, 'admin@aptspace.com');
    assert.equal(user.role, 'Super Admin');
  });

  it('GET /api/auth/me authenticates via httpOnly cookie', async () => {
    const cookieAgent = api();
    await loginAs(cookieAgent, 'admin@aptspace.com');
    const res = await cookieAgent.get('/api/auth/me');
    assert.equal(res.status, 200);
    assert.equal(res.body.user.email, 'admin@aptspace.com');
    assert.equal(res.body.user.role, 'Super Admin');
  });
});
