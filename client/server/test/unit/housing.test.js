import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import '../helpers/env-setup.mjs';
import {
  parseEmailAllowlist,
  getHousingSuperAdminEmails,
  isHousingSuperAdminEmail,
} from '../../src/config/housing.js';

describe('housing super admin allowlist', () => {
  const original = process.env.HOUSING_SUPER_ADMIN_EMAILS;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.HOUSING_SUPER_ADMIN_EMAILS;
    } else {
      process.env.HOUSING_SUPER_ADMIN_EMAILS = original;
    }
  });

  it('parses comma-separated emails case-insensitively', () => {
    assert.deepEqual(
      parseEmailAllowlist(' Housing.Admin@apts.edu.ph , backup@apts.edu '),
      ['housing.admin@apts.edu.ph', 'backup@apts.edu'],
    );
  });

  it('matches configured housing super admin emails', () => {
    process.env.HOUSING_SUPER_ADMIN_EMAILS = 'staff@apts.edu.ph';
    assert.equal(getHousingSuperAdminEmails().length, 1);
    assert.equal(isHousingSuperAdminEmail('Staff@apts.edu.ph'), true);
    assert.equal(isHousingSuperAdminEmail('guest@example.org'), false);
  });
});
