/** Metadata for GMC A-block conference spaces (room code is the staff booking ID). */
export const GMC_ABLOCK_VENUE_META = {
  'A-101': {
    name: 'Russ Turney Educational Center',
    description: 'Large educational and meeting hall on the A-block.',
  },
  'A-504': {
    name: 'Classroom Multi-Purpose Room',
    description: 'Multi-purpose classroom space.',
  },
  'A-505': {
    name: 'Classroom Multi-Purpose Room',
    description: 'Multi-purpose classroom space.',
  },
  'A-506': {
    name: 'Conference Room',
    description: 'Conference room on the A-block.',
  },
  'A-507': {
    name: 'Conference Room',
    description: 'Conference room on the A-block (formerly A-105).',
  },
};

export const FACILITY_GROUP_ICONS = {
  'GMC Conference Rooms': 'school',
  'GMC Chapel': 'church',
  'Burdine Commons': 'groups',
  Garden: 'park',
  'Prayer Mountain': 'landscape',
  'Prayer Tower': 'water_lux',
  Recreation: 'sports_basketball',
  'Childrens Playground': 'child_care',
  'Recreational Center': 'fitness_center',
};

/** Display label: room code first when present, then the facility name. */
export function formatFacilityLabel({ room_code, name, package_name } = {}) {
  const title = name || package_name || 'Facility';
  if (room_code && name) return `${room_code} — ${name}`;
  if (room_code) return room_code;
  if (package_name && name && package_name !== name) return `${name} (${package_name})`;
  return title;
}
