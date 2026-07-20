import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROLES,
  ADMIN_ROLES,
  ADMIN_PORTAL_ROLES,
  READ_ONLY_ROLES,
  USER_ROLES,
} from '../../../public/assets/js/config/roles.js';
import {
  ROLES as SERVER_ROLES,
  ADMIN_ROLES as SERVER_ADMIN_ROLES,
  ADMIN_PORTAL_ROLES as SERVER_ADMIN_PORTAL_ROLES,
  READ_ONLY_ROLES as SERVER_READ_ONLY_ROLES,
  USER_ROLES as SERVER_USER_ROLES,
} from '../../src/utils/constants.js';

describe('frontend roles config mirrors server constants', () => {
  it('matches server role strings', () => {
    assert.deepEqual(ROLES, SERVER_ROLES);
    assert.deepEqual(ADMIN_ROLES, SERVER_ADMIN_ROLES);
    assert.deepEqual(ADMIN_PORTAL_ROLES, SERVER_ADMIN_PORTAL_ROLES);
    assert.deepEqual(READ_ONLY_ROLES, SERVER_READ_ONLY_ROLES);
    assert.deepEqual(USER_ROLES, SERVER_USER_ROLES);
  });

  it('defines only Super Admin, View-Only Admin, and Guest', () => {
    assert.deepEqual(USER_ROLES, [
      ROLES.SUPER_ADMIN,
      ROLES.VIEW_ONLY_ADMIN,
      ROLES.GUEST,
    ]);
  });
});
