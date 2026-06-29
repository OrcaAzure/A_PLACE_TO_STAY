/**
 * Admin venue schedule — availability by date and time slot.
 */

import { getVenueScheduleOverview, updateFacilityBooking } from '/assets/js/services/api.js';
import { venueEventPhase, venuePhaseLabel } from '/assets/js/features/reservation-shared.js';

const state = {
  date: '',
  startTime: '09:00',
  endTime: '12:00',
  data: null,
  showOpenOnly: false,
  search: '',
  bookingView: 'operations',
};

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function debounce(fn, ms = 280) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function dateOnly(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function normalizeTime(value) {
  if (!value) return '';
  const raw = String(value).trim();
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(raw)) return raw.slice(0, 5);
  return raw.slice(0, 5);
}

function formatDisplayDate(iso) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTimeRange(start, end) {
  if (!start || !end) return '';
  const fmt = (t) => {
    const [h, m] = t.split(':').map(Number);
    return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

function hasSlotCheck() {
  return Boolean(state.data?.check_start && state.data?.check_end);
}

function renderStats(summary) {
  const mount = document.getElementById('venue-board-stats');
  if (!mount || !summary) return;

  const slotOpen = summary.freeForSlot;
  mount.innerHTML = `
    <article class="rooms-stat">
      <span class="rooms-stat__value">${summary.totalSpaces}</span>
      <span class="rooms-stat__label">All spaces</span>
    </article>
    <article class="rooms-stat rooms-stat--vacant">
      <span class="rooms-stat__value">${slotOpen != null ? slotOpen : summary.noBookingsToday ?? 0}</span>
      <span class="rooms-stat__label">${slotOpen != null ? 'Free for slot' : 'No bookings'}</span>
    </article>
    <article class="rooms-stat rooms-stat--busy">
      <span class="rooms-stat__value">${summary.bookedToday}</span>
      <span class="rooms-stat__label">Booked slots</span>
    </article>
    <article class="rooms-stat rooms-stat--dirty">
      <span class="rooms-stat__value">${summary.pendingRequests}</span>
      <span class="rooms-stat__label">Pending</span>
    </article>`;
}

function formatRateLine(f) {
  const label = f.calendar_season || f.season || 'Regular';
  return `${label} · ₱${Number(f.rate).toLocaleString('en-PH')}/hr`;
}

function spaceBadge(f) {
  if (hasSlotCheck()) {
    if (f.is_free_for_slot) {
      return { text: 'Free for your slot', cls: 'venue-space-row__badge--free' };
    }
    return { text: 'Booked during slot', cls: 'venue-space-row__badge--booked' };
  }
  if (f.is_free) {
    return { text: 'No bookings', cls: 'venue-space-row__badge--free' };
  }
  return {
    text: `${f.bookings.length} booking${f.bookings.length === 1 ? '' : 's'}`,
    cls: 'venue-space-row__badge--booked',
  };
}

function emptyDayMessage() {
  if (hasSlotCheck()) {
    return '<li class="venue-slot venue-slot--free"><span class="material-symbols-outlined" aria-hidden="true">event_available</span> No bookings this day — free for your time slot</li>';
  }
  return '<li class="venue-slot venue-slot--free"><span class="material-symbols-outlined" aria-hidden="true">event_available</span> No bookings this day</li>';
}

function combineDateTime(dateStr, timeStr) {
  const date = String(dateStr).slice(0, 10);
  const raw = String(timeStr || '00:00:00').trim();
  const time = /^\d{1,2}:\d{2}$/.test(raw) ? `${raw}:00` : raw.slice(0, 8);
  return new Date(`${date}T${time}`);
}

function filterBookingsForView(bookings, scheduleDate) {
  if (state.bookingView === 'history') return bookings || [];
  const today = dateOnly();
  const now = new Date();
  if (scheduleDate < today) return [];

  return (bookings || []).filter((b) => {
    if (b.status === 'Cancelled' || b.status === 'Rejected') return false;
    if (b.status === 'Pending') return true;
    if (b.status === 'Approved') {
      const end = combineDateTime(scheduleDate, b.end_time);
      return now <= end;
    }
    return false;
  });
}

function renderFacilityRow(f) {
  const badge = spaceBadge(f);
  const visibleBookings = filterBookingsForView(f.bookings, state.date || state.data?.date || dateOnly());
  const bookingsHtml = visibleBookings.length
    ? visibleBookings.map((b) => {
      const pending = b.status === 'Pending';
      const conflict = b.conflicts_slot;
      const scheduleDate = state.date || state.data?.date || dateOnly();
      const phase = venueEventPhase(scheduleDate, b.start_time, b.end_time);
      const slotPhaseClass = phase === 'past' ? ' venue-slot--completed' : phase === 'active' ? ' venue-slot--in-progress' : '';
      const statusText = conflict
        ? 'Overlaps your slot'
        : pending
          ? 'Awaiting approval'
          : phase === 'past'
            ? 'Completed'
            : phase === 'active'
              ? 'In progress'
              : 'Confirmed';
      return `
        <li class="venue-slot${pending ? ' venue-slot--pending' : ''}${conflict ? ' venue-slot--conflict' : ''}${slotPhaseClass}">
          <div class="venue-slot__times">${escapeHtml(b.start_label)} – ${escapeHtml(b.end_label)}</div>
          <div class="venue-slot__guest">${escapeHtml(b.guest_name)} · ${b.guest_count} guest${b.guest_count === 1 ? '' : 's'}</div>
          <div class="venue-slot__status">${escapeHtml(statusText)}</div>
          ${pending ? `
            <div class="venue-slot__actions">
              <button type="button" class="dashboard-queue-btn dashboard-queue-btn--approve venue-approve" data-booking-id="${b.id}">Approve</button>
              <button type="button" class="dashboard-queue-btn dashboard-queue-btn--decline venue-reject" data-booking-id="${b.id}">Decline</button>
            </div>` : ''}
        </li>`;
    }).join('')
    : emptyDayMessage();

  const rowClass = hasSlotCheck()
    ? (f.is_free_for_slot ? ' is-free' : ' is-busy')
    : (f.is_free ? ' is-free' : '');

  return `
    <article class="venue-space-row${rowClass}${f.has_pending ? ' has-pending' : ''}">
      <div class="venue-space-row__head">
        <div>
          <h4 class="venue-space-row__name">${escapeHtml(f.item)}</h4>
          <p class="venue-space-row__rate">${escapeHtml(formatRateLine(f))}</p>
        </div>
        <span class="venue-space-row__badge ${badge.cls}">${badge.text}</span>
      </div>
      <ul class="venue-slot-list">${bookingsHtml}</ul>
    </article>`;
}

function matchesSearch(f, category) {
  const q = state.search.trim().toLowerCase();
  if (!q) return true;
  const hay = [f.item, f.category, f.calendar_season, f.season].join(' ').toLowerCase();
  return hay.includes(q);
}

function matchesOpenFilter(f) {
  if (!state.showOpenOnly) return true;
  if (hasSlotCheck()) return f.is_free_for_slot;
  return f.is_free;
}

function filterFacilities(facilities, category) {
  let list = facilities;
  if (state.showOpenOnly) list = list.filter((f) => matchesOpenFilter(f));
  if (state.search.trim()) list = list.filter((f) => matchesSearch(f, category));
  return list;
}

function countVisibleSpaces() {
  if (!state.data?.venues) return 0;
  return state.data.venues.reduce((n, group) => {
    return n + filterFacilities(group.facilities, group.category).length;
  }, 0);
}

function readSlotInputs() {
  const dateInput = document.getElementById('venue-schedule-date');
  const startInput = document.getElementById('venue-schedule-start');
  const endInput = document.getElementById('venue-schedule-end');
  state.date = dateInput?.value || state.date;
  state.startTime = normalizeTime(startInput?.value || state.startTime);
  state.endTime = normalizeTime(endInput?.value || state.endTime);
}

function renderSchedule() {
  const mount = document.getElementById('venue-schedule-mount');
  const summaryEl = document.getElementById('venue-schedule-summary');
  if (!mount) return;

  const data = state.data;
  if (!data) {
    mount.innerHTML = '<p class="rooms-board-message">Loading venue schedule…</p>';
    return;
  }

  renderStats(data.summary);

  const visible = countVisibleSpaces();
  if (summaryEl) {
    const openNote = state.showOpenOnly ? ' · free for slot only' : '';
    const viewNote = state.bookingView === 'history' ? ' · full history' : ' · active bookings only';
    const searchNote = state.search.trim() ? ` · matching “${state.search.trim()}”` : '';
    const slotNote = hasSlotCheck()
      ? ` · checking ${formatTimeRange(data.check_start, data.check_end)}`
      : '';
    summaryEl.textContent = `${formatDisplayDate(data.date)}${slotNote} · ${visible} space${visible === 1 ? '' : 's'} shown${viewNote}${openNote}${searchNote}`;
  }

  if (!data.venues?.length) {
    mount.innerHTML = '<p class="rooms-board-message">No venue spaces configured yet.</p>';
    return;
  }

  const sections = data.venues.map((group) => {
    const facilities = filterFacilities(group.facilities, group.category);
    if (!facilities.length) return '';
    return `
    <section class="venue-category-block">
      <header class="venue-category-block__head">
        <span class="material-symbols-outlined" aria-hidden="true">${escapeHtml(group.icon || 'place')}</span>
        <h3>${escapeHtml(group.category)}</h3>
        <span class="venue-category-block__count">${facilities.length} space${facilities.length === 1 ? '' : 's'}</span>
      </header>
      <div class="venue-category-block__list">
        ${facilities.map(renderFacilityRow).join('')}
      </div>
    </section>`;
  }).filter(Boolean);

  if (!sections.length) {
    mount.innerHTML = `
      <div class="rooms-board-empty">
        <span class="material-symbols-outlined" aria-hidden="true">search_off</span>
        <p class="rooms-board-empty__title">No spaces match</p>
        <p class="rooms-board-empty__text">${state.bookingView === 'operations' && state.date < dateOnly()
    ? 'Operations view hides past dates. Switch to <strong>Full history</strong> or pick today / a future date.'
    : 'Try another date or time, turn off “Free for slot”, or clear your search.'}</p>
      </div>`;
    return;
  }

  mount.innerHTML = sections.join('');
}

function setBookingView(mode) {
  state.bookingView = mode === 'history' ? 'history' : 'operations';
  document.querySelectorAll('[data-venue-bookings]').forEach((btn) => {
    const on = btn.getAttribute('data-venue-bookings') === state.bookingView;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  renderSchedule();
}

function setShowFilter(mode) {
  state.showOpenOnly = mode === 'open';
  document.querySelectorAll('[data-venue-show]').forEach((btn) => {
    const on = btn.getAttribute('data-venue-show') === mode;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  renderSchedule();
}

async function loadSchedule(date) {
  readSlotInputs();
  state.date = date || state.date || dateOnly();

  const dateInput = document.getElementById('venue-schedule-date');
  const startInput = document.getElementById('venue-schedule-start');
  const endInput = document.getElementById('venue-schedule-end');
  if (dateInput) dateInput.value = state.date;
  if (startInput) startInput.value = state.startTime;
  if (endInput) endInput.value = state.endTime;

  if (state.endTime <= state.startTime) {
    const mount = document.getElementById('venue-schedule-mount');
    if (mount) {
      mount.innerHTML = '<p class="rooms-board-message rooms-board-message--error">End time must be after start time.</p>';
    }
    return;
  }

  const mount = document.getElementById('venue-schedule-mount');
  const goBtn = document.getElementById('venue-schedule-go');
  if (mount) mount.innerHTML = '<p class="rooms-board-message">Loading venue schedule…</p>';
  if (goBtn) { goBtn.disabled = true; goBtn.textContent = '…'; }

  try {
    state.data = await getVenueScheduleOverview(state.date, {
      startTime: state.startTime,
      endTime: state.endTime,
    });
    renderSchedule();
  } catch (err) {
    if (mount) {
      mount.innerHTML = `<p class="rooms-board-message rooms-board-message--error">${escapeHtml(err.message || 'Could not load schedule.')}</p>`;
    }
  } finally {
    if (goBtn) { goBtn.disabled = false; goBtn.textContent = 'Go'; }
  }
}

function loadToday() {
  const today = dateOnly();
  const input = document.getElementById('venue-schedule-date');
  if (input) input.value = today;
  loadSchedule(today);
}

async function handleApprove(id) {
  try {
    await updateFacilityBooking(id, { status: 'Approved' });
    await loadSchedule(state.date);
    window.dispatchEvent(new CustomEvent('booking:updated'));
  } catch (err) {
    alert(err.message || 'Could not approve this venue booking.');
  }
}

async function handleReject(id) {
  if (!window.confirm('Decline this venue booking request?')) return;
  try {
    await updateFacilityBooking(id, { status: 'Rejected' });
    await loadSchedule(state.date);
    window.dispatchEvent(new CustomEvent('booking:updated'));
  } catch (err) {
    alert(err.message || 'Could not decline this venue booking.');
  }
}

export function initVenueScheduleBoard() {
  const dateInput = document.getElementById('venue-schedule-date');
  const startInput = document.getElementById('venue-schedule-start');
  const endInput = document.getElementById('venue-schedule-end');
  const today = dateOnly();
  if (dateInput) {
    dateInput.min = today;
    dateInput.value = today;
  }
  if (startInput && !startInput.value) startInput.value = '09:00';
  if (endInput && !endInput.value) endInput.value = '12:00';

  document.getElementById('venue-schedule-go')?.addEventListener('click', () => {
    loadSchedule(dateInput?.value || state.date);
  });

  document.getElementById('venue-schedule-today')?.addEventListener('click', loadToday);

  dateInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      loadSchedule(dateInput.value);
    }
  });

  startInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); loadSchedule(state.date); }
  });
  endInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); loadSchedule(state.date); }
  });

  const debouncedSearch = debounce((value) => {
    state.search = value;
    renderSchedule();
  });

  const searchInput = document.getElementById('venue-board-search');
  searchInput?.addEventListener('input', (e) => debouncedSearch(e.target.value));
  searchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      state.search = searchInput.value || '';
      renderSchedule();
    }
  });

  document.querySelectorAll('[data-venue-show]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setShowFilter(btn.getAttribute('data-venue-show') || 'all');
    });
  });

  document.querySelectorAll('[data-venue-bookings]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setBookingView(btn.getAttribute('data-venue-bookings') || 'operations');
    });
  });

  document.getElementById('venue-open-history')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelector('[data-open-manage-venue-bookings]')?.click();
  });

  document.getElementById('venue-schedule-mount')?.addEventListener('click', (e) => {
    const approve = e.target.closest('.venue-approve');
    if (approve) {
      handleApprove(Number(approve.dataset.bookingId));
      return;
    }
    const reject = e.target.closest('.venue-reject');
    if (reject) handleReject(Number(reject.dataset.bookingId));
  });

  window.addEventListener('booking:updated', () => {
    if (state.date) loadSchedule(state.date);
  });
}

export async function bootstrapVenueScheduleBoard() {
  initVenueScheduleBoard();
  await loadSchedule(dateOnly());
}

export function refreshVenueScheduleBoard() {
  return loadSchedule(state.date);
}
