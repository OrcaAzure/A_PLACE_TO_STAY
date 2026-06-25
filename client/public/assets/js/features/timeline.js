/**
 * Reservation Master Timeline — simple upcoming list + optional room calendar.
 */
import { openModal, closeModal, syncTimelineScroll, scrollTimelineToToday } from '/assets/js/layout/ui.js';
import { getRooms, getBookings, normalizeRoom, normalizeBooking, normalizeManageRequest } from '/assets/js/services/api.js';
import {
  approveRequest, rejectRequest, openModifyRequestWizard, notifyBookingUpdated,
} from '/assets/js/features/booking-actions.js';
import {
  escapeHtml, formatDate, formatDateLong, formatMoney, normStatus, stayNights,
} from '/assets/js/features/reservation-shared.js';

export const DAY_WIDTH = 80;

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_EVENTS_PER_DAY = 3;

export function getMonthRange(year, month) {
  const days = new Date(year, month + 1, 0).getDate();
  const dates = [];
  for (let d = 1; d <= days; d++) dates.push(new Date(year, month, d));
  return dates;
}

const CALENDAR_DAYS = 56;
const CALENDAR_SHIFT = 28;
const AGENDA_HORIZONS = { short: 14, medium: 60, long: 180 };

/** Rolling date window for the room calendar (default 8 weeks). */
export function getDateRangeFrom(startDate, dayCount = CALENDAR_DAYS) {
  const start = new Date(`${dateOnly(startDate)}T00:00:00`);
  const dates = [];
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(d);
  }
  return dates;
}

function startOfWeek(date) {
  const d = new Date(`${dateOnly(date)}T00:00:00`);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function formatRangeLabel(rangeStart, rangeEnd) {
  return `${formatDateLong(rangeStart)} – ${formatDateLong(rangeEnd)}`;
}

function dateOnly(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export function dateToCol(dateValue, rangeStart) {
  const d = new Date(`${dateOnly(dateValue)}T00:00:00`);
  const start = new Date(`${dateOnly(rangeStart)}T00:00:00`);
  return Math.round((d - start) / 86400000) + 1;
}

function overlapsRange(startDate, endDate, rangeStart, rangeEnd) {
  const s = dateOnly(startDate);
  const e = dateOnly(endDate);
  const rs = dateOnly(rangeStart);
  const re = dateOnly(rangeEnd);
  return s <= re && e >= rs;
}

export function renderDayHeaders(dates, today = new Date()) {
  const todayStr = today.toISOString().slice(0, 10);
  return dates.map((d) => {
    const iso = d.toISOString().slice(0, 10);
    const isToday = iso === todayStr;
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const cls = isToday
      ? 'tl-day tl-day--today'
      : isWeekend
        ? 'tl-day tl-day--weekend'
        : 'tl-day';
    const monthLabel = isToday ? 'TODAY' : (d.getDate() === 1 ? MONTHS[d.getMonth()] : MONTHS[d.getMonth()]);
    const dayNum = String(d.getDate()).padStart(2, '0');
    return `
      <div class="${cls}">
        <span class="tl-day-month">${monthLabel}</span>
        <span class="tl-day-num">${dayNum}</span>
      </div>`;
  }).join('');
}

function statusPillClass(status) {
  const s = (status || '').toLowerCase();
  if (s === 'approved' || s === 'confirmed') return 'status-pill-approved';
  if (s === 'pending') return 'status-pill-pending';
  if (s === 'rejected' || s === 'cancelled') return 'status-pill-occupied';
  if (s === 'maintenance') return 'status-pill-maintenance';
  if (s === 'reserved') return 'status-pill-reserved';
  if (s === 'occupied') return 'status-pill-occupied';
  if (s === 'available') return 'status-pill-available';
  return 'status-pill-pending';
}

function borderAccent(status) {
  const s = (status || '').toLowerCase();
  if (s === 'maintenance') return 'border-l-purple-500';
  if (s === 'pending') return 'border-l-amber-500';
  if (s === 'rejected' || s === 'cancelled') return 'border-l-error';
  if (s === 'approved') return 'border-l-emerald-600';
  return 'border-l-secondary';
}

function statusLabel(status) {
  const s = normStatus(status);
  if (s === 'approved') return 'Confirmed';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function renderBookingBar(booking, rangeStart, totalDays) {
  const colStart = dateToCol(booking.startDate, rangeStart);
  const colEnd = dateToCol(booking.endDate, rangeStart) + 1;
  if (colEnd <= 1 || colStart > totalDays) return '';

  const clampedStart = Math.max(1, colStart);
  const pill = statusPillClass(booking.status);
  const accent = borderAccent(booking.status);
  const label = statusLabel(booking.status);
  const guest = booking.guestName || booking.title || 'Guest';
  const nights = stayNights(booking.startDate, booking.endDate);
  const pending = normStatus(booking.status) === 'pending';

  return `
    <div class="gantt-booking-bar" style="grid-column: ${clampedStart} / ${Math.min(colEnd, totalDays + 1)}">
      <div class="tl-bar ${pill} ${pending ? 'tl-bar--pending' : ''} ${accent} border-l-4"
           data-booking-id="${booking.id}" role="button" tabindex="0"
           aria-label="${escapeHtml(guest)}, ${label}, ${formatDate(booking.startDate)} to ${formatDate(booking.endDate)}">
        <span class="tl-bar-guest">${escapeHtml(guest)}</span>
        <span class="tl-bar-meta">
          <span class="tl-bar-status">${escapeHtml(label)}</span>
          ${nights ? `<span class="tl-bar-nights">${nights}n</span>` : ''}
        </span>
        <span class="tl-bar-dates">${formatDate(booking.startDate)} – ${formatDate(booking.endDate)}</span>
      </div>
    </div>`;
}

function roomStatusDot(status) {
  const s = (status || '').toLowerCase();
  if (s === 'maintenance') return 'tl-room-dot tl-room-dot--maint';
  if (s === 'occupied') return 'tl-room-dot tl-room-dot--busy';
  return 'tl-room-dot tl-room-dot--ready';
}

export function renderTimelineRow(room, barsHtml, todayCol, totalDays, { hasBookings = true } = {}) {
  const todayLine = todayCol
    ? `<div class="gantt-today-line" style="--today-col: ${todayCol}"></div>`
    : '';
  const vacantCls = hasBookings ? '' : ' tl-row--vacant';

  return `
    <div class="gantt-container tl-row group border-b border-outline-variant/10 hover:bg-surface-container-low/10 transition-colors${vacantCls}">
      <div class="tl-room-label p-4 border-r border-outline-variant/20 flex flex-col justify-center min-h-[72px]">
        <div class="flex items-center gap-2">
          <span class="${roomStatusDot(room.status)}" aria-hidden="true"></span>
          <span class="text-body-md font-bold text-on-surface">${escapeHtml(room.building)} ${escapeHtml(room.roomNumber)}</span>
        </div>
        <span class="text-[10px] font-medium text-on-surface-variant/60 uppercase mt-1">${escapeHtml(room.roomType || 'Room')}</span>
        ${room.status === 'Maintenance' ? '<span class="tl-room-maint-tag">Maintenance</span>' : ''}
      </div>
      <div class="timeline-scroll tl-scroll-visible w-full">
        <div class="gantt-grid relative py-3" style="--timeline-days: ${totalDays}">
          ${barsHtml}
          ${todayLine}
        </div>
      </div>
    </div>`;
}

function renderSimpleSummary(stats) {
  const parts = [];
  if (stats.pending > 0) {
    parts.push(`<strong>${stats.pending}</strong> need${stats.pending === 1 ? 's' : ''} your approval`);
  }
  if (stats.inMonth > 0) parts.push(`<strong>${stats.inMonth}</strong> this month`);
  if (!parts.length) return 'Tap a reservation to see full details.';
  return parts.join(' · ') + '. Tap any reservation to see full details.';
}

function buildMonthWeeks(year, month, todayStr) {
  const weeks = [];
  const gridStart = new Date(year, month, 1);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());

  const gridEnd = new Date(year, month + 1, 0);
  gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));

  const cursor = new Date(gridStart);
  while (cursor <= gridEnd) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(cursor);
      week.push({
        iso: dateOnly(d),
        dayNum: d.getDate(),
        inMonth: d.getMonth() === month,
        isToday: dateOnly(d) === todayStr,
        isWeekend: d.getDay() === 0 || d.getDay() === 6,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

function activeBookings(bookings) {
  return bookings.filter((b) => ['pending', 'approved'].includes(normStatus(b.status)));
}

function bookingsOnDay(bookings, iso) {
  return bookings
    .filter((b) => overlapsRange(b.startDate, b.endDate, iso, iso))
    .sort((a, b) => {
      const pa = normStatus(a.status) === 'pending' ? 0 : 1;
      const pb = normStatus(b.status) === 'pending' ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return String(a.guestName || a.title || '').localeCompare(String(b.guestName || b.title || ''));
    });
}

function eventStatusClass(status) {
  const s = normStatus(status);
  if (s === 'pending') return 'mac-event--pending';
  if (s === 'approved') return 'mac-event--confirmed';
  return 'mac-event--other';
}

function renderMonthEventChip(booking) {
  const guest = booking.guestName || booking.title || 'Guest';
  const room = [booking.buildingName, booking.roomNumber].filter(Boolean).join(' ');
  const label = room ? `${guest} · ${room}` : guest;
  return `
    <button type="button" class="mac-event ${eventStatusClass(booking.status)}"
            data-booking-id="${booking.id}" title="${escapeHtml(label)}">
      ${escapeHtml(label)}
    </button>`;
}

function renderMonthDayCell(day, dayBookings) {
  const visible = dayBookings.slice(0, MAX_EVENTS_PER_DAY);
  const overflow = dayBookings.length - visible.length;
  const dayCls = [
    'mac-day',
    !day.inMonth ? 'mac-day--outside' : '',
    day.isToday ? 'mac-day--today' : '',
    day.isWeekend && day.inMonth ? 'mac-day--weekend' : '',
  ].filter(Boolean).join(' ');

  const eventsHtml = visible.map(renderMonthEventChip).join('');
  const moreHtml = overflow > 0
    ? `<button type="button" class="mac-event-more" data-day-iso="${day.iso}">+${overflow} more</button>`
    : '';

  return `
    <div class="${dayCls}" data-day="${day.iso}">
      <span class="mac-day-num">${day.dayNum}</span>
      <div class="mac-day-events">${eventsHtml}${moreHtml}</div>
    </div>`;
}

function renderMonthCalendar(bookings, year, month, todayStr) {
  const weeks = buildMonthWeeks(year, month, todayStr);
  const active = activeBookings(bookings);
  const weekdayHeader = WEEKDAYS.map((d) =>
    `<div class="mac-weekday">${d}</div>`).join('');

  const weeksHtml = weeks.map((week) => {
    const daysHtml = week.map((day) =>
      renderMonthDayCell(day, bookingsOnDay(active, day.iso))).join('');
    return `<div class="mac-week">${daysHtml}</div>`;
  }).join('');

  return `
    <div class="mac-cal-grid" role="grid" aria-label="${MONTHS_FULL[month]} ${year}">
      <div class="mac-weekdays">${weekdayHeader}</div>
      ${weeksHtml}
    </div>`;
}

function countBookingsInMonth(bookings, year, month) {
  const monthStart = dateOnly(new Date(year, month, 1));
  const monthEnd = dateOnly(new Date(year, month + 1, 0));
  return activeBookings(bookings).filter((b) =>
    overlapsRange(b.startDate, b.endDate, monthStart, monthEnd)).length;
}

function bindMonthCalendar(root, { bookings, rawBookingsById, onRefresh }) {
  if (!root) return;

  root.querySelectorAll('[data-booking-id]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-booking-id');
      openBookingModal(rawBookingsById[String(id)], { onRefresh });
    });
  });

  root.querySelectorAll('[data-day-iso]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const iso = btn.getAttribute('data-day-iso');
      const dayBookings = bookingsOnDay(activeBookings(bookings), iso);
      const skipped = dayBookings.slice(MAX_EVENTS_PER_DAY);
      if (!skipped.length) return;

      const listHtml = skipped.map((b) => {
        const guest = b.guestName || b.title || 'Guest';
        const room = [b.buildingName, b.roomNumber].filter(Boolean).join(' ') || 'Room TBD';
        const st = normStatus(b.status) === 'pending' ? 'Needs approval' : 'Confirmed';
        return `
          <button type="button" class="mac-day-list-item" data-booking-id="${b.id}">
            <span class="mac-day-list-tag ${eventStatusClass(b.status)}">${st}</span>
            <strong>${escapeHtml(guest)}</strong>
            <span>${escapeHtml(room)} · ${formatDate(b.startDate)} – ${formatDate(b.endDate)}</span>
          </button>`;
      }).join('');

      openModal(formatDateLong(iso), `<div class="mac-day-list">${listHtml}</div>`);
      document.getElementById('modalBody')?.querySelectorAll('[data-booking-id]').forEach((el) => {
        el.addEventListener('click', () => {
          closeModal();
          openBookingModal(rawBookingsById[String(el.getAttribute('data-booking-id'))], { onRefresh });
        });
      });
    });
  });
}

export function renderTimelineShell({ title }) {
  return `
    <section class="mac-cal-shell" id="timeline-section">
      <header class="mac-cal-header">
        <div class="mac-cal-header-top">
          <div class="mac-cal-title-block">
            <h3 class="mac-cal-title">${escapeHtml(title)}</h3>
            <p class="mac-cal-summary" id="timeline-summary">Loading…</p>
          </div>
          <div class="mac-cal-nav">
            <button type="button" id="timeline-prev" class="mac-cal-nav-btn" aria-label="Previous month">
              <span class="material-symbols-outlined">chevron_left</span>
            </button>
            <h4 class="mac-cal-month" id="timeline-period">Loading…</h4>
            <button type="button" id="timeline-next" class="mac-cal-nav-btn" aria-label="Next month">
              <span class="material-symbols-outlined">chevron_right</span>
            </button>
            <button type="button" id="timeline-today" class="mac-cal-today-btn">Today</button>
          </div>
        </div>
        <div class="mac-cal-legend" aria-hidden="true">
          <span class="mac-legend-item"><span class="mac-legend-dot mac-legend-dot--pending"></span>Needs approval</span>
          <span class="mac-legend-item"><span class="mac-legend-dot mac-legend-dot--confirmed"></span>Confirmed</span>
        </div>
      </header>
      <div id="mac-cal-mount" class="mac-cal-body"></div>
    </section>`;
}

function computeStats(bookings, todayStr, year, month) {
  let pending = 0;
  bookings.forEach((b) => {
    if (normStatus(b.status) === 'pending' && dateOnly(b.endDate) >= todayStr) pending += 1;
  });
  const inMonth = countBookingsInMonth(bookings, year, month);
  return { pending, inMonth };
}

function filterBookings(bookings, { statusFilter, search, rangeStart, rangeEnd }) {
  const q = search.trim().toLowerCase();
  return bookings.filter((b) => {
    const st = normStatus(b.status);
    if (statusFilter === 'active' && !['pending', 'approved'].includes(st)) return false;
    if (statusFilter === 'pending' && st !== 'pending') return false;
    if (statusFilter === 'approved' && st !== 'approved') return false;
    if (statusFilter === 'rejected' && !['rejected', 'cancelled'].includes(st)) return false;

    if (!overlapsRange(b.startDate, b.endDate, rangeStart, rangeEnd)) return false;

    if (q) {
      const hay = [
        b.id, b.guestName, b.title, b.buildingName, b.roomNumber, b.facilityLabel, b.notes,
      ].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function renderTimeline({ rooms, items, rangeStart, dates, barRenderer, onBarClick, filters = {} }) {
  const totalDays = dates.length;
  const rangeEnd = dates[dates.length - 1].toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const todayCol = dates.findIndex((d) => d.toISOString().slice(0, 10) === today) + 1;

  const headerEl = document.getElementById('timeline-day-headers');
  if (headerEl) {
    headerEl.style.setProperty('--timeline-days', totalDays);
    headerEl.innerHTML = renderDayHeaders(dates);
  }

  const rowsEl = document.getElementById('timeline-rows');
  if (!rowsEl) return;

  const filteredItems = filterBookings(items, {
    statusFilter: filters.status || 'active',
    search: filters.search || '',
    rangeStart,
    rangeEnd,
  });

  const itemsByRoom = {};
  filteredItems.forEach((item) => {
    if (!item.roomId) return;
    const key = item.roomId;
    if (!itemsByRoom[key]) itemsByRoom[key] = [];
    itemsByRoom[key].push(item);
  });

  let visibleRooms = rooms;
  if (filters.building && filters.building !== 'all') {
    visibleRooms = visibleRooms.filter((r) => r.building === filters.building);
  }
  visibleRooms = visibleRooms.filter((room) => (itemsByRoom[room.id] || []).length > 0);

  visibleRooms = visibleRooms.sort((a, b) => {
    const ba = `${a.building} ${a.roomNumber}`;
    const bb = `${b.building} ${b.roomNumber}`;
    return ba.localeCompare(bb);
  });

  if (visibleRooms.length === 0) {
    rowsEl.innerHTML = `<div class="tl-empty">
      <span class="material-symbols-outlined tl-empty-icon">event_busy</span>
      <p class="tl-empty-title">No reservations in this date range</p>
      <p class="tl-empty-hint">Tap "Later dates" above to move forward in time.</p>
    </div>`;
    return;
  }

  rowsEl.innerHTML = visibleRooms.map((room) => {
    const roomItems = itemsByRoom[room.id] || [];
    const bars = roomItems.map((item) => barRenderer(item, rangeStart, totalDays)).join('');
    return renderTimelineRow(room, bars, todayCol, totalDays, { hasBookings: roomItems.length > 0 });
  }).join('');

  syncTimelineScroll();
  if (todayCol > 0) scrollTimelineToToday(todayCol);

  rowsEl.querySelectorAll('[data-booking-id]').forEach((el) => {
    const open = () => {
      const id = el.getAttribute('data-booking-id');
      const item = items.find((b) => String(b.id) === String(id));
      if (item) onBarClick(item);
    };
    el.addEventListener('click', open);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });
}

function renderUnassignedStrip(unassigned, onOpen) {
  const el = document.getElementById('timeline-unassigned');
  if (!el) return;
  if (!unassigned.length) {
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }
  el.classList.remove('hidden');
  el.innerHTML = `
    <div class="tl-unassigned">
      <div class="tl-unassigned-head">
        <span class="material-symbols-outlined">warning</span>
        <div>
          <strong>${unassigned.length} request${unassigned.length === 1 ? '' : 's'} need a room assigned</strong>
          <p>Tap one to open and use Modify to pick a room.</p>
        </div>
      </div>
      <div class="tl-unassigned-list">
        ${unassigned.map((b) => `
          <button type="button" class="tl-unassigned-chip" data-unassigned-id="${b.id}">
            <span class="tl-unassigned-id">#APT-${b.id}</span>
            <span>${escapeHtml(b.guestName || 'Guest')}</span>
            <span class="tl-unassigned-dates">${formatDate(b.startDate)} – ${formatDate(b.endDate)}</span>
          </button>`).join('')}
      </div>
    </div>`;

  el.querySelectorAll('[data-unassigned-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-unassigned-id');
      const raw = unassigned.find((x) => String(x.id) === String(id));
      if (raw) onOpen(raw);
    });
  });
}

function renderDetailRow(label, value) {
  if (value == null || value === '') return '';
  return `
    <div class="tl-detail-row">
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>`;
}

function renderDetailSection(title, rowsHtml) {
  if (!rowsHtml.trim()) return '';
  return `
    <section class="tl-detail-section">
      <h4 class="tl-detail-section-title">${escapeHtml(title)}</h4>
      <dl class="tl-detail-dl">${rowsHtml}</dl>
    </section>`;
}

function renderBookingStatusBadge(status) {
  const pill = statusPillClass(status);
  const label = statusLabel(status);
  return `<span class="inline-flex items-center text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full ${pill}">${escapeHtml(label)}</span>`;
}

function renderBookingDetailBody(rawBooking, { mode = 'view', actionError = '', actionBusy = false } = {}) {
  const booking = normalizeManageRequest(rawBooking);
  const facilityLabel = `${booking.facility.building} — ${booking.facility.roomNumber}`;
  const nights = stayNights(booking.schedule.checkIn, booking.schedule.checkOut);
  const pending = normStatus(booking.status) === 'pending';

  const reservationRows = [
    renderDetailRow('Status', statusLabel(booking.status)),
    renderDetailRow('Check-in', formatDateLong(booking.schedule.checkIn)),
    renderDetailRow('Check-out', formatDateLong(booking.schedule.checkOut)),
    nights ? renderDetailRow('Length of stay', `${nights} night${nights === 1 ? '' : 's'}`) : '',
    renderDetailRow('Facility', facilityLabel),
    renderDetailRow('Room type', booking.facility.roomType),
    renderDetailRow('Guests', booking.guestCount),
    renderDetailRow('Season', booking.season),
    renderDetailRow('Rate type', booking.occupancyItem),
    booking.totalAmount != null && booking.totalAmount > 0
      ? renderDetailRow('Amount', formatMoney(booking.totalAmount))
      : '',
  ].join('');

  const requesterRows = [
    renderDetailRow('Name', booking.requester.name),
    renderDetailRow('Email', booking.requester.email),
    renderDetailRow('Phone', booking.contactPhone),
    renderDetailRow('Role', booking.requester.role),
  ].join('');

  if (mode === 'reject') {
    return `
      <div class="tl-reject-panel">
        <div class="tl-reject-icon" aria-hidden="true"><span class="material-symbols-outlined">warning</span></div>
        <h4 class="tl-reject-title">Decline ${escapeHtml(booking.displayId)}?</h4>
        <p class="tl-reject-lead">${escapeHtml(booking.requester.name)} · ${formatDateLong(booking.schedule.checkIn)} → ${formatDateLong(booking.schedule.checkOut)}</p>
        <label class="tl-field-label" for="tl-reject-note">Reason (optional — saved in notes)</label>
        <textarea id="tl-reject-note" class="tl-input tl-textarea" rows="3" placeholder="e.g. Dates unavailable, room conflict…"></textarea>
        ${actionError ? `<p class="tl-action-error">${escapeHtml(actionError)}</p>` : ''}
        <div class="tl-detail-actions">
          <button type="button" class="res-btn res-btn--secondary res-btn--wide" data-tl-action="cancel-reject" ${actionBusy ? 'disabled' : ''}>Go back</button>
          <button type="button" class="res-btn res-btn--reject res-btn--wide" data-tl-action="confirm-reject" ${actionBusy ? 'disabled' : ''}>
            ${actionBusy ? 'Declining…' : 'Confirm decline'}
          </button>
        </div>
      </div>`;
  }

  const actions = pending ? `
    <div class="tl-detail-actions tl-detail-actions--triple">
      <button type="button" class="res-btn res-btn--approve res-btn--wide" data-tl-action="approve" ${actionBusy ? 'disabled' : ''}>
        <span class="material-symbols-outlined">${actionBusy ? 'hourglass_top' : 'check_circle'}</span>
        ${actionBusy ? 'Working…' : 'Approve'}
      </button>
      <button type="button" class="res-btn res-btn--modify res-btn--wide" data-tl-action="modify" ${actionBusy ? 'disabled' : ''}>
        <span class="material-symbols-outlined">edit</span>
        Modify
      </button>
      <button type="button" class="res-btn res-btn--reject res-btn--wide" data-tl-action="reject" ${actionBusy ? 'disabled' : ''}>
        <span class="material-symbols-outlined">cancel</span>
        Decline
      </button>
    </div>` : `
    <div class="tl-detail-actions">
      ${normStatus(booking.status) === 'approved' ? `
        <button type="button" class="res-btn res-btn--modify res-btn--wide" data-tl-action="modify">
          <span class="material-symbols-outlined">edit</span>
          Modify reservation
        </button>` : ''}
      <p class="tl-detail-done">This reservation is ${escapeHtml(statusLabel(booking.status).toLowerCase())}${booking.updatedAt ? ` · updated ${formatDate(booking.updatedAt)}` : ''}.</p>
    </div>`;

  return `
    <div class="tl-detail">
      <div class="tl-detail-head">
        <p class="tl-detail-lead">Reservation overview</p>
        ${renderBookingStatusBadge(booking.status)}
      </div>
      ${renderDetailSection('Stay details', reservationRows)}
      ${renderDetailSection('Guest / requester', requesterRows)}
      ${booking.notes ? `
      <section class="tl-detail-section">
        <h4 class="tl-detail-section-title">Notes</h4>
        <p class="tl-detail-notes">${escapeHtml(booking.notes)}</p>
      </section>` : ''}
      ${actionError ? `<p class="tl-action-error">${escapeHtml(actionError)}</p>` : ''}
      ${actions}
    </div>`;
}

let detailState = { raw: null, mode: 'view', busy: false, error: '' };

function bindDetailActions(onRefresh) {
  const body = document.getElementById('modalBody');
  if (!body || !detailState.raw) return;

  body.querySelectorAll('[data-tl-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const action = btn.getAttribute('data-tl-action');
      const booking = normalizeManageRequest(detailState.raw);

      if (action === 'cancel-reject') {
        detailState.mode = 'view';
        detailState.error = '';
        body.innerHTML = renderBookingDetailBody(detailState.raw, detailState);
        bindDetailActions(onRefresh);
        return;
      }

      if (action === 'reject') {
        detailState.mode = 'reject';
        detailState.error = '';
        body.innerHTML = renderBookingDetailBody(detailState.raw, detailState);
        bindDetailActions(onRefresh);
        document.getElementById('tl-reject-note')?.focus();
        return;
      }

      if (action === 'modify') {
        closeModal();
        openModifyRequestWizard(booking, { modifyRequest: true });
        return;
      }

      if (action === 'confirm-reject' || action === 'approve') {
        detailState.busy = true;
        detailState.error = '';
        body.innerHTML = renderBookingDetailBody(detailState.raw, detailState);
        bindDetailActions(onRefresh);

        try {
          if (action === 'approve') {
            await approveRequest(booking);
          } else {
            const note = document.getElementById('tl-reject-note')?.value?.trim() || '';
            await rejectRequest(booking, note);
          }
          notifyBookingUpdated();
          closeModal();
          await onRefresh();
        } catch (err) {
          detailState.busy = false;
          detailState.error = err.message || 'Action failed.';
          body.innerHTML = renderBookingDetailBody(detailState.raw, detailState);
          bindDetailActions(onRefresh);
        }
      }
    });
  });
}

export function openBookingModal(rawBooking, { onRefresh } = {}) {
  if (!rawBooking) return;
  const booking = normalizeManageRequest(rawBooking);
  detailState = { raw: rawBooking, mode: 'view', busy: false, error: '' };
  const title = booking.requester.name || booking.title || `Booking #${booking.id}`;
  openModal(title, renderBookingDetailBody(rawBooking, detailState), { subtitle: booking.displayId });
  bindDetailActions(onRefresh || (() => {}));
}

/** @deprecated Use openBookingModal */
export const openBookingDrawer = openBookingModal;

export async function mountBookingTimeline({ mountEl, title, onData }) {
  if (!mountEl) return;

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  let viewYear = now.getFullYear();
  let viewMonth = now.getMonth();

  let allBookings = [];
  let rawBookingsById = {};

  function renderMonth() {
    const periodEl = document.getElementById('timeline-period');
    if (periodEl) periodEl.textContent = `${MONTHS_FULL[viewMonth]} ${viewYear}`;

    const stats = computeStats(allBookings, todayStr, viewYear, viewMonth);
    const summaryEl = document.getElementById('timeline-summary');
    if (summaryEl) summaryEl.innerHTML = renderSimpleSummary(stats);

    const mount = document.getElementById('mac-cal-mount');
    if (!mount) return;
    mount.innerHTML = renderMonthCalendar(allBookings, viewYear, viewMonth, todayStr);
    bindMonthCalendar(mount, {
      bookings: allBookings,
      rawBookingsById,
      onRefresh: refresh,
    });
  }

  async function refresh() {
    try {
      const rawBookings = await getBookings();
      allBookings = rawBookings.filter((b) => !b.group_id).map(normalizeBooking);
      rawBookingsById = Object.fromEntries(rawBookings.map((b) => [String(b.id), b]));
      renderMonth();
      onData?.({ bookings: allBookings });
    } catch (err) {
      const mount = document.getElementById('mac-cal-mount');
      if (mount) {
        mount.innerHTML = `<div class="tl-empty"><p class="tl-action-error">${escapeHtml(err.message)}</p></div>`;
      }
    }
  }

  mountEl.innerHTML = renderTimelineShell({ title });

  document.getElementById('timeline-prev')?.addEventListener('click', () => {
    viewMonth -= 1;
    if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
    renderMonth();
  });
  document.getElementById('timeline-next')?.addEventListener('click', () => {
    viewMonth += 1;
    if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
    renderMonth();
  });
  document.getElementById('timeline-today')?.addEventListener('click', () => {
    viewYear = now.getFullYear();
    viewMonth = now.getMonth();
    renderMonth();
  });

  await refresh();
  window.addEventListener('booking:updated', refresh);
}
