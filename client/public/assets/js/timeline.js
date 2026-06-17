/**
 * Shared timeline renderer — matches Google Stitch gantt layout
 */
import { openDrawer, syncTimelineScroll, scrollTimelineToToday } from './ui.js';
import { getRooms, getBookings, normalizeRoom, normalizeBooking } from './api.js';

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
    <div class="gantt-booking-bar h-[64px]" style="grid-column: ${clampedStart} / ${Math.min(colEnd, totalDays + 1)}">
      <div class="h-full ${pill} rounded-lg p-4 flex flex-col justify-center shadow-sm border-l-4 ${accent} cursor-pointer hover:scale-[1.01] transition-transform"
           data-booking-id="${booking.id}" role="button" tabindex="0">
        <span class="text-[12px] font-bold truncate">#APT-${booking.id}: ${booking.title.toUpperCase()}</span>
        <div class="flex items-center gap-1.5 mt-1">
          <span class="w-1.5 h-1.5 rounded-full bg-secondary"></span>
          <span class="text-[10px] opacity-70">${label} • ${booking.startDate} – ${booking.endDate}</span>
        </div>
      </div>
    </div>`;
}

export function renderStatusBar(item, rangeStart, totalDays) {
  const colStart = item.colStart || 1;
  const colEnd = item.colEnd || totalDays + 1;
  const pill = statusPillClass(item.status);
  const accent = borderAccent(item.status);

  return `
    <div class="gantt-booking-bar h-[64px]" style="grid-column: ${colStart} / ${colEnd}">
      <div class="h-full ${pill} rounded-lg p-4 flex flex-col justify-center shadow-sm border-l-4 ${accent} cursor-pointer hover:scale-[1.01] transition-transform">
        <span class="text-[12px] font-bold truncate">${item.title}</span>
        <div class="flex items-center gap-1.5 mt-1">
          <span class="text-[10px] opacity-70">${item.status}</span>
        </div>
      </div>
    </div>`;
}

export function renderTimelineRow(room, barsHtml, todayCol, totalDays) {
  const todayLine = todayCol
    ? `<div class="absolute left-[calc((${todayCol}/${totalDays})*100%)] top-0 bottom-0 w-[2px] bg-primary/20 z-0 pointer-events-none"></div>`
    : '';

  return `
    <div class="gantt-container group border-b border-outline-variant/10 hover:bg-surface-container-low/10 transition-colors">
      <div class="p-5 border-r border-outline-variant/20 flex flex-col justify-center min-h-[100px]">
        <span class="text-body-md font-bold text-on-surface">${room.building} ${room.roomNumber}</span>
        <span class="text-[10px] font-medium text-on-surface-variant/60 uppercase">${room.building} • ${room.roomType}</span>
      </div>
      <div class="overflow-x-auto no-scrollbar w-full timeline-scroll">
        <div class="gantt-grid relative h-full flex items-center py-4" style="--timeline-days: ${totalDays}">
          ${barsHtml}
          ${todayLine}
        </div>
      </div>
    </div>`;
}

export function renderTimelineShell({ title, periodLabel, timezoneLabel = 'UTC+08:00 Philippine Time' }) {
  return `
    <section class="bg-white border border-outline-variant rounded-xl overflow-hidden shadow-sm flex flex-col h-full min-h-[700px] relative" id="timeline-section">
      <div class="p-5 border-b border-outline-variant/50 bg-white flex items-center justify-between shrink-0 flex-wrap gap-4">
        <div class="flex items-center gap-4">
          <div class="w-1.5 h-8 bg-primary rounded-full"></div>
          <div>
            <h3 class="font-headline-sm text-on-surface">${title}</h3>
            <div class="flex items-center gap-2 mt-0.5">
              <span class="text-label-sm text-on-surface-variant font-medium" id="timeline-period">${periodLabel}</span>
              <span class="w-1 h-1 bg-outline rounded-full"></span>
              <span class="text-[10px] text-on-surface-variant/70 uppercase font-bold">${timezoneLabel}</span>
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
          <div class="overflow-x-auto no-scrollbar w-full border-t border-outline-variant/10 timeline-scroll">
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

  rowsEl.innerHTML = rooms.map((room) => {
    const roomItems = itemsByRoom[room.id] || [];
    const bars = roomItems.map((item) => barRenderer(item, rangeStart, totalDays)).join('');
    return renderTimelineRow(room, bars, todayCol, totalDays);
  }).join('');

  syncTimelineScroll();
  if (todayCol > 0) scrollTimelineToToday(todayCol);

  if (onBarClick) {
    rowsEl.querySelectorAll('[data-booking-id]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-booking-id');
        const item = items.find((b) => String(b.id) === String(id));
        if (item) onBarClick(item);
      });
    });
  }
}

export function openBookingDrawer(booking) {
  const drawer = document.getElementById('managementDrawer');
  if (drawer) drawer.dataset.bookingId = booking.id;

  openDrawer(
    `#APT-${booking.id}`,
    booking.title,
    `
    <div class="space-y-4 p-1">
      <p class="text-body-sm text-on-surface-variant"><strong>Status:</strong> <span id="drawer-status-value">${booking.status}</span></p>
      <p class="text-body-sm text-on-surface-variant"><strong>Check-in:</strong> ${booking.startDate}</p>
      <p class="text-body-sm text-on-surface-variant"><strong>Check-out:</strong> ${booking.endDate}</p>
      ${booking.guestCount ? `<p class="text-body-sm text-on-surface-variant"><strong>Guests:</strong> ${booking.guestCount}</p>` : ''}
      ${booking.notes ? `<p class="text-body-sm text-on-surface-variant"><strong>Notes:</strong> ${booking.notes}</p>` : ''}
    </div>`
  );

  const feedback = document.getElementById('drawer-action-feedback');
  if (feedback) {
    feedback.textContent = '';
    feedback.classList.add('hidden');
  }
}

export async function mountBookingTimeline({ mountEl, title, onData }) {
  if (!mountEl) return;

  const today = new Date();
  const monthLabel = today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  mountEl.innerHTML = renderTimelineShell({ title, periodLabel: monthLabel });

  async function refresh() {
    try {
      const [rawRooms, rawBookings] = await Promise.all([getRooms(), getBookings()]);
      const rooms = rawRooms.map(normalizeRoom);
      const bookings = rawBookings.map(normalizeBooking);

      const dates = getMonthRange(today.getFullYear(), today.getMonth());
      const rangeStart = dates[0].toISOString().slice(0, 10);

      renderTimeline({
        rooms,
        items: bookings,
        rangeStart,
        dates,
        barRenderer: renderBookingBar,
        onBarClick: (booking) => openBookingDrawer(booking),
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