import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, authHeader, isDbAvailable, loginAs } from '../helpers/http.mjs';

const dbReady = await isDbAvailable();

describe('Pages smoke (public)', () => {
  const agent = api();

  it('GET / serves landing (redirect or index)', async () => {
    const res = await agent.get('/').redirects(0);
    if (res.status === 302) {
      assert.match(res.headers.location, /index\.html/);
      return;
    }
    assert.equal(res.status, 200);
    assert.match(res.text, /AptSpace/i);
  });

  it('GET /index.html serves landing shell', async () => {
    const res = await agent.get('/index.html');
    assert.equal(res.status, 200);
    assert.match(res.text, /AptSpace/i);
    assert.match(res.text, /lp-preloader/);
    assert.match(res.text, /landing-boot\.js/);
  });

  it('GET /login.html serves login page', async () => {
    const res = await agent.get('/login.html');
    assert.equal(res.status, 200);
    assert.match(res.text, /login/i);
  });

  it('GET landing welcome module is served', async () => {
    const res = await agent.get('/assets/js/layout/landing-welcome.js');
    assert.equal(res.status, 200);
    assert.match(res.text, /runLandingWelcome/);
    assert.match(res.text, /WELCOME_MS/);
  });
});

describe('Pages smoke (auth)', {
  skip: dbReady ? false : 'MySQL not available — run schema import and npm run dev once',
}, () => {
  const agent = api();

  before(() => {
    assert.ok(dbReady);
  });

  it('GET /guest/reservations.html redirects when unauthenticated', async () => {
    const res = await agent.get('/guest/reservations.html');
    assert.equal(res.status, 302);
    assert.match(res.headers.location, /login\.html/);
  });

  it('GET /admin/reservations.html redirects when unauthenticated', async () => {
    const res = await agent.get('/admin/reservations.html');
    assert.equal(res.status, 302);
    assert.match(res.headers.location, /login\.html/);
  });

  it('admin can load reservations hub after login', async () => {
    const token = await loginAs(agent, 'admin@aptspace.com');
    const res = await agent.get('/admin/reservations.html').set(authHeader(token));
    assert.equal(res.status, 200);
    assert.match(res.text, /reservations/i);
  });

  it('guest can load My Stays after login', async () => {
    const token = await loginAs(agent, 'samuel.park@gracechurch.org');
    const res = await agent.get('/guest/reservations.html').set(authHeader(token));
    assert.equal(res.status, 200);
    assert.match(res.text, /reservations|My Stays/i);
  });
});
