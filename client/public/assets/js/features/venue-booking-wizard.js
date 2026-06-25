/**
 * Admin venue booking wizard — chapels, Prayer Mountain, commons, etc.
 */

import {
  createFacilityBooking, getFacilitiesOverview, getUsers,
} from '/assets/js/services/api.js';
import { escapeHtml, formatDateLong, formatMoney, debounce } from '/assets/js/features/reservation-shared.js';

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
  for (const group of catalog || []) {
    for (const item of group.items || []) {
      for (const rate of item.rates || []) {
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
  const opts = users.map((u) =>
    `<option value="${u.id}"${String(u.id) === String(state.userId) ? ' selected' : ''}>${escapeHtml(u.full_name)}</option>`
  ).join('');
  return `
    <p class="res-lead">Enter the guest or group leader who will use this venue.</p>
    <label class="res-label">Select existing guest (optional)</label>
    <select id="vbw-user" class="res-input"><option value="">— Type new guest below —</option>${opts}</select>
    <label class="res-label">Guest name</label>
    <input id="vbw-name" class="res-input" type="text" value="${escapeHtml(state.guestName)}" placeholder="Full name" />
    <label class="res-label">Email (optional)</label>
    <input id="vbw-email" class="res-input" type="email" value="${escapeHtml(state.email)}" placeholder="email@example.com" />`;
}

function renderStep2() {
  const venueOpts = venues.map((v) =>
    `<option value="${v.id}"${String(v.id) === String(state.facilityId) ? ' selected' : ''}>${escapeHtml(v.label)} — ${formatMoney(v.rate)}/hr</option>`
  ).join('');
  const today = new Date().toISOString().slice(0, 10);
  return `
    <p class="res-lead">Choose the venue space, event date, and time block.</p>
    <label class="res-label">Venue space</label>
    <select id="vbw-facility" class="res-input">${venueOpts || '<option value="">No venues configured</option>'}</select>
    <label class="res-label">Event date</label>
    <input id="vbw-date" class="res-input" type="date" min="${today}" value="${escapeHtml(state.eventDate)}" />
    <div class="res-row">
      <div>
        <label class="res-label">Start time</label>
        <input id="vbw-start" class="res-input" type="time" value="${escapeHtml(state.startTime)}" />
      </div>
      <div>
        <label class="res-label">End time</label>
        <input id="vbw-end" class="res-input" type="time" value="${escapeHtml(state.endTime)}" />
      </div>
    </div>
    <label class="res-label">Number of guests</label>
    <input id="vbw-guests" class="res-input res-input--short" type="number" min="1" max="500" value="${state.guestCount}" />
    <label class="res-label">Notes (optional)</label>
    <textarea id="vbw-notes" class="res-input" rows="2" placeholder="Setup needs, contact person, etc.">${escapeHtml(state.notes)}</textarea>`;
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

function readForm() {
  state.userId = $('vbw-user')?.value || '';
  state.guestName = $('vbw-name')?.value?.trim() || '';
  state.email = $('vbw-email')?.value?.trim() || '';
  state.facilityId = $('vbw-facility')?.value || state.facilityId;
  state.eventDate = $('vbw-date')?.value || '';
  state.startTime = $('vbw-start')?.value || '';
  state.endTime = $('vbw-end')?.value || '';
  state.guestCount = Number($('vbw-guests')?.value || 1);
  state.notes = $('vbw-notes')?.value?.trim() || '';
}

function bindStep1() {
  $('vbw-user')?.addEventListener('change', () => {
    const sel = $('vbw-user');
    const opt = sel?.selectedOptions?.[0];
    if (opt?.value) {
      state.userId = opt.value;
      state.guestName = opt.textContent.trim();
      $('vbw-name').value = state.guestName;
    }
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
  $('venue-wizard-next').classList.toggle('hidden', state.step >= 3);
  $('venue-wizard-confirm').classList.toggle('hidden', state.step < 3);
  showError('');

  if (state.step === 1) bindStep1();
}

function validateStep() {
  readForm();
  if (state.step === 1) {
    if (!state.guestName && !state.userId) return 'Please enter a guest name.';
  }
  if (state.step === 2) {
    if (!state.facilityId) return 'Please select a venue space.';
    if (!state.eventDate) return 'Please pick an event date.';
    if (!state.startTime || !state.endTime) return 'Please set start and end times.';
    if (state.endTime <= state.startTime) return 'End time must be after start time.';
    if (state.guestCount < 1) return 'Guest count must be at least 1.';
  }
  return '';
}

function goNext() {
  const err = validateStep();
  if (err) { showError(err); return; }
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
  const err = validateStep();
  if (err) { showError(err); return; }

  state.saving = true;
  $('venue-wizard-confirm').disabled = true;
  $('venue-wizard-confirm').textContent = 'Saving…';
  showError('');

  try {
    await createFacilityBooking({
      facility_id: Number(state.facilityId),
      event_date: state.eventDate,
      start_time: state.startTime,
      end_time: state.endTime,
      guest_count: state.guestCount,
      notes: state.notes || null,
      user_id: state.userId || null,
      guest_name: state.guestName,
      email: state.email || null,
      status: 'Approved',
    });
    window.dispatchEvent(new CustomEvent('booking:updated'));
    closeVenueBookingWizard();
  } catch (e) {
    showError(e.message || 'Could not save venue booking.');
  } finally {
    state.saving = false;
    $('venue-wizard-confirm').disabled = false;
    $('venue-wizard-confirm').textContent = 'Confirm booking';
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
  if (isOpen) return;
  isOpen = true;
  state = {
    ...emptyState(),
    facilityId: detail.facilityId ? String(detail.facilityId) : '',
    eventDate: detail.eventDate || '',
    startTime: detail.startTime || '09:00',
    endTime: detail.endTime || '12:00',
    guestCount: detail.guestCount || 1,
  };

  try {
    const [userRows, catalog] = await Promise.all([
      getUsers().catch(() => []),
      getFacilitiesOverview(),
    ]);
    users = userRows || [];
    venues = flattenVenues(catalog?.venues);
  } catch {
    users = [];
    venues = [];
  }

  show();
  renderBody();
}

export function closeVenueBookingWizard() {
  if (!isOpen) return;
  isOpen = false;
  hide();
  state = emptyState();
}

export function initVenueBookingWizard() {
  if (initialized) return;
  initialized = true;

  $('venue-wizard-close')?.addEventListener('click', closeVenueBookingWizard);
  $('venue-wizard-overlay')?.addEventListener('click', closeVenueBookingWizard);
  $('venue-wizard-back')?.addEventListener('click', goBack);
  $('venue-wizard-next')?.addEventListener('click', goNext);
  $('venue-wizard-confirm')?.addEventListener('click', confirmSave);
  $('venue-wizard-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'venue-wizard-modal') closeVenueBookingWizard();
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-venue-booking-wizard]')) {
      e.preventDefault();
      openVenueBookingWizard();
    }
  });

  window.addEventListener('venue-booking-wizard:open', (e) => {
    openVenueBookingWizard(e.detail || {});
  });
}
