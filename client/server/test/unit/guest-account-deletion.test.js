import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const servicePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../src/services/guest-access.service.js',
);
const source = fs.readFileSync(servicePath, 'utf8');

describe('guest account deletion guards', () => {
  it('ignores recycle-bin (soft-deleted) reservations when assessing delete', () => {
    assert.match(source, /assessGuestAccountDeletion[\s\S]*deleted_at IS NULL/);
    assert.doesNotMatch(
      source.match(/export async function assessGuestAccountDeletion[\s\S]*?export async function deleteGuestAccount/)?.[0] || '',
      /FROM bookings_rooms[\s\S]{0,120}WHERE user_id = \?[\s\S]{0,80}status = 'Pending'[\s\S]{0,40}group_id IS NULL'\s*,/,
    );
  });

  it('cleans up reservation history before deleting the guest user', () => {
    assert.match(source, /removeGuestReservationHistory/);
    assert.match(source, /await removeGuestReservationHistory\(userId, conn\)/);
    assert.match(source, /DELETE FROM payments WHERE id IN \(\?\)/);
  });
});
