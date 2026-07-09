import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isInternalGuestEmail,
  canGuestAccessBuilding,
  canGuestAccessRoom,
  EXTERNAL_ROOM_BUILDINGS,
} from '../../../shared/guest-access.js';

describe('guest-access constants', () => {
  it('detects internal APTS email suffixes', () => {
    assert.equal(isInternalGuestEmail('faculty@apts.edu.ph'), true);
    assert.equal(isInternalGuestEmail('staff@apts.edu'), true);
    assert.equal(isInternalGuestEmail('guest@example.com'), false);
  });

  it('allows internal guests in any non-blocked building', () => {
    assert.equal(canGuestAccessBuilding('a@apts.edu.ph', 'Main Hall'), true);
    assert.equal(canGuestAccessBuilding(true, 'Main Hall'), true);
  });

  it('restricts external guests to EXTERNAL_ROOM_BUILDINGS', () => {
    const gmc = EXTERNAL_ROOM_BUILDINGS[0];
    assert.equal(canGuestAccessBuilding('guest@example.com', gmc), true);
    assert.equal(canGuestAccessBuilding(false, gmc), true);
    assert.equal(canGuestAccessBuilding('guest@example.com', 'Other Building'), false);
    assert.equal(canGuestAccessBuilding(false, 'Other Building'), false);
  });

  it('filters rooms by building on room objects', () => {
    const gmc = EXTERNAL_ROOM_BUILDINGS[0];
    assert.equal(canGuestAccessRoom({ building_name: gmc }, 'guest@x.com'), true);
    assert.equal(canGuestAccessRoom({ building: gmc }, false), true);
    assert.equal(canGuestAccessRoom({ building_name: 'Elsewhere' }, 'guest@x.com'), false);
  });
});
