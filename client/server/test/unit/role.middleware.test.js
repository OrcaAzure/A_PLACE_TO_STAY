import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import '../helpers/env-setup.mjs';
import { requireRole, denyRole, blockReadOnly } from '../../src/middleware/role.middleware.js';

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
    const { res, nextCalled } = runMiddleware(requireRole('Admin'), {});
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.message, 'Unauthorized');
    assert.equal(nextCalled, false);
  });

  it('returns 403 when role is not allowed', () => {
    const { res, nextCalled } = runMiddleware(requireRole('Super Admin', 'Admin'), {
      user: { role: 'Faculty' },
    });
    assert.equal(res.statusCode, 403);
    assert.match(res.body.message, /Forbidden/);
    assert.equal(nextCalled, false);
  });

  it('calls next when role is allowed', () => {
    const { res, nextCalled } = runMiddleware(requireRole('Super Admin', 'Admin'), {
      user: { role: 'Admin' },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(nextCalled, true);
  });
});

describe('denyRole / blockReadOnly', () => {
  it('blocks Supervisory User via blockReadOnly', () => {
    const { res, nextCalled } = runMiddleware(blockReadOnly, {
      user: { role: 'Supervisory User' },
    });
    assert.equal(res.statusCode, 403);
    assert.match(res.body.message, /view-only/);
    assert.equal(nextCalled, false);
  });

  it('allows Faculty through blockReadOnly', () => {
    const { res, nextCalled } = runMiddleware(blockReadOnly, {
      user: { role: 'Faculty' },
    });
    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, 200);
  });

  it('denyRole blocks only listed roles', () => {
    const guard = denyRole('GMC', 'Staff');
    const blocked = runMiddleware(guard, { user: { role: 'GMC' } });
    assert.equal(blocked.res.statusCode, 403);
    assert.equal(blocked.nextCalled, false);

    const allowed = runMiddleware(guard, { user: { role: 'Faculty' } });
    assert.equal(allowed.nextCalled, true);
  });
});
