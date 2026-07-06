/** When room stays and venue events can still be cancelled. */

import { getFiscalYearSettings, formatCancellationPolicyLabel } from './fiscalYear.service.js';

export function localDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function combineDateTime(dateStr, timeStr) {
  const date = String(dateStr).slice(0, 10);
  const raw = String(timeStr || '00:00:00').trim();
  const time = /^\d{1,2}:\d{2}$/.test(raw) ? `${raw}:00` : raw.slice(0, 8);
  return new Date(`${date}T${time}`);
}

export function daysUntilDate(targetDateStr, todayStr = localDateStr()) {
  const target = new Date(`${String(targetDateStr).slice(0, 10)}T00:00:00`);
  const today = new Date(`${todayStr}T00:00:00`);
  return Math.round((target - today) / 86400000);
}

export function hoursUntilCheckIn(checkIn, now = new Date()) {
  const start = new Date(`${String(checkIn).slice(0, 10)}T00:00:00`);
  return (start - now) / 3600000;
}

export function hoursUntilEventStart(eventDate, startTime, now = new Date()) {
  const start = combineDateTime(eventDate, startTime);
  return (start - now) / 3600000;
}

/** @returns {'upcoming'|'active'|'past'} */
export function roomStayPhase(checkIn, checkOut, todayStr = localDateStr()) {
  const ci = String(checkIn).slice(0, 10);
  const co = String(checkOut).slice(0, 10);
  if (todayStr > co) return 'past';
  if (todayStr >= ci) return 'active';
  return 'upcoming';
}

/** @returns {'upcoming'|'active'|'past'} */
export function venueEventPhase(eventDate, startTime, endTime, now = new Date()) {
  const start = combineDateTime(eventDate, startTime);
  const end = combineDateTime(eventDate, endTime);
  if (now > end) return 'past';
  if (now >= start) return 'active';
  return 'upcoming';
}

export function cutoffHoursError(cutoffHours, action = 'Cancellations') {
  const hours = Number(cutoffHours);
  if (hours <= 0) return null;
  if (hours === 1) return `${action} must be made at least 1 hour before check-in or the event start.`;
  return `${action} must be made at least ${hours} hours before check-in or the event start.`;
}

export function assertCanCancelRoomBooking({
  status, check_in, check_out, isAdmin = false, cutoffHours = 0,
}) {
  const s = String(status || '');
  if (s === 'Cancelled' || s === 'Rejected') {
    return 'This reservation is already closed.';
  }
  const phase = roomStayPhase(check_in, check_out);
  if (phase === 'past') return 'Cannot cancel — this stay has already ended.';
  if (phase === 'active') return 'Cannot cancel — this stay is in progress.';

  if (!isAdmin) {
    if (!['Pending', 'Approved'].includes(s)) {
      return 'Only pending or approved reservations can be cancelled.';
    }
    if (hoursUntilCheckIn(check_in) < cutoffHours) {
      return cutoffHoursError(cutoffHours);
    }
  } else if (!['Pending', 'Approved'].includes(s)) {
    return 'Only pending or approved reservations can be cancelled.';
  }
  return null;
}

export function assertCanCancelVenueBooking({
  status, event_date, start_time, end_time, isAdmin = false, cutoffHours = 0,
}) {
  const s = String(status || '');
  if (s === 'Cancelled' || s === 'Rejected') {
    return 'This booking is already closed.';
  }
  const phase = venueEventPhase(event_date, start_time, end_time);
  if (phase === 'past') return 'Cannot cancel — this event has already ended.';
  if (phase === 'active') return 'Cannot cancel — this event is in progress.';

  if (!isAdmin) {
    if (!['Pending', 'Approved'].includes(s)) {
      return 'Only pending or approved bookings can be cancelled.';
    }
    if (hoursUntilEventStart(event_date, start_time) < cutoffHours) {
      return cutoffHoursError(cutoffHours);
    }
  } else if (!['Pending', 'Approved'].includes(s)) {
    return 'Only pending or approved bookings can be cancelled.';
  }
  return null;
}

export function assertCanModifyRoomBooking({
  status, check_in, check_out, isAdmin = false, cutoffHours = 0,
}) {
  const s = String(status || '');
  if (s === 'Cancelled' || s === 'Rejected') {
    return 'This reservation is already closed.';
  }
  const phase = roomStayPhase(check_in, check_out);
  if (phase === 'past') return 'Cannot modify — this stay has already ended.';
  if (phase === 'active') return 'Cannot modify — this stay is in progress.';

  if (!isAdmin) {
    if (!['Pending', 'Approved'].includes(s)) {
      return 'Only pending or approved reservations can be modified.';
    }
    if (hoursUntilCheckIn(check_in) < cutoffHours) {
      return cutoffHoursError(cutoffHours, 'Changes');
    }
  } else if (!['Pending', 'Approved'].includes(s)) {
    return 'Only pending or approved reservations can be modified.';
  }
  return null;
}

export function assertCanModifyVenueBooking({
  status, event_date, start_time, end_time, isAdmin = false, cutoffHours = 0,
}) {
  const s = String(status || '');
  if (s === 'Cancelled' || s === 'Rejected') {
    return 'This booking is already closed.';
  }
  const phase = venueEventPhase(event_date, start_time, end_time);
  if (phase === 'past') return 'Cannot modify — this event has already ended.';
  if (phase === 'active') return 'Cannot modify — this event is in progress.';

  if (!isAdmin) {
    if (!['Pending', 'Approved'].includes(s)) {
      return 'Only pending or approved bookings can be modified.';
    }
    if (hoursUntilEventStart(event_date, start_time) < cutoffHours) {
      return cutoffHoursError(cutoffHours, 'Changes');
    }
  } else if (!['Pending', 'Approved'].includes(s)) {
    return 'Only pending or approved bookings can be modified.';
  }
  return null;
}

export async function getGuestCancellationCutoffHours() {
  const settings = await getFiscalYearSettings();
  return Number(settings.guest_cancellation_cutoff_hours);
}

/** @deprecated Use getGuestCancellationCutoffHours */
export async function getGuestCancellationCutoffDays() {
  const hours = await getGuestCancellationCutoffHours();
  return Math.ceil(hours / 24);
}

export async function getCancellationPolicyLabel() {
  const settings = await getFiscalYearSettings();
  return formatCancellationPolicyLabel(settings.guest_cancellation_cutoff_hours);
}
