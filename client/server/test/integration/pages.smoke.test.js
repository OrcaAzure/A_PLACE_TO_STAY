import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, isDbAvailable, loginAs } from '../helpers/http.mjs';

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

  it('GET /index.html includes comfort hero and scroll showcase', async () => {
    const res = await agent.get('/index.html');
    assert.equal(res.status, 200);
    assert.match(res.text, /lp-hero--comfort/);
    assert.match(res.text, /lp-scroll-section/);
    assert.match(res.text, /comfort75n/);
    assert.match(res.text, /id="explore"/);
  });

  it('GET landing.css is served', async () => {
    const res = await agent.get('/assets/css/global/landing.css');
    assert.equal(res.status, 200);
    assert.match(res.text, /\.lp-scroll-section/);
    assert.match(res.text, /\.lp-hero--comfort/);
  });

  it('GET landing.js is served', async () => {
    const res = await agent.get('/assets/js/layout/landing.js');
    assert.equal(res.status, 200);
    assert.match(res.text, /initScrollShowcase/);
    assert.match(res.text, /setSlideIndex/);
  });

  it('GET legal pages are served', async () => {
    const privacy = await agent.get('/legal/privacy.html');
    assert.equal(privacy.status, 200);
    assert.match(privacy.text, /Privacy Policy/i);

    const terms = await agent.get('/legal/terms.html');
    assert.equal(terms.status, 200);
    assert.match(terms.text, /Terms of Service/i);
  });

  it('GET guest footer has legal links (no coming soon)', async () => {
    const res = await agent.get('/components/guest-footer.html');
    assert.equal(res.status, 200);
    assert.match(res.text, /\/legal\/privacy\.html/);
    assert.match(res.text, /\/legal\/terms\.html/);
    assert.doesNotMatch(res.text, /coming soon/i);
  });

  it('GET /api/health returns status payload', async () => {
    const res = await agent.get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.ok('db' in res.body || res.body.status === 'ok');
  });

  it('GET api.js uses cookie credentials instead of localStorage token', async () => {
    const res = await agent.get('/assets/js/services/api.js');
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.text, /localStorage\.getItem\(['"]token['"]\)/);
    assert.match(res.text, /credentials:\s*'include'/);
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
    const adminAgent = api();
    await loginAs(adminAgent, 'admin@aptspace.com');
    const res = await adminAgent.get('/admin/reservations.html');
    assert.equal(res.status, 200);
    assert.match(res.text, /reservations/i);
  });

  it('guest can load My Stays after login', async () => {
    const guestAgent = api();
    await loginAs(guestAgent, 'samuel.park@gracechurch.org');
    const res = await guestAgent.get('/guest/reservations.html');
    assert.equal(res.status, 200);
    assert.match(res.text, /reservations|My Stays/i);
  });
});
