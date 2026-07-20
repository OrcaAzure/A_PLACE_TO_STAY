import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { requireSuperAdminPage } from '../../src/middleware/pageAuth.middleware.js';

function mockRes() {
  const res = { statusCode: 200, redirectUrl: null };
  res.redirect = (url) => {
    res.redirectUrl = url;
    res.statusCode = 302;
    return res;
  };
  return res;
}

describe('requireSuperAdminPage', () => {
  it('redirects View-Only Admin to dashboard', () => {
    const req = { portalUser: { role: 'View-Only Admin' } };
    const res = mockRes();
    let nextCalled = false;
    requireSuperAdminPage(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.redirectUrl, '/admin/dashboard.html');
  });

  it('allows Super Admin through', () => {
    const req = { portalUser: { role: 'Super Admin' } };
    const res = mockRes();
    let nextCalled = false;
    requireSuperAdminPage(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  });
});
