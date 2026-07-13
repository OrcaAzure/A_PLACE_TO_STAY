import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isManagedExternalGuest } from '../../src/services/user.service.js';

describe('isManagedExternalGuest', () => {
  it('includes external guests with Guest role', () => {
    assert.equal(isManagedExternalGuest({
      email: 'visitor@example.com',
      role: 'Guest',
    }), true);
  });

  it('includes external guests with empty role (legacy booking walk-ins)', () => {
    assert.equal(isManagedExternalGuest({
      email: 'lanceroxas131@gmail.com',
      role: '',
    }), true);
  });

  it('excludes internal APTS community accounts even with empty role', () => {
    assert.equal(isManagedExternalGuest({
      email: 'maria.santos@apts.edu.ph',
      role: '',
    }), false);
  });

  it('excludes admin roles', () => {
    assert.equal(isManagedExternalGuest({
      email: 'admin@aptspace.com',
      role: 'Super Admin',
    }), false);
  });
});
