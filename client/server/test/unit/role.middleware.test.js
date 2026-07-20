import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import '../helpers/env-setup.mjs';
import { requireRole, denyRole, blockReadOnly, requireAdminPortal, requireGuestAccessAdmin } from '../../src/middleware/role.middleware.js';

function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.body = data;
    return res;
  };
  return res;
}

function runMiddleware(middleware, req) {
  const res = mockRes();
  let nextCalled = false;
  let nextError = null;
  middleware(req, res, (err) => {
    nextCalled = true;
    nextError = err ?? null;
  });
  return { res, nextCalled, nextError };
}

describe('requireRole', () => {
  it('returns 401 when req.user is missing', () => {
    const { res, nextCalled } = runMiddleware(requireRole('Super Admin'), {});
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.message, 'Unauthorized');
    assert.equal(nextCalled, false);
  });

  it('returns 403 when role is not allowed', () => {
    const { res, nextCalled } = runMiddleware(requireRole('Super Admin'), {
      user: { role: 'Guest' },
    });
    assert.equal(res.statusCode, 403);
    assert.match(res.body.message, /Forbidden/);
    assert.equal(nextCalled, false);
  });

  it('calls next when role is allowed', () => {
    const { res, nextCalled } = runMiddleware(requireRole('Super Admin'), {
      user: { role: 'Super Admin' },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(nextCalled, true);
  });
});

describe('denyRole / blockReadOnly', () => {
  it('blocks View-Only Admin via blockReadOnly', () => {
    const { res, nextCalled } = runMiddleware(blockReadOnly, {
      user: { role: 'View-Only Admin' },
    });
    assert.equal(res.statusCode, 403);
    assert.match(res.body.message, /view-only/);
    assert.equal(nextCalled, false);
  });

  it('allows Guest through blockReadOnly', () => {
    const { res, nextCalled } = runMiddleware(blockReadOnly, {
      user: { role: 'Guest' },
    });
    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, 200);
  });

  it('allows Super Admin through blockReadOnly', () => {
    const { res, nextCalled } = runMiddleware(blockReadOnly, {
      user: { role: 'Super Admin' },
    });
    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, 200);
  });

  it('allows View-Only Admin through requireAdminPortal', () => {
    const { res, nextCalled } = runMiddleware(requireAdminPortal, {
      user: { role: 'View-Only Admin' },
    });
    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, 200);
  });

  it('denyRole blocks only listed roles', () => {
    const guard = denyRole('View-Only Admin');
    const blocked = runMiddleware(guard, { user: { role: 'View-Only Admin' } });
    assert.equal(blocked.res.statusCode, 403);
    assert.equal(blocked.nextCalled, false);

    const allowed = runMiddleware(guard, { user: { role: 'Guest' } });
    assert.equal(allowed.nextCalled, true);
  });
});

describe('requireGuestAccessAdmin', () => {
  it('allows Super Admin', () => {
    const { nextCalled } = runMiddleware(requireGuestAccessAdmin, { user: { role: 'Super Admin' } });
    assert.equal(nextCalled, true);
  });

  it('blocks View-Only Admin', () => {
    const { res, nextCalled } = runMiddleware(requireGuestAccessAdmin, { user: { role: 'View-Only Admin' } });
    assert.equal(res.statusCode, 403);
    assert.equal(nextCalled, false);
  });
});
