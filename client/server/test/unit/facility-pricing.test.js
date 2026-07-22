import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeVenueTotal,
  isRecreationVenue,
  resolveMinHours,
} from '../../src/services/facility.service.js';

describe('facility pricing — recreation vs package venues', () => {
  it('treats Recreation category as pure hourly (not 4-hr block)', () => {
    const court = {
      category: 'Recreation',
      item: 'Sporting event',
      rate: 500,
      min_hours: 4,
      hourly_rate: 125,
    };
    assert.equal(isRecreationVenue(court), true);
    assert.equal(computeVenueTotal(court, '09:00', '11:00'), 1000);
  });

  it('uses package block for chapel-style venues with min_hours', () => {
    const chapel = {
      category: 'GMC Chapel',
      item: 'Chapel use',
      rate: 4000,
      min_hours: 4,
      hourly_rate: 1000,
    };
    assert.equal(isRecreationVenue(chapel), false);
    assert.equal(resolveMinHours(chapel), 4);
    assert.equal(computeVenueTotal(chapel, '09:00', '11:00'), 4000);
    assert.equal(computeVenueTotal(chapel, '09:00', '14:00'), 5000);
  });
});
