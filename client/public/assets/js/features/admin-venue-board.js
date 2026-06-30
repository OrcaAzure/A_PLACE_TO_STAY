/**
 * Admin venue schedule — read-only occupancy snapshot by date and time slot.
 */

import { getVenueScheduleOverview } from '/assets/js/services/api.js';
import { venueEventPhase } from '/assets/js/features/reservation-shared.js';

const state = {
  date: '',
  startTime: '09:00',
  endTime: '12:00',
  data: null,
  showOpenOnly: false,
  search: '',
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

function bookingsForSnapshot(bookings) {
  return (bookings || []).filter((b) => b.status !== 'Cancelled' && b.status !== 'Rejected');
}

function renderFacilityCard(f) {
  const badge = spaceBadge(f);
  const visibleBookings = bookingsForSnapshot(f.bookings);
  const bookingsHtml = visibleBookings.map((b) => {
    const pending = b.status === 'Pending';
    const conflict = b.conflicts_slot;
    const scheduleDate = state.date || state.data?.date || dateOnly();
    const phase = venueEventPhase(scheduleDate, b.start_time, b.end_time);
    const slotPhaseClass = phase === 'past' ? ' venue-slot--completed' : phase === 'active' ? ' venue-slot--in-progress' : '';
    const statusText = conflict
      ? 'Overlaps your slot'
      : pending
        ? 'Awaiting approval — manage in Reservations'
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
      </li>`;
  }).join('');

  const rowClass = hasSlotCheck()
    ? (f.is_free_for_slot ? ' is-free' : ' is-busy')
    : (f.is_free ? ' is-free' : ' is-busy');

  const scheduleBlock = visibleBookings.length
    ? `<details class="fac-venue-card__schedule">
        <summary>${visibleBookings.length} booking${visibleBookings.length === 1 ? '' : 's'} this day</summary>
        <ul class="venue-slot-list">${bookingsHtml}</ul>
      </details>`
    : `<p class="fac-venue-card__free-note">
        <span class="material-symbols-outlined" aria-hidden="true">event_available</span>
        ${hasSlotCheck() ? 'Free for your time slot' : 'No bookings this day'}
      </p>`;

  return `
    <article class="fac-venue-card${rowClass}${f.has_pending ? ' has-pending' : ''}">
      <div class="fac-venue-card__hero">
        <span class="material-symbols-outlined" aria-hidden="true">corporate_fare</span>
      </div>
      <div class="fac-venue-card__body">
        <p class="fac-venue-card__category">${escapeHtml(f.category || '')}</p>
        <h4 class="fac-venue-card__name">${escapeHtml(f.label || f.item)}</h4>
        <p class="fac-venue-card__rate">${escapeHtml(formatRateLine(f))}</p>
        <span class="fac-venue-card__status ${badge.cls === 'venue-space-row__badge--free' ? 'fac-venue-card__status--free' : 'fac-venue-card__status--booked'}">${badge.text}</span>
        ${scheduleBlock}
        <div class="fac-venue-card__links">
          <a href="reservations.html?tab=venues" class="fac-room-card__link">Manage bookings</a>
          <a href="calendar.html?date=${encodeURIComponent(state.date || state.data?.date || dateOnly())}&amp;q=${encodeURIComponent(f.label || f.item || '')}" class="fac-room-card__link">View on calendar</a>
        </div>
      </div>
    </article>`;
}

function matchesSearch(f) {
  const q = state.search.trim().toLowerCase();
  if (!q) return true;
  const hay = [f.label, f.item, f.room_code, f.name, f.category, f.calendar_season, f.season].join(' ').toLowerCase();
  return hay.includes(q);
}

function matchesOpenFilter(f) {
  if (!state.showOpenOnly) return true;
  if (hasSlotCheck()) return f.is_free_for_slot;
  return f.is_free;
}

function filterFacilities(facilities) {
  let list = facilities;
  if (state.showOpenOnly) list = list.filter((f) => matchesOpenFilter(f));
  if (state.search.trim()) list = list.filter((f) => matchesSearch(f));
  return list;
}

function countVisibleSpaces() {
  if (!state.data?.venues) return 0;
  return state.data.venues.reduce((n, group) => {
    return n + filterFacilities(group.facilities).length;
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
    const searchNote = state.search.trim() ? ` · matching “${state.search.trim()}”` : '';
    const slotNote = hasSlotCheck()
      ? ` · checking ${formatTimeRange(data.check_start, data.check_end)}`
      : '';
    summaryEl.textContent = `${formatDisplayDate(data.date)}${slotNote} · ${visible} space${visible === 1 ? '' : 's'} shown${openNote}${searchNote}`;
  }

  if (!data.venues?.length) {
    mount.innerHTML = '<p class="rooms-board-message">No venue spaces configured yet.</p>';
    return;
  }

  const sections = data.venues.map((group) => {
    const facilities = filterFacilities(group.facilities);
    if (!facilities.length) return '';
    return `
    <section class="fac-building-group">
      <div class="fac-building-group__head">
        <h4>${escapeHtml(group.category)}</h4>
        <span class="fac-building-group__count">${facilities.length} space${facilities.length === 1 ? '' : 's'}</span>
        <div class="fac-building-group__rule" aria-hidden="true"></div>
      </div>
      <div class="fac-venue-grid">
        ${facilities.map(renderFacilityCard).join('')}
      </div>
    </section>`;
  }).filter(Boolean);

  if (!sections.length) {
    mount.innerHTML = `
      <div class="rooms-board-empty">
        <span class="material-symbols-outlined" aria-hidden="true">search_off</span>
        <p class="rooms-board-empty__title">No spaces match</p>
        <p class="rooms-board-empty__text">Try another date or time, turn off “Free for slot”, or clear your search.</p>
      </div>`;
    return;
  }

  mount.innerHTML = `<div class="fac-board-sections">${sections.join('')}</div>`;
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

export function initVenueScheduleBoard() {
  const dateInput = document.getElementById('venue-schedule-date');
  const startInput = document.getElementById('venue-schedule-start');
  const endInput = document.getElementById('venue-schedule-end');
  const today = dateOnly();
  if (dateInput) {
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

  window.addEventListener('booking:updated', () => {
    if (state.date) loadSchedule(state.date);
  });
}

export async function bootstrapVenueScheduleBoard() {
  initVenueScheduleBoard();
  const dateParam = new URLSearchParams(window.location.search).get('date');
  await loadSchedule(dateParam || dateOnly());
}

export function refreshVenueScheduleBoard() {
  return loadSchedule(state.date);
}
