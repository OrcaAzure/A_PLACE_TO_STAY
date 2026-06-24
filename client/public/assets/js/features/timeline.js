/**
 * Shared timeline renderer — matches Google Stitch gantt layout
 */
import { openModal, syncTimelineScroll, scrollTimelineToToday } from '/assets/js/layout/ui.js';
import { getRooms, getBookings, normalizeRoom, normalizeBooking, normalizeManageRequest } from '/assets/js/services/api.js';

export const DAY_WIDTH = 80;

const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

export function getMonthRange(year, month) {
  const days = new Date(year, month + 1, 0).getDate();
  const dates = [];
  for (let d = 1; d <= days; d++) {
    dates.push(new Date(year, month, d));
  }
  return dates;
}

function dateOnly(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export function dateToCol(dateValue, rangeStart) {
  const d = new Date(`${dateOnly(dateValue)}T00:00:00`);
  const start = new Date(`${dateOnly(rangeStart)}T00:00:00`);
  const diff = Math.round((d - start) / 86400000);
  return diff + 1;
}

export function renderDayHeaders(dates, today = new Date()) {
  const todayStr = today.toISOString().slice(0, 10);
  return dates.map((d) => {
    const iso = d.toISOString().slice(0, 10);
    const isToday = iso === todayStr;
    const cls = isToday
      ? 'py-4 flex flex-col items-center justify-center border-r border-outline-variant/10 bg-primary/5'
      : 'py-4 flex flex-col items-center justify-center border-r border-outline-variant/10';
    const monthLabel = isToday ? 'TODAY' : MONTHS[d.getMonth()];
    const dayNum = String(d.getDate()).padStart(2, '0');
    return `
      <div class="${cls}">
        <span class="text-[9px] font-bold ${isToday ? 'text-primary' : 'text-outline'}">${monthLabel}</span>
        <span class="text-headline-sm leading-none ${isToday ? 'text-primary font-bold scale-110' : 'text-on-surface-variant'}">${dayNum}</span>
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
  return 'border-l-secondary';
}

export function renderBookingBar(booking, rangeStart, totalDays) {
  const colStart = dateToCol(booking.startDate, rangeStart);
  const colEnd = dateToCol(booking.endDate, rangeStart) + 1;
  if (colEnd <= 1 || colStart > totalDays) return '';

  const clampedStart = Math.max(1, colStart);

  const pill = statusPillClass(booking.status);
  const accent = borderAccent(booking.status);
  const label = booking.status === 'approved' ? 'Confirmed' : booking.status;

  return `
    <div class="gantt-booking-bar" style="grid-column: ${clampedStart} / ${Math.min(colEnd, totalDays + 1)}">
      <div class="h-full min-h-[64px] ${pill} rounded-lg px-4 py-3 flex flex-col justify-center shadow-sm border-l-4 ${accent} cursor-pointer hover:scale-[1.01] transition-transform"
           data-booking-id="${booking.id}" role="button" tabindex="0">
        <span class="text-[12px] font-bold truncate">#APT-${booking.id}: ${booking.title.toUpperCase()}</span>
        <div class="flex items-center gap-1.5 mt-1">
          <span class="w-1.5 h-1.5 rounded-full bg-secondary"></span>
          <span class="text-[10px] opacity-70">${label} • ${booking.startDate} – ${booking.endDate}</span>
        </div>
      </div>
    </div>`;
}

export function renderTimelineRow(room, barsHtml, todayCol, totalDays) {
  const todayLine = todayCol
    ? `<div class="gantt-today-line" style="--today-col: ${todayCol}"></div>`
    : '';

  return `
    <div class="gantt-container group border-b border-outline-variant/10 hover:bg-surface-container-low/10 transition-colors">
      <div class="p-5 border-r border-outline-variant/20 flex flex-col justify-center min-h-[100px]">
        <span class="text-body-md font-bold text-on-surface">${room.building} ${room.roomNumber}</span>
        <span class="text-[10px] font-medium text-on-surface-variant/60 uppercase">${room.building} • ${room.roomType}</span>
      </div>
      <div class="timeline-scroll no-scrollbar w-full">
        <div class="gantt-grid relative py-4" style="--timeline-days: ${totalDays}">
          ${barsHtml}
          ${todayLine}
        </div>
      </div>
    </div>`;
}

export function renderTimelineShell({ title, periodLabel }) {
  // FIX: Created an explicit stacked structure inside the header view for the current date and dynamic ticking clock elements
  return `
    <section class="bg-white border border-outline-variant rounded-xl overflow-hidden shadow-sm flex flex-col h-full min-h-[700px] relative" id="timeline-section">
      <div class="p-5 border-b border-outline-variant/50 bg-white flex items-center justify-between shrink-0 flex-wrap gap-4">
        <div class="flex items-center gap-4">
          <div class="w-1.5 h-8 bg-primary rounded-full"></div>
          <div>
            <h3 class="font-headline-sm text-on-surface font-bold text-lg">${title}</h3>
            <div class="flex flex-col text-xs text-slate-500 mt-1 space-y-0.5 font-medium">
              <div class="flex items-center gap-2">
                <span class="text-label-sm text-on-surface-variant font-semibold" id="timeline-period">${periodLabel}</span>
                <span class="w-1 h-1 bg-outline rounded-full"></span>
                <span class="live-date-display font-semibold text-slate-600">Loading Date...</span>
              </div>
              <div class="text-blue-600 font-mono font-bold text-sm tracking-wide flex items-center gap-1">
                <span class="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                <span class="live-time-display">00:00:00</span>
              </div>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <div class="flex bg-surface-container-low p-1 rounded-lg border border-outline-variant/30 mr-4">
            <button type="button" class="px-4 py-1.5 bg-white shadow-sm rounded-md text-label-sm font-bold text-primary transition-all" data-view="month">Month</button>
            <button type="button" class="px-4 py-1.5 hover:bg-white/50 rounded-md text-label-sm font-medium text-on-surface-variant transition-all" data-view="week">Week</button>
            <button type="button" class="px-4 py-1.5 hover:bg-white/50 rounded-md text-label-sm font-medium text-on-surface-variant transition-all" data-view="day">Day</button>
          </div>
          <div class="flex items-center gap-1 border-l border-outline-variant/30 pl-4">
            <button type="button" id="timeline-prev" class="p-2 hover:bg-surface-container rounded-lg"><span class="material-symbols-outlined">chevron_left</span></button>
            <button type="button" id="timeline-today" class="px-3 py-1.5 text-label-sm font-bold border border-outline-variant rounded-lg">Today</button>
            <button type="button" id="timeline-next" class="p-2 hover:bg-surface-container rounded-lg"><span class="material-symbols-outlined">chevron_right</span></button>
          </div>
        </div>
      </div>
      <div class="flex-grow flex flex-col overflow-hidden">
        <div class="gantt-container border-b-2 border-outline-variant/20 bg-surface-container-low/30 sticky top-0 z-20">
          <div class="p-5 border-r border-outline-variant/30 flex items-center justify-between bg-surface-container-low/50">
            <span class="text-[11px] font-bold text-outline uppercase tracking-widest">Facility Unit</span>
            <span class="material-symbols-outlined text-[16px] text-outline">tune</span>
          </div>
          <div class="timeline-scroll no-scrollbar w-full border-t border-outline-variant/10">
            <div class="gantt-grid" id="timeline-day-headers" style="--timeline-days: 31"></div>
          </div>
        </div>
        <div class="flex-grow overflow-y-auto" id="timeline-rows"></div>
      </div>
    </section>`;
}

export function renderTimeline({ rooms, items, rangeStart, dates, barRenderer, onBarClick }) {
  const totalDays = dates.length;
  const today = new Date().toISOString().slice(0, 10);
  const todayCol = dates.findIndex((d) => d.toISOString().slice(0, 10) === today) + 1;

  const headerEl = document.getElementById('timeline-day-headers');
  if (headerEl) {
    headerEl.style.setProperty('--timeline-days', totalDays);
    headerEl.innerHTML = renderDayHeaders(dates);
  }

  const rowsEl = document.getElementById('timeline-rows');
  if (!rowsEl) return;

  const itemsByRoom = {};
  items.forEach((item) => {
    const key = item.roomId;
    if (!itemsByRoom[key]) itemsByRoom[key] = [];
    itemsByRoom[key].push(item);
  });

  // FIX: Filter out rooms completely that do not have an active booking array assigned to them
  const activeRooms = rooms.filter(room => {
    return (itemsByRoom[room.id] || []).length > 0;
  });

  if (activeRooms.length === 0) {
    rowsEl.innerHTML = `<div class="p-12 text-center text-slate-400 text-sm font-medium">No active room reservations currently logged.</div>`;
    return;
  }

  rowsEl.innerHTML = activeRooms.map((room) => {
    const roomItems = itemsByRoom[room.id] || [];
    const bars = roomItems.map((item) => barRenderer(item, rangeStart, totalDays)).join('');
    return renderTimelineRow(room, bars, todayCol, totalDays);
  }).join('');

  syncTimelineScroll();
  if (todayCol > 0) scrollTimelineToToday(todayCol);

  rowsEl.querySelectorAll('[data-booking-id]').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-booking-id');
      const item = items.find((b) => String(b.id) === String(id));
      if (item) onBarClick(item);
    });
  });
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateOnly(dateStr) {
  if (!dateStr) return '—';
  const raw = String(dateStr).slice(0, 10);
  return new Date(`${raw}T00:00:00`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function renderDetailRow(label, value) {
  if (value == null || value === '') return '';
  return `
    <div class="flex gap-2">
      <dt class="text-body-sm text-on-surface-variant w-32 shrink-0">${escapeHtml(label)}</dt>
      <dd class="text-body-sm text-on-surface">${escapeHtml(value)}</dd>
    </div>`;
}

function renderDetailSection(title, rowsHtml) {
  if (!rowsHtml.trim()) return '';
  return `
    <section class="mb-6">
      <h4 class="text-label-sm font-bold text-on-surface-variant uppercase tracking-wide mb-3">${escapeHtml(title)}</h4>
      <dl class="space-y-2.5">${rowsHtml}</dl>
    </section>`;
}

function renderBookingStatusBadge(status) {
  const pill = statusPillClass(status);
  const label = (status || 'pending').charAt(0).toUpperCase() + (status || 'pending').slice(1);
  return `<span class="inline-flex items-center text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full ${pill}">${escapeHtml(label)}</span>`;
}

function renderBookingDetailBody(rawBooking) {
  const booking = normalizeManageRequest(rawBooking);
  const facilityLabel = `${booking.facility.building} — ${booking.facility.roomNumber}`;

  const reservationRows = [
    renderDetailRow('Status', booking.status),
    renderDetailRow('Check-in', formatDateOnly(booking.schedule.checkIn)),
    renderDetailRow('Check-out', formatDateOnly(booking.schedule.checkOut)),
    renderDetailRow('Facility', facilityLabel),
    renderDetailRow('Room type', booking.facility.roomType),
    renderDetailRow('Guests', booking.guestCount),
    renderDetailRow('Season', booking.season),
    renderDetailRow('Occupancy', booking.occupancyItem),
    booking.totalAmount != null && booking.totalAmount > 0
      ? renderDetailRow('Amount', `$${Number(booking.totalAmount).toLocaleString()}`)
      : '',
  ].join('');

  const requesterRows = [
    renderDetailRow('Name', booking.requester.name),
    renderDetailRow('Email', booking.requester.email),
    renderDetailRow('Role', booking.requester.role),
  ].join('');

  const metadataRows = [
    renderDetailRow('Submitted', formatDateTime(booking.submittedAt)),
    renderDetailRow('Last updated', formatDateTime(booking.updatedAt)),
  ].join('');

  return `
    <div class="space-y-1">
      <div class="flex items-start justify-between gap-4 mb-6">
        <p class="text-body-sm text-on-surface-variant">Reservation overview</p>
        ${renderBookingStatusBadge(booking.status)}
      </div>
      ${renderDetailSection('Reservation Information', reservationRows)}
      ${renderDetailSection('Guest / Requester', requesterRows)}
      ${booking.notes ? `
      <section class="mb-6">
        <h4 class="text-label-sm font-bold text-on-surface-variant uppercase tracking-wide mb-3">Notes</h4>
        <p class="text-body-sm text-on-surface leading-relaxed whitespace-pre-wrap">${escapeHtml(booking.notes)}</p>
      </section>` : ''}
      ${renderDetailSection('Metadata', metadataRows)}
    </div>`;
}

export function openBookingModal(rawBooking) {
  if (!rawBooking) return;
  const booking = normalizeManageRequest(rawBooking);
  const title = booking.requester.name || booking.title || `Booking #${booking.id}`;
  openModal(title, renderBookingDetailBody(rawBooking), { subtitle: booking.displayId });
}

/** @deprecated Use openBookingModal */
export const openBookingDrawer = openBookingModal;

export async function mountBookingTimeline({ mountEl, title, onData }) {
  if (!mountEl) return;

  const today = new Date();
  const monthLabel = today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  mountEl.innerHTML = renderTimelineShell({ title, periodLabel: monthLabel });

  let rawBookingsById = {};

  async function refresh() {
    try {
      const [rawRooms, rawBookings] = await Promise.all([getRooms(), getBookings()]);
      const rooms = rawRooms.map(normalizeRoom);
      const bookings = rawBookings.map(normalizeBooking);

      rawBookingsById = Object.fromEntries(rawBookings.map((b) => [String(b.id), b]));

      const dates = getMonthRange(today.getFullYear(), today.getMonth());
      const rangeStart = dates[0].toISOString().slice(0, 10);

      renderTimeline({
        rooms,
        items: bookings,
        rangeStart,
        dates,
        barRenderer: booking => renderBookingBar(booking, rangeStart, dates.length),
        onBarClick: (booking) => {
          openBookingModal(rawBookingsById[String(booking.id)] || booking);
        },
      });

      onData?.({ rooms, bookings });
    } catch (err) {
      const rowsEl = document.getElementById('timeline-rows');
      if (rowsEl) {
        rowsEl.innerHTML = `<div class="p-8 text-center text-error text-body-sm">${err.message}</div>`;
      }
    }
  }

  await refresh();
  window.addEventListener('booking:updated', refresh);
}