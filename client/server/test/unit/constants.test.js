import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  canAccessGuestAccess,
  isReadOnlyAdminRole,
  isAdminPortalRole,
  isAdminRole,
  ROLES,
  USER_ROLES,
} from '../../src/utils/constants.js';

describe('RBAC constants', () => {
  it('defines only Super Admin, View-Only Admin, and Guest roles', () => {
    assert.deepEqual(USER_ROLES, [
      ROLES.SUPER_ADMIN,
      ROLES.VIEW_ONLY_ADMIN,
      ROLES.GUEST,
    ]);
  });

  it('Guest Access is Super Admin only', () => {
    assert.equal(canAccessGuestAccess('Super Admin'), true);
    assert.equal(canAccessGuestAccess('View-Only Admin'), false);
    assert.equal(canAccessGuestAccess('Guest'), false);
    assert.equal(canAccessGuestAccess('Super Admin'), isAdminRole('Super Admin'));
  });

  it('View-Only Admin can use the portal but not write or Guest Access', () => {
    assert.equal(isAdminPortalRole('View-Only Admin'), true);
    assert.equal(isReadOnlyAdminRole('View-Only Admin'), true);
    assert.equal(canAccessGuestAccess('View-Only Admin'), false);
  });
});
