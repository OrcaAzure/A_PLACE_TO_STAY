/** Shared approve / modify / decline actions for admin reservation flows. */

import {
  getRoomAvailability, suggestGroupRooms, updateBooking, updateGroup,
} from '/assets/js/services/api.js';

export function parseRequestKey(key) {
  if (String(key).startsWith('g-')) return { kind: 'group', id: key.slice(2) };
  if (String(key).startsWith('b-')) return { kind: 'single', id: key.slice(2) };
  return { kind: 'single', id: key };
}

export function requestKey(r) {
  return r.kind === 'group' ? `g-${r.id}` : `b-${r.id}`;
}

export async function approveSingleRequest(r) {
  const avail = await getRoomAvailability({
    check_in: r.schedule?.checkIn,
    check_out: r.schedule?.checkOut,
    guest_count: r.guestCount || 1,
    exclude_booking_id: r.id,
  });
  const room = (avail.rooms || []).find((x) => String(x.id) === String(r.roomId));
  if (!room || room.availability_status !== 'available') {
    throw new Error('The requested room is no longer available on these dates. Use Modify to pick another room.');
  }
  await updateBooking(r.id, { status: 'Approved', notify_guest: true });
}

export async function approveGroupRequest(r) {
  const data = await suggestGroupRooms({
    check_in: r.schedule?.checkIn,
    check_out: r.schedule?.checkOut,
    total_guests: r.totalGuests || 1,
    exclude_group_id: r.id,
  });
  if (!data.suggestion?.length) {
    throw new Error('Could not auto-assign rooms for this group. Use Modify to pick rooms manually.');
  }
  const rooms = data.suggestion.map((s) => ({
    room_id: s.room_id,
    guest_count: s.guest_count,
  }));
  await updateGroup(r.id, {
    status: 'Approved',
    rooms,
    notify_guest: true,
  });
}

export async function approveRequest(r) {
  if (r.kind === 'group') await approveGroupRequest(r);
  else await approveSingleRequest(r);
}

export async function rejectSingleRequest(r, note = '') {
  const notes = note
    ? `${r.notes ? r.notes + '\n' : ''}[Rejected] ${note}`
    : r.notes;
  await updateBooking(r.id, { status: 'Rejected', notes });
}

export async function rejectGroupRequest(r, note = '') {
  const notes = note
    ? `${r.notes ? r.notes + '\n' : ''}[Rejected] ${note}`
    : r.notes;
  await updateGroup(r.id, { status: 'Rejected', notes });
}

export async function rejectRequest(r, note = '') {
  if (r.kind === 'group') await rejectGroupRequest(r, note);
  else await rejectSingleRequest(r, note);
}

export function openModifyRequestWizard(r, { modifyRequest = true } = {}) {
  if (r.kind === 'group') {
    window.dispatchEvent(new CustomEvent('group-wizard:open', {
      detail: {
        fromRequestId: r.id,
        modifyRequest,
        prefill: {
          groupName: r.groupName,
          contactName: r.requester?.name,
          contactPhone: r.contactPhone,
          email: r.requester?.email,
          checkIn: r.schedule?.checkIn,
          checkOut: r.schedule?.checkOut,
          totalGuests: r.totalGuests,
          roomsRequested: r.roomsRequested,
          notes: r.notes,
          userId: r.userId,
        },
        originalRequest: {
          checkIn: r.schedule?.checkIn,
          checkOut: r.schedule?.checkOut,
          roomsRequested: r.roomsRequested,
        },
      },
    }));
  } else {
    window.dispatchEvent(new CustomEvent('reservation-wizard:open', {
      detail: {
        fromRequestId: r.id,
        modifyRequest,
        prefill: {
          userId: r.userId,
          guestName: r.requester?.name,
          email: r.requester?.email,
          contactPhone: r.contactPhone,
          checkIn: r.schedule?.checkIn,
          checkOut: r.schedule?.checkOut,
          guestCount: r.guestCount,
          roomId: r.roomId,
          notes: r.notes,
          facility: r.facility,
        },
        originalRequest: {
          roomId: r.roomId,
          checkIn: r.schedule?.checkIn,
          checkOut: r.schedule?.checkOut,
          building: r.facility?.building,
          roomNumber: r.facility?.roomNumber,
          roomLabel: [r.facility?.building, r.facility?.roomNumber].filter(Boolean).join(' '),
        },
      },
    }));
  }
}

export function notifyBookingUpdated() {
  window.dispatchEvent(new CustomEvent('booking:updated'));
}
