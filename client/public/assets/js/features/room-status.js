/**
 * Room housekeeping statuses — DB values stay stable; labels match admin workflow.
 */

export const ROOM_STATUS_VALUES = ['Available', 'Occupied', 'Dirty', 'Maintenance'];

/** @type {Record<string, { value: string, label: string, shortLabel: string, icon: string, tone: string, bookable: boolean }>} */
export const ROOM_STATUS = {
  Available: {
    value: 'Available',
    label: 'Vacant',
    shortLabel: 'Vacant',
    icon: 'check_circle',
    tone: 'vacant',
    bookable: true,
  },
  Occupied: {
    value: 'Occupied',
    label: 'Occupied',
    shortLabel: 'Occupied',
    icon: 'hotel',
    tone: 'occupied',
    bookable: false,
  },
  Dirty: {
    value: 'Dirty',
    label: 'Check-out / dirty',
    shortLabel: 'Dirty',
    icon: 'cleaning_services',
    tone: 'dirty',
    bookable: false,
  },
  Maintenance: {
    value: 'Maintenance',
    label: 'Out of order',
    shortLabel: 'Out of order',
    icon: 'block',
    tone: 'out-of-order',
    bookable: false,
  },
};

export function roomStatusMeta(status) {
  return ROOM_STATUS[status] || ROOM_STATUS.Available;
}

export function roomStatusLabel(status, { short = false } = {}) {
  const meta = roomStatusMeta(status);
  return short ? meta.shortLabel : meta.label;
}

export function isRoomBookableStatus(status) {
  return roomStatusMeta(status).bookable;
}

export function roomStatusOptions() {
  return ROOM_STATUS_VALUES.map((value) => ({
    value,
    ...ROOM_STATUS[value],
  }));
}
