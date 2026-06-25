/**
 * Admin venue schedule — availability by date for chapels, Prayer Mountain, etc.
 */

import { getVenueScheduleOverview, updateFacilityBooking } from '/assets/js/services/api.js';

const state = { date: '', data: null };

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function dateOnly(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function addDays(base, days) {
  const d = new Date(`${base}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDisplayDate(iso) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function renderFacilityRow(f) {
  const bookingsHtml = f.bookings?.length
    ? f.bookings.map((b) => {
      const pending = b.status === 'Pending';
      return `
        <li class="venue-slot${pending ? ' venue-slot--pending' : ''}">
          <div class="venue-slot__times">${escapeHtml(b.start_label)} – ${escapeHtml(b.end_label)}</div>
          <div class="venue-slot__guest">${escapeHtml(b.guest_name)} · ${b.guest_count} guest${b.guest_count === 1 ? '' : 's'}</div>
          <div class="venue-slot__status">${pending ? 'Awaiting approval' : 'Confirmed'}</div>
          ${pending ? `
            <div class="venue-slot__actions">
              <button type="button" class="dashboard-queue-btn dashboard-queue-btn--approve venue-approve" data-booking-id="${b.id}">Approve</button>
              <button type="button" class="dashboard-queue-btn dashboard-queue-btn--decline venue-reject" data-booking-id="${b.id}">Decline</button>
            </div>` : ''}
        </li>`;
    }).join('')
    : '<li class="venue-slot venue-slot--free"><span class="material-symbols-outlined" aria-hidden="true">event_available</span> Open all day — no bookings yet</li>';

  return `
    <article class="venue-space-row${f.is_free ? ' is-free' : ''}${f.has_pending ? ' has-pending' : ''}">
      <div class="venue-space-row__head">
        <div>
          <h4 class="venue-space-row__name">${escapeHtml(f.item)}</h4>
          <p class="venue-space-row__rate">${escapeHtml(f.season)} · ₱${Number(f.rate).toLocaleString('en-PH')}</p>
        </div>
        <span class="venue-space-row__badge${f.is_free ? ' venue-space-row__badge--free' : ' venue-space-row__badge--booked'}">
          ${f.is_free ? 'Available' : `${f.bookings.length} booking${f.bookings.length === 1 ? '' : 's'}`}
        </span>
      </div>
      <ul class="venue-slot-list">${bookingsHtml}</ul>
    </article>`;
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

  if (summaryEl && data.summary) {
    const s = data.summary;
    summaryEl.textContent = `${formatDisplayDate(data.date)} — ${s.freeToday} open · ${s.bookedToday} booked · ${s.pendingRequests} pending request${s.pendingRequests === 1 ? '' : 's'}`;
  }

  if (!data.venues?.length) {
    mount.innerHTML = '<p class="rooms-board-message">No venue spaces configured yet. Add them under Venue prices.</p>';
    return;
  }

  mount.innerHTML = data.venues.map((group) => `
    <section class="venue-category-block">
      <header class="venue-category-block__head">
        <span class="material-symbols-outlined" aria-hidden="true">${escapeHtml(group.icon || 'place')}</span>
        <h3>${escapeHtml(group.category)}</h3>
      </header>
      <div class="venue-category-block__list">
        ${group.facilities.map(renderFacilityRow).join('')}
      </div>
    </section>`).join('');
}

async function loadSchedule(date) {
  state.date = date || state.date || dateOnly();
  const input = document.getElementById('venue-schedule-date');
  if (input) input.value = state.date;

  const mount = document.getElementById('venue-schedule-mount');
  if (mount) mount.innerHTML = '<p class="rooms-board-message">Loading venue schedule…</p>';

  try {
    state.data = await getVenueScheduleOverview(state.date);
    renderSchedule();
  } catch (err) {
    if (mount) {
      mount.innerHTML = `<p class="rooms-board-message rooms-board-message--error">${escapeHtml(err.message || 'Could not load schedule.')}</p>`;
    }
  }
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
  dateInput?.addEventListener('change', () => loadSchedule(dateInput.value));

  document.querySelectorAll('[data-venue-day]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const offset = Number(btn.getAttribute('data-venue-day') || 0);
      loadSchedule(addDays(dateOnly(), offset));
    });
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
