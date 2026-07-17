/**
 * Guest portal access rules — single source of truth for browser + server.
 */

export const INTERNAL_EMAIL_SUFFIXES = ['@apts.edu.ph', '@apts.edu'];

/** Buildings hidden from all guest-portal room browse/book flows. */
export const GUEST_BLOCKED_BUILDINGS = [];

/** External guests may only book/view rooms in these buildings. */
export const EXTERNAL_ROOM_BUILDINGS = ['Global Missions Center'];

export function isInternalGuestEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  return INTERNAL_EMAIL_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

/**
 * @param {string|boolean} emailOrIsInternal — guest email, or precomputed internal flag
 * @param {string} buildingName
 */
export function canGuestAccessBuilding(emailOrIsInternal, buildingName) {
  const building = String(buildingName || '').trim();
  if (GUEST_BLOCKED_BUILDINGS.includes(building)) return false;
  const isInternal = typeof emailOrIsInternal === 'boolean'
    ? emailOrIsInternal
    : isInternalGuestEmail(emailOrIsInternal);
  if (isInternal) return true;
  return EXTERNAL_ROOM_BUILDINGS.includes(building);
}

export function canGuestAccessRoom(room, emailOrIsInternal) {
  const building = room?.building_name || room?.building;
  return canGuestAccessBuilding(emailOrIsInternal, building);
}

export function filterRoomsForGuestUser(rooms, email) {
  return (rooms || []).filter((room) => canGuestAccessRoom(room, email));
}
