/** Server-side guest access — re-exports shared rules + HTTP helpers. */
export {
  INTERNAL_EMAIL_SUFFIXES,
  GUEST_BLOCKED_BUILDINGS,
  EXTERNAL_ROOM_BUILDINGS,
  isInternalGuestEmail,
  canGuestAccessBuilding,
  canGuestAccessRoom,
  roomAllowedForGuest,
  filterRoomsForGuestUser,
} from '../../../shared/guest-access.js';

import { canGuestAccessBuilding } from '../../../shared/guest-access.js';

export function assertGuestCanAccessRoom(email, buildingName) {
  if (!canGuestAccessBuilding(email, buildingName)) {
    throw new Error('You do not have access to this room. External guests may only book Global Missions Center rooms.');
  }
}
