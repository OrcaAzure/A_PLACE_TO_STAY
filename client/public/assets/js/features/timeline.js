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
  if (stats.inStay > 0) parts.push(`<strong>${stats.inStay}</strong> staying now`);
  if (stats.upcoming > 0) parts.push(`<strong>${stats.upcoming}</strong> coming up`);
  if (!parts.length) return 'No active reservations right now.';
  return parts.join(' · ');
}

function renderAgendaCard(booking) {
  const st = normStatus(booking.status);
  const guest = booking.guestName || booking.title || 'Guest';
  const room = [booking.buildingName, booking.roomNumber].filter(Boolean).join(' ') || 'Room not assigned';
  const nights = stayNights(booking.startDate, booking.endDate);
  const pending = st === 'pending';
  const inStay = st === 'approved'
    && dateOnly(booking.startDate) <= dateOnly(new Date())
    && dateOnly(booking.endDate) > dateOnly(new Date());

  let tag = 'Confirmed';
  let tagCls = 'tl-agenda-tag--ok';
  if (pending) { tag = 'Needs approval'; tagCls = 'tl-agenda-tag--pending'; }
  else if (inStay) { tag = 'Staying now'; tagCls = 'tl-agenda-tag--now'; }

  return `
    <button type="button" class="tl-agenda-card ${pending ? 'tl-agenda-card--pending' : ''}" data-agenda-id="${booking.id}">
      <div class="tl-agenda-card-top">
        <span class="tl-agenda-tag ${tagCls}">${tag}</span>
        <span class="tl-agenda-dates">${formatDateLong(booking.startDate)} → ${formatDateLong(booking.endDate)}</span>
      </div>
      <h4 class="tl-agenda-name">${escapeHtml(guest)}</h4>
      <p class="tl-agenda-room">${escapeHtml(room)}${booking.guestCount ? ` · ${booking.guestCount} guest${booking.guestCount === 1 ? '' : 's'}` : ''}${nights ? ` · ${nights} night${nights === 1 ? '' : 's'}` : ''}</p>
      <span class="tl-agenda-cta">Tap to view details <span class="material-symbols-outlined">arrow_forward</span></span>
    </button>`;
}

function renderAgendaList(bookings, { horizonDays, search, todayStr }) {
  const q = search.trim().toLowerCase();
  const horizonEnd = new Date(`${todayStr}T00:00:00`);
  horizonEnd.setDate(horizonEnd.getDate() + horizonDays);
  const horizonEndStr = horizonEnd.toISOString().slice(0, 10);

  const filtered = bookings.filter((b) => {
    const st = normStatus(b.status);
    if (!['pending', 'approved'].includes(st)) return false;
    if (dateOnly(b.endDate) < todayStr) return false;
    if (st !== 'pending' && dateOnly(b.startDate) > horizonEndStr) return false;
    if (q) {
      const hay = [b.id, b.guestName, b.title, b.buildingName, b.roomNumber, b.facilityLabel].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const pending = filtered.filter((b) => normStatus(b.status) === 'pending')
    .sort((a, b) => dateOnly(a.startDate).localeCompare(dateOnly(b.startDate)));
  const inStay = filtered.filter((b) => {
    const st = normStatus(b.status);
    return st === 'approved' && dateOnly(b.startDate) <= todayStr && dateOnly(b.endDate) > todayStr;
  }).sort((a, b) => dateOnly(a.endDate).localeCompare(dateOnly(b.endDate)));
  const upcoming = filtered.filter((b) => {
    const st = normStatus(b.status);
    return st === 'approved' && dateOnly(b.startDate) > todayStr;
  }).sort((a, b) => dateOnly(a.startDate).localeCompare(dateOnly(b.startDate)));

  if (!pending.length && !inStay.length && !upcoming.length) {
    return `<div class="tl-empty">
      <span class="material-symbols-outlined tl-empty-icon">event_available</span>
      <p class="tl-empty-title">Nothing scheduled in this time range</p>
      <p class="tl-empty-hint">Try "Next 6 months" below, or switch to Room calendar to browse further ahead.</p>
    </div>`;
  }

  const section = (title, hint, items) => {
    if (!items.length) return '';
    return `
      <section class="tl-agenda-section">
        <h3 class="tl-agenda-section-title">${escapeHtml(title)}</h3>
        ${hint ? `<p class="tl-agenda-section-hint">${escapeHtml(hint)}</p>` : ''}
        <div class="tl-agenda-list">${items.map(renderAgendaCard).join('')}</div>
      </section>`;
  };

  return [
    section('Needs your approval', 'Tap a card to approve, modify, or decline.', pending),
    section('Guests staying now', null, inStay),
    section('Coming up', null, upcoming),
  ].join('');
}

export function renderTimelineShell({ title }) {
  return `
    <section class="tl-shell bg-white border border-outline-variant rounded-xl overflow-hidden shadow-sm flex flex-col relative" id="timeline-section">
      <div class="tl-header p-5 border-b border-outline-variant/50 shrink-0">
        <div class="flex items-start gap-4">
          <div class="w-1.5 h-8 bg-primary rounded-full shrink-0 mt-1"></div>
          <div class="min-w-0 flex-1">
            <h3 class="font-headline-sm text-on-surface font-bold text-xl">${escapeHtml(title)}</h3>
            <p class="tl-summary text-base text-slate-600 mt-2 leading-relaxed" id="timeline-summary">Loading…</p>
          </div>
        </div>
        <div class="tl-mode-tabs mt-5" role="tablist" aria-label="How to view reservations">
          <button type="button" class="tl-mode-tab is-active" data-tl-mode="agenda" role="tab" aria-selected="true">
            <span class="material-symbols-outlined">list_alt</span>
            Upcoming stays
          </button>
          <button type="button" class="tl-mode-tab" data-tl-mode="calendar" role="tab" aria-selected="false">
            <span class="material-symbols-outlined">calendar_view_week</span>
            Room calendar
          </button>
        </div>
      </div>

      <div id="timeline-agenda-panel" class="tl-panel">
        <div class="tl-agenda-controls">
          <p class="tl-controls-label">Show reservations for:</p>
          <div class="tl-horizon-tabs" role="group" aria-label="Time range">
            <button type="button" class="tl-horizon-btn" data-horizon="short">Next 2 weeks</button>
            <button type="button" class="tl-horizon-btn is-active" data-horizon="medium">Next 2 months</button>
            <button type="button" class="tl-horizon-btn" data-horizon="long">Next 6 months</button>
          </div>
          <label class="tl-search-simple">
            <span class="material-symbols-outlined">search</span>
            <input type="search" id="timeline-search" placeholder="Find guest by name…" autocomplete="off" />
          </label>
        </div>
        <div id="timeline-agenda-list" class="tl-agenda-body"></div>
      </div>

      <div id="timeline-calendar-panel" class="tl-panel hidden">
        <div class="tl-cal-controls">
          <button type="button" id="timeline-prev" class="tl-cal-btn">
            <span class="material-symbols-outlined">arrow_back</span>
            Earlier dates
          </button>
          <div class="tl-cal-center">
            <button type="button" id="timeline-today" class="tl-today-btn">Jump to today</button>
            <p class="tl-cal-range" id="timeline-period">Loading…</p>
          </div>
          <button type="button" id="timeline-next" class="tl-cal-btn">
            Later dates
            <span class="material-symbols-outlined">arrow_forward</span>
          </button>
        </div>
        <p class="tl-scroll-hint">
          <span class="material-symbols-outlined">swipe</span>
          Scroll sideways on the calendar below to see more dates
        </p>
        <div id="timeline-unassigned" class="hidden"></div>
        <div class="tl-cal-grid-wrap flex flex-col overflow-hidden min-h-[420px]">
          <div class="gantt-container border-b-2 border-outline-variant/20 bg-surface-container-low/30 sticky top-0 z-20">
            <div class="tl-room-label p-4 border-r border-outline-variant/30 flex items-center bg-surface-container-low/50">
              <span class="text-sm font-bold text-outline uppercase tracking-wide">Room</span>
            </div>
            <div class="timeline-scroll tl-scroll-visible w-full">
              <div class="gantt-grid" id="timeline-day-headers" style="--timeline-days: ${CALENDAR_DAYS}"></div>
            </div>
          </div>
          <div class="overflow-y-auto max-h-[480px]" id="timeline-rows"></div>
        </div>
      </div>
    </section>`;
}

function computeStats(bookings, todayStr, horizonDays = 60) {
  const horizonEnd = new Date(`${todayStr}T00:00:00`);
  horizonEnd.setDate(horizonEnd.getDate() + horizonDays);
  const horizonEndStr = horizonEnd.toISOString().slice(0, 10);

  let pending = 0;
  let inStay = 0;
  let upcoming = 0;

  bookings.forEach((b) => {
    const st = normStatus(b.status);
    const ci = dateOnly(b.startDate);
    const co = dateOnly(b.endDate);
    if (co < todayStr) return;
    if (st === 'pending') pending += 1;
    if (st === 'approved') {
      if (ci <= todayStr && co > todayStr) inStay += 1;
      else if (ci > todayStr && ci <= horizonEndStr) upcoming += 1;
    }
  });

  return { pending, inStay, upcoming };
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

  let viewMode = 'agenda';
  let agendaHorizon = 'medium';
  let calendarStart = startOfWeek(now);
  let allRooms = [];
  let allBookings = [];
  let rawBookingsById = {};
  let search = '';

  function openBooking(id) {
    openBookingModal(rawBookingsById[String(id)], { onRefresh: refresh });
  }

  function setMode(mode) {
    viewMode = mode;
    document.querySelectorAll('[data-tl-mode]').forEach((btn) => {
      const active = btn.getAttribute('data-tl-mode') === mode;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.getElementById('timeline-agenda-panel')?.classList.toggle('hidden', mode !== 'agenda');
    document.getElementById('timeline-calendar-panel')?.classList.toggle('hidden', mode !== 'calendar');
    if (mode === 'calendar' && allBookings.length) renderCalendar();
    else if (allBookings.length) renderAgenda();
    else refresh();
  }

  function renderAgenda() {
    const horizonDays = AGENDA_HORIZONS[agendaHorizon] || AGENDA_HORIZONS.medium;
    const stats = computeStats(allBookings, todayStr, horizonDays);
    const summaryEl = document.getElementById('timeline-summary');
    if (summaryEl) summaryEl.innerHTML = renderSimpleSummary(stats);

    const listEl = document.getElementById('timeline-agenda-list');
    if (!listEl) return;
    listEl.innerHTML = renderAgendaList(allBookings, { horizonDays, search, todayStr });

    listEl.querySelectorAll('[data-agenda-id]').forEach((btn) => {
      btn.addEventListener('click', () => openBooking(btn.getAttribute('data-agenda-id')));
    });
  }

  function renderCalendar() {
    const dates = getDateRangeFrom(calendarStart, CALENDAR_DAYS);
    const rangeStart = dates[0].toISOString().slice(0, 10);
    const rangeEnd = dates[dates.length - 1].toISOString().slice(0, 10);

    const periodEl = document.getElementById('timeline-period');
    if (periodEl) periodEl.textContent = formatRangeLabel(rangeStart, rangeEnd);

    const stats = computeStats(allBookings, todayStr, AGENDA_HORIZONS.long);
    const summaryEl = document.getElementById('timeline-summary');
    if (summaryEl) summaryEl.innerHTML = renderSimpleSummary(stats);

    renderTimeline({
      rooms: allRooms,
      items: allBookings,
      rangeStart,
      dates,
      barRenderer: (booking) => renderBookingBar(booking, rangeStart, dates.length),
      onBarClick: (booking) => openBooking(booking.id),
      filters: { status: 'active', search: '', building: 'all' },
    });

    const unassigned = allBookings.filter((b) =>
      normStatus(b.status) === 'pending' && !b.roomId
      && overlapsRange(b.startDate, b.endDate, rangeStart, rangeEnd)
    );
    renderUnassignedStrip(unassigned, (b) => openBooking(b.id));
  }

  async function refresh() {
    try {
      const [rawRooms, rawBookings] = await Promise.all([getRooms(), getBookings()]);
      allRooms = rawRooms.map(normalizeRoom);
      allBookings = rawBookings.filter((b) => !b.group_id).map(normalizeBooking);
      rawBookingsById = Object.fromEntries(rawBookings.map((b) => [String(b.id), b]));

      if (viewMode === 'calendar') renderCalendar();
      else renderAgenda();

      onData?.({ rooms: allRooms, bookings: allBookings });
    } catch (err) {
      const target = viewMode === 'calendar'
        ? document.getElementById('timeline-rows')
        : document.getElementById('timeline-agenda-list');
      if (target) {
        target.innerHTML = `<div class="tl-empty"><p class="tl-action-error">${escapeHtml(err.message)}</p></div>`;
      }
    }
  }

  mountEl.innerHTML = renderTimelineShell({ title });

  document.querySelectorAll('[data-tl-mode]').forEach((btn) => {
    btn.addEventListener('click', () => setMode(btn.getAttribute('data-tl-mode')));
  });

  document.querySelectorAll('[data-horizon]').forEach((btn) => {
    btn.addEventListener('click', () => {
      agendaHorizon = btn.getAttribute('data-horizon');
      document.querySelectorAll('[data-horizon]').forEach((b) => {
        b.classList.toggle('is-active', b === btn);
      });
      renderAgenda();
    });
  });

  document.getElementById('timeline-prev')?.addEventListener('click', () => {
    calendarStart.setDate(calendarStart.getDate() - CALENDAR_SHIFT);
    renderCalendar();
  });
  document.getElementById('timeline-next')?.addEventListener('click', () => {
    calendarStart.setDate(calendarStart.getDate() + CALENDAR_SHIFT);
    renderCalendar();
  });
  document.getElementById('timeline-today')?.addEventListener('click', () => {
    calendarStart = startOfWeek(now);
    renderCalendar();
  });

  let searchTimer;
  document.getElementById('timeline-search')?.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      search = e.target.value;
      renderAgenda();
    }, 200);
  });

  await refresh();
  window.addEventListener('booking:updated', refresh);
}
