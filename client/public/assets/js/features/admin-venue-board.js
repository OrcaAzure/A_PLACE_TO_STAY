/**
 * Admin venue schedule — read-only occupancy snapshot by date and time slot.
 */

import { getVenueScheduleOverview } from '/assets/js/services/api.js';
import { venueEventPhase, debounce, escapeHtml } from '/assets/js/features/reservation-shared.js';
import { venuePreviewImage } from '/assets/js/features/facility-display.js';
import { createBookingPoll } from '/assets/js/layout/booking-poll.js';

const state = {
  date: '',
  startTime: '09:00',
  endTime: '12:00',
  data: null,
  search: '',
  schedulePanelOpen: false,
  scheduleLoading: false,
  scheduleError: '',
};

let venueBoardInitialized = false;
/** @type {(() => void) | null} */
let onBookingUpdated = null;
/** @type {(() => void) | null} */
let stopBookingPoll = null;

function dateOnly(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function normalizeTime(value) {
  if (!value) return '';
  const raw = String(value).trim();
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(raw)) return raw.slice(0, 5);
  return raw.slice(0, 5);
}

function hasSlotCheck() {
  return Boolean(state.data?.check_start && state.data?.check_end);
}

function formatRateLine(f) {
  const label = f.calendar_season || f.season || 'Regular';
  const prefix = f.rate_from ? 'From ' : '';
  const price = `${prefix}₱${Number(f.rate).toLocaleString('en-PH')}`;
  const uses = Number(f.uses_count) > 1 ? ` · ${f.uses_count} uses` : '';
  const unit = f.min_hours ? ` · ${f.min_hours}-hr min` : '/hr';
  return `${label} · ${price}${unit}${uses}`;
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

  // Only surface the day's schedule when there are bookings — the status pill
  // already communicates the free case, so a separate "free" note is redundant.
  const scheduleBlock = visibleBookings.length
    ? `<details class="fac-venue-card__schedule">
        <summary>${visibleBookings.length} booking${visibleBookings.length === 1 ? '' : 's'} this day</summary>
        <ul class="venue-slot-list">${bookingsHtml}</ul>
      </details>`
    : '';

  return `
    <article class="fac-venue-card${rowClass}${f.has_pending ? ' has-pending' : ''}">
      <div class="fac-venue-card__hero">
        <img
          src="${escapeHtml(venuePreviewImage({
            name: f.name,
            label: f.label,
            item: f.item,
            category: f.category || f.facility_group,
            facility_group: f.facility_group || f.category,
            room_code: f.room_code,
            preview_images: f.preview_images || [],
          }))}"
          alt=""
          loading="lazy"
        />
      </div>
      <div class="fac-venue-card__body">
        <h4 class="fac-venue-card__name">${escapeHtml(f.label || f.item)}</h4>
        <p class="fac-venue-card__rate">${escapeHtml(formatRateLine(f))}</p>
        <span class="fac-venue-card__status ${badge.cls === 'venue-space-row__badge--free' ? 'fac-venue-card__status--free' : 'fac-venue-card__status--booked'}">${badge.text}</span>
        ${scheduleBlock}
        <div class="fac-venue-card__links">
          <a href="reservations.html?tab=venues" class="fac-room-card__link">Manage bookings</a>
          <a href="calendar.html?date=${encodeURIComponent(state.date || state.data?.date || dateOnly())}&amp;q=${encodeURIComponent(f.name || f.label || f.item || '')}" class="fac-room-card__link">View on calendar</a>
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

function filterFacilities(facilities) {
  if (!state.search.trim()) return facilities;
  return facilities.filter((f) => matchesSearch(f));
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

function updateSchedulePlanUi() {
  const panel = document.getElementById('venue-date-plan');
  const feedback = document.getElementById('venue-schedule-feedback');

  panel?.classList.toggle('hidden', !state.schedulePanelOpen);

  if (!feedback) return;

  if (state.scheduleLoading) {
    feedback.classList.remove('hidden', 'is-error');
    feedback.classList.add('is-loading');
    feedback.textContent = 'Loading schedule for the selected date and time…';
    return;
  }

  if (state.scheduleError) {
    feedback.classList.remove('hidden', 'is-loading');
    feedback.classList.add('is-error');
    feedback.textContent = state.scheduleError;
    return;
  }

  if (state.schedulePanelOpen && state.endTime <= state.startTime) {
    feedback.classList.remove('hidden', 'is-loading');
    feedback.classList.add('is-error');
    feedback.textContent = 'End time must be after start time.';
    return;
  }

  if (state.schedulePanelOpen && state.data) {
    const open = state.data.summary?.freeForSlot;
    feedback.classList.remove('hidden', 'is-error', 'is-loading');
    feedback.textContent = open != null
      ? `${open} space${open === 1 ? '' : 's'} free for this slot.`
      : 'Schedule loaded — adjust date or time to refresh.';
    return;
  }

  if (state.schedulePanelOpen) {
    feedback.classList.remove('hidden', 'is-error', 'is-loading');
    feedback.textContent = 'Choose a date and time — the board updates automatically.';
    return;
  }

  feedback.classList.add('hidden');
  feedback.textContent = '';
}

function openSchedulePanel() {
  state.schedulePanelOpen = true;
  const dateInput = document.getElementById('venue-schedule-date');
  const startInput = document.getElementById('venue-schedule-start');
  const endInput = document.getElementById('venue-schedule-end');
  const today = dateOnly();
  if (dateInput && !dateInput.value) {
    dateInput.value = today;
    dateInput.min = today;
    state.date = today;
  } else if (dateInput) {
    dateInput.min = today;
  }
  if (startInput && !startInput.value) startInput.value = '09:00';
  if (endInput && !endInput.value) endInput.value = '12:00';
  readSlotInputs();
  updateSchedulePlanUi();
  loadSchedule(state.date || today);
  document.getElementById('venue-date-plan')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeSchedulePanel() {
  state.schedulePanelOpen = false;
  updateSchedulePlanUi();
  loadSchedule(state.date || dateOnly());
}

function renderSchedule() {
  const mount = document.getElementById('venue-schedule-mount');
  if (!mount) return;

  updateSchedulePlanUi();

  const data = state.data;
  if (!data) {
    if (state.scheduleLoading) {
      mount.innerHTML = '<p class="rooms-board-message">Loading venue schedule…</p>';
    }
    return;
  }

  if (state.scheduleLoading) {
    mount.innerHTML = '<p class="rooms-board-message">Loading venue schedule…</p>';
    return;
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
        <p class="rooms-board-empty__text">Try another date or time, or clear your search.</p>
      </div>`;
    return;
  }

  mount.innerHTML = `<div class="fac-board-sections">${sections.join('')}</div>`;
}

async function loadSchedule(date, { background = false } = {}) {
  readSlotInputs();
  state.date = date || state.date || dateOnly();
  state.scheduleError = '';

  const dateInput = document.getElementById('venue-schedule-date');
  const startInput = document.getElementById('venue-schedule-start');
  const endInput = document.getElementById('venue-schedule-end');
  if (state.schedulePanelOpen) {
    if (dateInput) dateInput.value = state.date;
    if (startInput) startInput.value = state.startTime;
    if (endInput) endInput.value = state.endTime;
  }

  const useSlotFilter = state.schedulePanelOpen
    && state.startTime
    && state.endTime
    && state.endTime > state.startTime;

  if (state.schedulePanelOpen && state.endTime <= state.startTime) {
    state.scheduleError = 'End time must be after start time.';
    updateSchedulePlanUi();
    renderSchedule();
    return;
  }

  if (!background) {
    state.scheduleLoading = true;
    updateSchedulePlanUi();
    renderSchedule();
  }

  try {
    state.data = await getVenueScheduleOverview(state.date, useSlotFilter
      ? { startTime: state.startTime, endTime: state.endTime }
      : {});
    state.scheduleError = '';
  } catch (err) {
    state.scheduleError = err.message || 'Could not load schedule.';
    const mount = document.getElementById('venue-schedule-mount');
    if (mount) {
      mount.innerHTML = `<p class="rooms-board-message rooms-board-message--error">${escapeHtml(state.scheduleError)}</p>`;
    }
  } finally {
    state.scheduleLoading = false;
    renderSchedule();
  }
}

function loadToday() {
  const today = dateOnly();
  const input = document.getElementById('venue-schedule-date');
  if (input) input.value = today;
  state.date = today;
  loadSchedule(today);
}

const debouncedSlotChange = debounce(() => {
  if (!state.schedulePanelOpen) return;
  readSlotInputs();
  loadSchedule(state.date);
}, 350);

export function initVenueScheduleBoard() {
  if (venueBoardInitialized) return;
  venueBoardInitialized = true;

  const dateInput = document.getElementById('venue-schedule-date');
  const startInput = document.getElementById('venue-schedule-start');
  const endInput = document.getElementById('venue-schedule-end');
  if (startInput && !startInput.value) startInput.value = '09:00';
  if (endInput && !endInput.value) endInput.value = '12:00';

  document.getElementById('venue-schedule-open')?.addEventListener('click', openSchedulePanel);
  document.getElementById('venue-schedule-close')?.addEventListener('click', closeSchedulePanel);

  document.getElementById('venue-schedule-today')?.addEventListener('click', loadToday);

  dateInput?.addEventListener('change', debouncedSlotChange);
  startInput?.addEventListener('change', debouncedSlotChange);
  endInput?.addEventListener('change', debouncedSlotChange);

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

  onBookingUpdated = () => {
    if (state.date) loadSchedule(state.date);
  };
  window.addEventListener('booking:updated', onBookingUpdated);
  window.addEventListener('venues:changed', onBookingUpdated);
}

export function teardownVenueScheduleBoard() {
  stopBookingPoll?.();
  stopBookingPoll = null;
  if (onBookingUpdated) {
    window.removeEventListener('booking:updated', onBookingUpdated);
    window.removeEventListener('venues:changed', onBookingUpdated);
    onBookingUpdated = null;
  }
  venueBoardInitialized = false;
}

export async function bootstrapVenueScheduleBoard() {
  initVenueScheduleBoard();
  const dateParam = new URLSearchParams(window.location.search).get('date');
  await loadSchedule(dateParam || dateOnly());
  stopBookingPoll?.();
  stopBookingPoll = createBookingPoll(
    () => loadSchedule(state.date, { background: true }),
    { shouldPoll: () => Boolean(state.date) },
  );
}

export function refreshVenueScheduleBoard() {
  return loadSchedule(state.date);
}
