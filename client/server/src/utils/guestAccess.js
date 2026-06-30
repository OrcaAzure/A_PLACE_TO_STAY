/** Guest portal scope — internal (@apts.edu) vs external visitors. */

const INTERNAL_EMAIL_SUFFIXES = ['@apts.edu.ph', '@apts.edu'];

export const GUEST_BLOCKED_BUILDINGS = [];

/** External guests may only book/view rooms in these buildings. */
export const EXTERNAL_ROOM_BUILDINGS = ['Global Missions Center'];

export function isInternalGuestEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  return INTERNAL_EMAIL_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

export function canGuestAccessBuilding(email, buildingName) {
  const building = String(buildingName || '').trim();
  if (GUEST_BLOCKED_BUILDINGS.includes(building)) return false;
  if (isInternalGuestEmail(email)) return true;
  return EXTERNAL_ROOM_BUILDINGS.includes(building);
}

export function filterRoomsForGuestUser(rooms, email) {
  return (rooms || []).filter((room) => {
    const building = room.building_name || room.building;
    return canGuestAccessBuilding(email, building);
  });
}

export function assertGuestCanAccessRoom(email, buildingName) {
  if (!canGuestAccessBuilding(email, buildingName)) {
    throw new Error('You do not have access to this room. External guests may only book Global Missions Center rooms.');
  }
}
