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

export function cutoffDaysError(cutoffDays) {
  const days = Number(cutoffDays);
  if (days <= 0) return null;
  if (days === 1) return 'Cancellations must be made at least 1 day before check-in or the event date.';
  return `Cancellations must be made at least ${days} days before check-in or the event date.`;
}

export function assertCanCancelRoomBooking({
  status, check_in, check_out, isAdmin = false, cutoffDays = 0,
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
    const daysUntil = daysUntilDate(check_in);
    if (daysUntil < cutoffDays) {
      return cutoffDaysError(cutoffDays);
    }
  } else if (!['Pending', 'Approved'].includes(s)) {
    return 'Only pending or approved reservations can be cancelled.';
  }
  return null;
}

export function assertCanCancelVenueBooking({
  status, event_date, start_time, end_time, isAdmin = false, cutoffDays = 0,
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
    const daysUntil = daysUntilDate(event_date);
    if (daysUntil < cutoffDays) {
      return cutoffDaysError(cutoffDays);
    }
  } else if (!['Pending', 'Approved'].includes(s)) {
    return 'Only pending or approved bookings can be cancelled.';
  }
  return null;
}

export async function getGuestCancellationCutoffDays() {
  const settings = await getFiscalYearSettings();
  return Number(settings.guest_cancellation_cutoff_days);
}

export async function getCancellationPolicyLabel() {
  const settings = await getFiscalYearSettings();
  return formatCancellationPolicyLabel(settings.guest_cancellation_cutoff_days);
}
