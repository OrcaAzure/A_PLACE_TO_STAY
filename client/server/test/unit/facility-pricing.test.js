import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeVenueTotal,
  isRecreationVenue,
  resolveMinHours,
  validateVenueDuration,
} from '../../src/services/facility.service.js';

describe('facility pricing — per-hour catalog rates', () => {
  it('treats Recreation category as pure hourly with no minimum duration', () => {
    const court = {
      category: 'Recreation',
      item: 'Sporting event',
      rate: 500,
      min_hours: 4,
    };
    assert.equal(isRecreationVenue(court), true);
    assert.equal(computeVenueTotal(court, '09:00', '11:00'), 1000);
    assert.equal(validateVenueDuration(court, '09:00', '10:00'), null);
  });

  it('bills standard venues at the hourly catalog rate', () => {
    const chapel = {
      category: 'GMC Chapel',
      item: 'Chapel use',
      rate: 1000,
      min_hours: 4,
    };
    assert.equal(isRecreationVenue(chapel), false);
    assert.equal(resolveMinHours(chapel), 4);
    assert.equal(computeVenueTotal(chapel, '09:00', '13:00'), 4000);
    assert.equal(computeVenueTotal(chapel, '09:00', '14:00'), 5000);
    assert.match(validateVenueDuration(chapel, '09:00', '11:00'), /4-hour minimum/);
  });
});
