/** Shared approve / modify / decline / cancel actions for reservation flows. */

import {
  getRoomAvailability, suggestGroupRooms, updateBooking, updateGroup, updateFacilityBooking,
} from '/assets/js/services/api.js';
import { escapeHtml, normStatus, formatMoney, formatDateLong, collectStayInvoiceSummary } from '/assets/js/features/reservation-shared.js';
import { confirmModal, openModal, closeModal, showAlertModal } from '/assets/js/layout/ui.js';

export function parseRequestKey(key) {
  if (String(key).startsWith('g-')) return { kind: 'group', id: key.slice(2) };
  if (String(key).startsWith('b-')) return { kind: 'single', id: key.slice(2) };
  return { kind: 'single', id: key };
}

export function requestKey(r) {
  return r.kind === 'group' ? `g-${r.id}` : `b-${r.id}`;
}

function requestGuestName(r) {
  if (r.kind === 'group') return r.groupName || r.requester?.name || 'Group';
  return r.requester?.name || r.title || 'Guest';
}

function requestEstimate(r) {
  const amount = r.kind === 'group' ? r.grandTotal : r.totalAmount;
  return amount != null ? formatMoney(amount) : null;
}

export function promptApproveReservation(r) {
  const guestName = escapeHtml(requestGuestName(r));
  const estimate = requestEstimate(r);
  const isGroup = r.kind === 'group';

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      closeModal();
      resolve(value);
    };

    const estimateHtml = estimate
      ? `<p class="res-hint">Total due: <strong>${estimate}</strong></p>`
      : '';
    const body = `
      <p class="res-lead">Approve ${isGroup ? 'this group reservation' : 'this reservation'} for <strong>${guestName}</strong>? The guest will be notified by email.</p>
      ${estimateHtml}
      <div class="flex justify-end gap-3 mt-6 pt-5 border-t border-outline-variant">
        <button type="button" class="px-4 py-2.5 rounded-lg border border-outline-variant text-on-surface-variant font-semibold text-sm hover:bg-surface-variant/30 transition-colors min-h-[2.75rem]" data-action="cancel">Cancel</button>
        <button type="button" class="btn-primary px-5 py-2.5 min-h-[2.75rem]" data-action="confirm">Approve &amp; notify guest</button>
      </div>`;

    requestAnimationFrame(() => {
      openModal('Approve reservation', body);
      const modalBody = document.getElementById('modalBody');
      modalBody?.querySelector('[data-action="cancel"]')?.addEventListener('click', () => finish(null));
      modalBody?.querySelector('[data-action="confirm"]')?.addEventListener('click', () => finish(true));
    });
  });
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
  await updateBooking(r.id, {
    status: 'Approved',
    notify_guest: true,
  });
}

export async function approveGroupRequest(r) {
  if (r.assignedBookings?.length) {
    const rooms = r.assignedBookings.map((b) => ({
      room_id: Number(b.room_id),
      guest_count: Math.max(1, Number(b.guestCount ?? b.guest_count) || 1),
    }));
    await updateGroup(r.id, {
      status: 'Approved',
      rooms,
      notify_guest: true,
    });
    return;
  }

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
  const confirmed = await promptApproveReservation(r);
  if (!confirmed) return false;
  if (r.kind === 'group') await approveGroupRequest(r);
  else await approveSingleRequest(r);
  return true;
}

export async function rejectSingleRequest(r, note = '') {
  const notes = note
    ? `${r.notes ? `${r.notes}\n` : ''}[Rejected] ${note}`
    : r.notes;
  await updateBooking(r.id, { status: 'Rejected', notes });
}

export async function rejectGroupRequest(r, note = '') {
  const notes = note
    ? `${r.notes ? `${r.notes}\n` : ''}[Rejected] ${note}`
    : r.notes;
  await updateGroup(r.id, { status: 'Rejected', notes });
}

export async function rejectRequest(r, note = '') {
  if (r.kind === 'group') await rejectGroupRequest(r, note);
  else await rejectSingleRequest(r, note);
}

export async function cancelRoomReservation(id, { kind = 'single' } = {}) {
  if (kind === 'group') return updateGroup(id, { status: 'Cancelled' });
  return updateBooking(id, { status: 'Cancelled' });
}

export async function cancelVenueReservation(id) {
  return updateFacilityBooking(id, { status: 'Cancelled' });
}

/**
 * Shared confirmation dialog for cancelling reservations.
 * `message` is HTML — escape dynamic values before passing.
 */
export async function confirmCancelReservation({
  title,
  message,
  confirmLabel = 'Cancel reservation',
  cancelLabel = 'Keep reservation',
} = {}) {
  return confirmModal({
    title: title || 'Cancel reservation?',
    message: message || 'Are you sure you want to cancel this reservation? This cannot be undone.',
    confirmLabel,
    cancelLabel,
    danger: true,
  });
}

export function buildGuestCancelMessage(booking, { pending = false } = {}) {
  const label = escapeHtml(
    booking.facilityLabel || booking.title || booking.venueName || `reservation #${booking.id}`
  );
  const pendingText = pending
    ? 'This will withdraw your pending request.'
    : 'This cannot be undone.';
  return `Are you sure you want to cancel <strong>${label}</strong>? ${pendingText}`;
}

export function buildAdminCancelMessage(label, { pending = false } = {}) {
  const pendingText = pending
    ? 'The guest will no longer see this as an open request.'
    : 'The reservation will be marked cancelled and kept on file.';
  return `Are you sure you want to cancel <strong>${escapeHtml(label)}</strong>? ${pendingText}`;
}

export async function confirmGuestCancelReservation(booking) {
  const pending = normStatus(booking.status) === 'pending';
  const isGroup = booking.kind === 'group';
  const isVenue = booking.kind === 'venue';
  return confirmCancelReservation({
    title: pending
      ? 'Cancel request?'
      : (isVenue ? 'Cancel venue booking?' : (isGroup ? 'Cancel group reservation?' : 'Cancel reservation?')),
    message: buildGuestCancelMessage(booking, { pending }),
    confirmLabel: pending ? 'Cancel request' : 'Cancel reservation',
  });
}

export async function confirmAdminCancelReservation(label, { pending = false } = {}) {
  return confirmCancelReservation({
    title: pending ? 'Cancel request?' : 'Cancel reservation?',
    message: buildAdminCancelMessage(label, { pending }),
    confirmLabel: pending ? 'Cancel request' : 'Cancel reservation',
  });
}

export async function confirmDeclineRequest(label) {
  return confirmModal({
    title: 'Decline request?',
    message: `Are you sure you want to decline <strong>${escapeHtml(label)}</strong>? The guest will be notified that this request was not approved.`,
    confirmLabel: 'Decline request',
    cancelLabel: 'Keep request',
    danger: true,
  });
}

function stayRecordLabel(item) {
  if (item.kind === 'group') return item.group_name || item.contact_name || 'Group';
  return item.guest_name || item.guestName || 'Guest';
}

function buildInvoiceDeleteNotices(summary) {
  const parts = [];
  if (summary.hasPaid) {
    const lines = summary.paid.map((inv) =>
      `${escapeHtml(inv.label)}: ${formatMoney(inv.amount)} paid`
    ).join('<br>');
    parts.push(`<p class="res-hint res-hint--warn"><strong>Paid housing invoice:</strong> ${lines}. You must clear paid invoice(s) in <strong>Billing</strong> before this record can be deleted.</p>`);
  }
  if (summary.hasPending) {
    const lines = summary.pending.map((inv) =>
      `${escapeHtml(inv.label)}: ${formatMoney(inv.amount)} pending`
    ).join('<br>');
    parts.push(`<p class="res-hint">Any <strong>unpaid</strong> housing invoice(s) for this stay will also be removed:<br>${lines}</p>`);
  }
  return parts.join('');
}

export function buildAdminDeleteStayMessage(item) {
  const isGroup = item.kind === 'group';
  const name = escapeHtml(stayRecordLabel(item));
  const status = escapeHtml(normStatus(item.status));
  const dates = `${escapeHtml(formatDateLong(item.check_in || item.startDate))} → ${escapeHtml(formatDateLong(item.check_out || item.endDate))}`;
  const total = item.grand_total != null
    ? formatMoney(item.grand_total)
    : (item.total_amount != null ? formatMoney(item.total_amount) : '—');
  const summary = collectStayInvoiceSummary(item);
  const invoiceNotices = buildInvoiceDeleteNotices(summary);

  const scopeNote = isGroup
    ? '<p class="res-hint">All <strong>assigned room records</strong> for this group will be permanently removed.</p>'
    : (item.room_number
      ? `<p class="res-hint">The room assignment (<strong>${escapeHtml([item.building_name, item.room_number].filter(Boolean).join(' '))}</strong>) will be unlinked. Deleting cancelled records may allow removing the room in Facilities later.</p>`
      : '');

  return `
    <p>Permanently delete the reservation record for <strong>${name}</strong>?</p>
    <ul class="res-delete-summary">
      <li><strong>Status:</strong> ${status}</li>
      <li><strong>Stay:</strong> ${dates}</li>
      <li><strong>Total on file:</strong> ${total}</li>
    </ul>
    ${scopeNote}
    ${invoiceNotices}
    <p class="res-hint res-hint--warn"><strong>This cannot be undone.</strong> Calendar and reporting will no longer show this stay. The guest will not be emailed.</p>`;
}

export function buildAdminDeleteVenueMessage(item) {
  const name = escapeHtml(item.guestName || 'Guest');
  const status = escapeHtml(normStatus(item.status));
  const when = `${escapeHtml(formatDateLong(item.eventDate))} · ${escapeHtml(item.startLabel || '')} – ${escapeHtml(item.endLabel || '')}`;
  const total = item.totalAmount != null ? formatMoney(item.totalAmount) : '—';

  return `
    <p>Permanently delete the venue booking record for <strong>${name}</strong>?</p>
    <ul class="res-delete-summary">
      <li><strong>Status:</strong> ${status}</li>
      <li><strong>Event:</strong> ${escapeHtml(item.venueName || 'Venue')} — ${when}</li>
      <li><strong>Total on file:</strong> ${total}</li>
    </ul>
    <p class="res-hint"><strong>This cannot be undone.</strong> The event will disappear from the calendar and venue schedule. The guest will not be emailed.</p>`;
}

export async function confirmAdminDeleteStayRecord(item) {
  const summary = collectStayInvoiceSummary(item);
  if (summary.hasPaid) {
    return false;
  }
  const isGroup = item.kind === 'group';
  return confirmModal({
    title: isGroup ? 'Delete group record?' : 'Delete reservation record?',
    message: buildAdminDeleteStayMessage(item),
    confirmLabel: 'Delete permanently',
    cancelLabel: 'Keep record',
    danger: true,
  });
}

export async function confirmAdminDeleteVenueRecord(item) {
  return confirmModal({
    title: 'Delete venue booking record?',
    message: buildAdminDeleteVenueMessage(item),
    confirmLabel: 'Delete permanently',
    cancelLabel: 'Keep record',
    danger: true,
  });
}

export async function alertPaidInvoiceBlocksDelete(item) {
  const summary = collectStayInvoiceSummary(item);
  const paidLines = summary.paid.map((inv) =>
    `• ${inv.label}: ${formatMoney(inv.amount)}`
  ).join('\n');
  await showAlertModal(
    'Cannot delete — paid invoice on file',
    `This stay has a paid housing invoice that must be cleared in Billing first:\n\n${paidLines}\n\nOpen Billing → find the paid invoice → Clear invoice. Then return here to delete the reservation record.`,
  );
}

export function openModifyRequestWizard(r, { modifyRequest = true } = {}) {
  window.dispatchEvent(new CustomEvent('manage-requests:close'));

  if (r.kind === 'group') {
    window.dispatchEvent(new CustomEvent('group-wizard:open', {
      detail: {
        fromRequestId: r.id,
        modifyRequest,
        originalRequest: {
          checkIn: r.schedule?.checkIn,
          checkOut: r.schedule?.checkOut,
          roomsRequested: r.roomsRequested,
          roomCount: r.roomCount || r.assignedBookings?.length || 0,
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
          meals: r.meals,
          fees: r.fees,
          mealAllergenNotes: r.mealAllergenNotes,
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

export function openGuestModifyWizard(booking) {
  const guestWasApproved = normStatus(booking.status) === 'approved';
  if (booking.kind === 'group') {
    window.dispatchEvent(new CustomEvent('group-wizard:open', {
      detail: {
        mode: 'edit',
        groupId: booking.id,
        guestModify: true,
        guestWasApproved,
      },
    }));
  } else {
    window.dispatchEvent(new CustomEvent('reservation-wizard:open', {
      detail: {
        mode: 'edit',
        bookingId: booking.id,
        guestModify: true,
        guestWasApproved,
      },
    }));
  }
}

export function openModifyVenueWizard(booking, { modifyRequest = false } = {}) {
  window.dispatchEvent(new CustomEvent('venue-booking-wizard:open', {
    detail: {
      mode: modifyRequest ? 'create' : 'edit',
      bookingId: modifyRequest ? null : booking.id,
      fromRequestId: modifyRequest ? booking.id : null,
      modifyRequest,
      category: booking.venueCategory || booking.facility_category || booking.category,
      item: booking.item,
      prefill: {
        userId: booking.userId || booking.user_id,
        guestName: booking.guestName || booking.guest_name,
        email: booking.guestEmail || booking.guest_email || booking.email,
        contactPhone: booking.contactPhone || booking.contact_phone,
        facilityId: booking.facilityId || booking.facility_id,
        eventDate: booking.eventDate || booking.event_date,
        startTime: booking.startTime || booking.start_time,
        endTime: booking.endTime || booking.end_time,
        guestCount: booking.guestCount || booking.guest_count,
        notes: booking.notes,
      },
    },
  }));
}

export function openAdminEditVenueWizard(booking) {
  openModifyVenueWizard(booking, { modifyRequest: false });
}

export function notifyBookingUpdated() {
  window.dispatchEvent(new CustomEvent('booking:updated'));
}
