/**
 * Admin venue booking wizard — chapels, Prayer Mountain, commons, etc.
 */

import {
  createFacilityBooking, getFacilitiesOverview, getUsers,
} from '/assets/js/services/api.js';
import { escapeHtml, formatDateLong, formatMoney } from '/assets/js/features/reservation-shared.js';
import { refreshVenueScheduleBoard } from '/assets/js/features/admin-venue-board.js';

const STEPS = [
  { id: 1, label: 'Guest', short: 'Who is this for?' },
  { id: 2, label: 'Venue & time', short: 'Pick space and schedule' },
  { id: 3, label: 'Review', short: 'Confirm details' },
];

let initialized = false;
let isOpen = false;
let users = [];
let venues = [];
let state = emptyState();

function $(id) { return document.getElementById(id); }

function emptyState() {
  return {
    step: 1,
    userId: '',
    guestName: '',
    email: '',
    facilityId: '',
    eventDate: '',
    startTime: '09:00',
    endTime: '12:00',
    guestCount: 1,
    notes: '',
    saving: false,
  };
}

function flattenVenues(catalog) {
  const rows = [];
  for (const group of catalog?.venues || catalog || []) {
    if (!group?.items) continue;
    for (const item of group.items) {
      for (const rate of item.rates || []) {
        if (!rate?.id) continue;
        rows.push({
          id: rate.id,
          category: group.category,
          item: item.item,
          season: rate.season,
          rate: rate.rate,
          label: `${group.category} — ${item.item} (${rate.season})`,
        });
      }
    }
  }
  return rows.sort((a, b) => a.label.localeCompare(b.label));
}

function selectedVenue() {
  return venues.find((v) => String(v.id) === String(state.facilityId));
}

function normalizeTime(value) {
  if (!value) return '';
  const raw = String(value).trim();
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(raw)) return raw.slice(0, 5);
  return raw.slice(0, 5);
}

function renderSteps() {
  const el = $('venue-wizard-steps');
  if (!el) return;
  el.innerHTML = STEPS.map((s) => {
    const done = s.id < state.step;
    const active = s.id === state.step;
    return `<div class="res-step${active ? ' is-active' : ''}${done ? ' is-done' : ''}">
      <span class="res-step-num">${s.id}</span>
      <span class="res-step-label">${s.label}</span>
    </div>`;
  }).join('');
}

function renderStep1() {
  const opts = users.map((u) => {
    const name = u.full_name || u.name || '';
    const email = u.email || '';
    return `<option value="${u.id}" data-name="${escapeHtml(name)}" data-email="${escapeHtml(email)}"${String(u.id) === String(state.userId) ? ' selected' : ''}>${escapeHtml(name)}</option>`;
  }).join('');
  return `
    <p class="res-lead">Enter the guest or group leader who will use this venue.</p>
    <label class="res-label">Select existing guest (optional)</label>
    <select id="vbw-user" class="res-input"><option value="">— Type new guest below —</option>${opts}</select>
    <label class="res-label">Guest name</label>
    <input id="vbw-name" class="res-input" type="text" value="${escapeHtml(state.guestName)}" placeholder="Full name" required />
    <label class="res-label">Email (optional)</label>
    <input id="vbw-email" class="res-input" type="email" value="${escapeHtml(state.email)}" placeholder="email@example.com" />`;
}

function renderStep2() {
  if (!venues.length) {
    return `
      <p class="res-lead">No venue spaces are configured yet.</p>
      <div class="res-banner res-banner--warn">
        Add venue prices under <strong>Facilities → Venue spaces → Venue prices</strong>, then try again.
      </div>`;
  }
  const venueOpts = venues.map((v) =>
    `<option value="${v.id}"${String(v.id) === String(state.facilityId) ? ' selected' : ''}>${escapeHtml(v.label)} — ${formatMoney(v.rate)}/hr</option>`
  ).join('');
  const today = new Date().toISOString().slice(0, 10);
  return `
    <p class="res-lead">Choose the venue space, event date, and time block.</p>
    <label class="res-label">Venue space</label>
    <select id="vbw-facility" class="res-input" required>${venueOpts}</select>
    <label class="res-label">Event date</label>
    <input id="vbw-date" class="res-input" type="date" min="${today}" value="${escapeHtml(state.eventDate)}" required />
    <div class="res-row">
      <div>
        <label class="res-label">Start time</label>
        <input id="vbw-start" class="res-input" type="time" value="${escapeHtml(state.startTime)}" required />
      </div>
      <div>
        <label class="res-label">End time</label>
        <input id="vbw-end" class="res-input" type="time" value="${escapeHtml(state.endTime)}" required />
      </div>
    </div>
    <label class="res-label">Number of guests</label>
    <input id="vbw-guests" class="res-input res-input--short" type="number" min="1" max="500" value="${state.guestCount}" />
    <label class="res-label">Notes (optional)</label>
    <textarea id="vbw-notes" class="res-input" rows="3" placeholder="Setup needs, contact person, etc.">${escapeHtml(state.notes)}</textarea>`;
}

function renderStep3() {
  const v = selectedVenue();
  return `
    <p class="res-lead">Review everything before saving. The booking will be confirmed immediately.</p>
    <div class="res-review">
      <h4>Guest</h4>
      <p><strong>${escapeHtml(state.guestName || '—')}</strong>${state.email ? `<br>${escapeHtml(state.email)}` : ''}</p>
    </div>
    <div class="res-review">
      <h4>Venue</h4>
      <p><strong>${escapeHtml(v?.label || '—')}</strong></p>
    </div>
    <div class="res-review">
      <h4>Schedule</h4>
      <p>${state.eventDate ? formatDateLong(state.eventDate) : '—'}<br>
      ${escapeHtml(state.startTime)} – ${escapeHtml(state.endTime)} · ${state.guestCount} guest${state.guestCount === 1 ? '' : 's'}</p>
    </div>
    ${state.notes ? `<div class="res-review"><h4>Notes</h4><p>${escapeHtml(state.notes)}</p></div>` : ''}`;
}

/** Only update fields that exist in the DOM (avoids wiping state on review step). */
function readForm() {
  const userEl = $('vbw-user');
  if (userEl) state.userId = userEl.value || '';

  const nameEl = $('vbw-name');
  if (nameEl) state.guestName = nameEl.value.trim();

  const emailEl = $('vbw-email');
  if (emailEl) state.email = emailEl.value.trim();

  const facilityEl = $('vbw-facility');
  if (facilityEl) state.facilityId = facilityEl.value || '';

  const dateEl = $('vbw-date');
  if (dateEl) state.eventDate = dateEl.value || '';

  const startEl = $('vbw-start');
  if (startEl) state.startTime = normalizeTime(startEl.value);

  const endEl = $('vbw-end');
  if (endEl) state.endTime = normalizeTime(endEl.value);

  const guestsEl = $('vbw-guests');
  if (guestsEl) state.guestCount = Number(guestsEl.value || 1);

  const notesEl = $('vbw-notes');
  if (notesEl) state.notes = notesEl.value.trim();
}

function bindStep1() {
  $('vbw-user')?.addEventListener('change', () => {
    const sel = $('vbw-user');
    const opt = sel?.selectedOptions?.[0];
    if (!opt?.value) return;
    state.userId = opt.value;
    state.guestName = opt.getAttribute('data-name') || opt.textContent.trim();
    state.email = opt.getAttribute('data-email') || '';
    if ($('vbw-name')) $('vbw-name').value = state.guestName;
    if ($('vbw-email')) $('vbw-email').value = state.email;
  });
}

function showError(msg) {
  const el = $('venue-wizard-error');
  if (!el) return;
  if (!msg) { el.classList.add('hidden'); el.textContent = ''; return; }
  el.textContent = msg;
  el.classList.remove('hidden');
}

function renderBody() {
  renderSteps();
  const mount = $('venue-wizard-body');
  if (!mount) return;
  if (state.step === 1) mount.innerHTML = renderStep1();
  else if (state.step === 2) mount.innerHTML = renderStep2();
  else mount.innerHTML = renderStep3();

  $('venue-wizard-title').textContent = 'Book a venue';
  $('venue-wizard-subtitle').textContent = STEPS[state.step - 1]?.short || '';
  $('venue-wizard-back').classList.toggle('hidden', state.step <= 1);
  $('venue-wizard-next').classList.toggle('hidden', state.step >= 3 || (state.step === 2 && !venues.length));
  $('venue-wizard-confirm').classList.toggle('hidden', state.step < 3);
  showError('');

  if (state.step === 1) bindStep1();
}

function validateStep1() {
  if (!state.guestName && !state.userId) return 'Please enter a guest name.';
  return '';
}

function validateStep2() {
  if (!venues.length) return 'No venue spaces configured.';
  if (!state.facilityId) return 'Please select a venue space.';
  if (!state.eventDate) return 'Please pick an event date.';
  if (!state.startTime || !state.endTime) return 'Please set start and end times.';
  if (state.endTime <= state.startTime) return 'End time must be after start time.';
  if (state.guestCount < 1) return 'Guest count must be at least 1.';
  return '';
}

function validateAll() {
  const e1 = validateStep1();
  if (e1) return e1;
  return validateStep2();
}

function validateCurrentStep() {
  readForm();
  if (state.step === 1) return validateStep1();
  if (state.step === 2) return validateStep2();
  return validateAll();
}

function goNext() {
  const err = validateCurrentStep();
  if (err) { showError(err); return; }
  if (state.step === 2 && !venues.length) return;
  state.step += 1;
  renderBody();
}

function goBack() {
  readForm();
  state.step = Math.max(1, state.step - 1);
  renderBody();
}

async function confirmSave() {
  readForm();
  const err = validateAll();
  if (err) { showError(err); return; }

  state.saving = true;
  const confirmBtn = $('venue-wizard-confirm');
  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Saving…';
  showError('');

  try {
    const result = await createFacilityBooking({
      facility_id: Number(state.facilityId),
      event_date: state.eventDate,
      start_time: state.startTime,
      end_time: state.endTime,
      guest_count: state.guestCount,
      notes: state.notes || null,
      user_id: state.userId ? Number(state.userId) : null,
      guest_name: state.guestName,
      email: state.email || null,
      status: 'Approved',
    });

    window.dispatchEvent(new CustomEvent('booking:updated', { detail: { venueBooking: result?.booking } }));
    refreshVenueScheduleBoard().catch(() => {});
    closeVenueBookingWizard();
  } catch (e) {
    showError(e.message || 'Could not save venue booking.');
  } finally {
    state.saving = false;
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Confirm booking';
    }
  }
}

function show() {
  $('venue-wizard-overlay')?.classList.remove('hidden');
  $('venue-wizard-modal')?.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function hide() {
  $('venue-wizard-overlay')?.classList.add('hidden');
  $('venue-wizard-modal')?.classList.add('hidden');
  document.body.style.overflow = '';
}

export function isVenueBookingWizardOpen() { return isOpen; }

export async function openVenueBookingWizard(detail = {}) {
  if (!$('venue-wizard-modal')) {
    console.error('[venue-wizard] Modal not found — hard refresh the page.');
    return;
  }
  if (isOpen) closeVenueBookingWizard();

  isOpen = true;
  state = {
    ...emptyState(),
    facilityId: detail.facilityId ? String(detail.facilityId) : '',
    eventDate: detail.eventDate || '',
    startTime: normalizeTime(detail.startTime || '09:00'),
    endTime: normalizeTime(detail.endTime || '12:00'),
    guestCount: detail.guestCount || 1,
  };

  show();
  $('venue-wizard-body').innerHTML = '<p class="res-lead">Loading venue list…</p>';

  try {
    const [userRows, catalog] = await Promise.all([
      getUsers().catch(() => []),
      getFacilitiesOverview(),
    ]);
    users = userRows || [];
    venues = flattenVenues(catalog);
    if (!state.facilityId && venues.length === 1) {
      state.facilityId = String(venues[0].id);
    }
  } catch (err) {
    users = [];
    venues = [];
    showError(err.message || 'Could not load venues.');
  }

  renderBody();
}

export function closeVenueBookingWizard() {
  if (!isOpen) return;
  isOpen = false;
  hide();
  state = emptyState();
  showError('');
}

export function initVenueBookingWizard() {
  if (initialized) return;
  initialized = true;

  if (!$('venue-wizard-modal')) return;

  $('venue-wizard-close')?.addEventListener('click', closeVenueBookingWizard);
  $('venue-wizard-overlay')?.addEventListener('click', closeVenueBookingWizard);
  $('venue-wizard-back')?.addEventListener('click', goBack);
  $('venue-wizard-next')?.addEventListener('click', goNext);
  $('venue-wizard-confirm')?.addEventListener('click', confirmSave);
  $('venue-wizard-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'venue-wizard-modal') closeVenueBookingWizard();
  });

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-open-venue-booking-wizard]');
    if (!trigger) return;
    e.preventDefault();
    openVenueBookingWizard();
  });

  window.addEventListener('venue-booking-wizard:open', (e) => {
    openVenueBookingWizard(e.detail || {});
  });
}
