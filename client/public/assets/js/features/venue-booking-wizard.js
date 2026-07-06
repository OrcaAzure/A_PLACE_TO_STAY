/**
 * Admin venue booking wizard — chapels, Prayer Mountain, commons, etc.
 */

import {
  createFacilityBooking, getFacilitiesOverview, getFacilityBookingById, getUsers,
  getVenueRateQuote, updateFacilityBooking, checkVenueSlotAvailability,
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
    mode: 'create',
    step: 1,
    bookingId: null,
    fromRequestId: null,
    modifyRequest: false,
    originalStatus: 'Approved',
    userId: '',
    guestName: '',
    email: '',
    spaceKey: '',
    eventVenueId: '',
    facilityId: '',
    category: '',
    item: '',
    eventDate: '',
    startTime: '09:00',
    endTime: '13:00',
    guestCount: 1,
    notes: '',
    guestMessage: '',
    rateQuote: null,
    saving: false,
    formError: '',
    slotCheck: { checked: false, available: true, message: '' },
  };
}

function isEditing() {
  return Boolean(state.bookingId || state.fromRequestId || state.modifyRequest);
}

function wizardTitle() {
  if (state.modifyRequest) return 'Modify & Approve Request';
  if (state.mode === 'edit') return 'Edit Venue Booking';
  return 'Book a venue';
}

function confirmLabel() {
  if (state.saving) return 'Saving…';
  if (state.modifyRequest) return 'Save & approve';
  if (state.mode === 'edit') return 'Save changes';
  return 'Confirm booking';
}

function buildVenueSpaces(catalog) {
  const rows = [];
  for (const group of catalog?.venues || []) {
    for (const item of group.items || []) {
      const catalogId = item.facility_id ?? item.id;
      rows.push({
        spaceKey: catalogId ? String(catalogId) : `${group.category}\x1f${item.item}`,
        facilityId: catalogId,
        eventVenueId: catalogId,
        category: group.category,
        item: item.item,
        label: item.label || `${group.category} — ${item.item}`,
        description: item.description || '',
        rates: item.rates || [],
      });
    }
  }
  return rows.sort((a, b) => a.label.localeCompare(b.label));
}

function findSpaceByFacilityId(facilityId) {
  if (!facilityId) return null;
  return venues.find((v) => String(v.facilityId) === String(facilityId)
    || v.rates?.some((r) => String(r.id) === String(facilityId))) || null;
}

function selectedVenue() {
  return venues.find((v) => v.spaceKey === state.spaceKey);
}

function normalizeTime(value) {
  if (!value) return '';
  const raw = String(value).trim();
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(raw)) return raw.slice(0, 5);
  return raw.slice(0, 5);
}

function addHoursToTime(time, hours) {
  const [h, m] = normalizeTime(time || '09:00').split(':').map(Number);
  const next = h + Math.max(1, Number(hours) || 1);
  return `${String(Math.min(23, next)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function rateHintHtml() {
  if (!state.eventDate || !state.spaceKey) {
    return '<p id="vbw-rate-hint" class="text-sm text-slate-500 mt-1">Rate is based on the event date (Regular or Peak).</p>';
  }
  if (!state.rateQuote) {
    return '<p id="vbw-rate-hint" class="text-sm text-slate-500 mt-1">Checking rate for this date…</p>';
  }
  const label = state.rateQuote.calendar_season || state.rateQuote.season;
  const rateText = state.rateQuote.rate_label
    ? escapeHtml(state.rateQuote.rate_label)
    : `${formatMoney(state.rateQuote.rate)}/hr`;
  return `<p id="vbw-rate-hint" class="text-sm text-slate-600 mt-1"><strong>${escapeHtml(label)}</strong> rate: ${rateText}</p>`;
}

function slotInlineError() {
  if (!state.slotCheck.checked || state.slotCheck.available) return '';
  return state.slotCheck.message || 'This time slot is not available.';
}

function updateSlotErrorUI() {
  const el = $('vbw-slot-error');
  if (!el) return;
  const msg = slotInlineError();
  if (msg) {
    el.textContent = msg;
    el.classList.remove('hidden');
  } else {
    el.textContent = '';
    el.classList.add('hidden');
  }
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
        Add venue rates in system settings, then try again.
      </div>`;
  }
  const venueOpts = venues.map((v) =>
    `<option value="${escapeHtml(v.spaceKey)}"${v.spaceKey === state.spaceKey ? ' selected' : ''}>${escapeHtml(v.label)}</option>`
  ).join('');
  const today = new Date().toISOString().slice(0, 10);
  return `
    <p class="res-lead">Choose the venue space, event date, and time block.</p>
    <label class="res-label">Venue space</label>
    <select id="vbw-space" class="res-input" required>${venueOpts}</select>
    <label class="res-label">Event date</label>
    <input id="vbw-date" class="res-input" type="date" min="${today}" value="${escapeHtml(state.eventDate)}" required />
    ${rateHintHtml()}
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
    <p id="vbw-slot-error" class="res-error res-slot-error${slotInlineError() ? '' : ' hidden'}" role="alert">${escapeHtml(slotInlineError())}</p>
    <label class="res-label">Number of guests</label>
    <input id="vbw-guests" class="res-input res-input--short" type="number" min="1" max="500" value="${state.guestCount}" />
    <label class="res-label">Notes (optional)</label>
    <textarea id="vbw-notes" class="res-input" rows="3" placeholder="Setup needs, contact person, etc.">${escapeHtml(state.notes)}</textarea>`;
}

function renderStep3() {
  const v = selectedVenue();
  const rateLine = state.rateQuote
    ? `${state.rateQuote.calendar_season || state.rateQuote.season} rate · ${formatMoney(state.rateQuote.rate)}/hr`
    : '';
  const estimatedTotal = state.rateQuote?.estimated_total != null
    ? formatMoney(state.rateQuote.estimated_total)
    : null;
  const modifyBlock = state.modifyRequest ? `
    <div class="res-banner res-banner--warn">
      You are approving this request with changes. The guest will receive an email explaining what changed.
    </div>
    <label class="res-label" for="vbw-guest-message">Message to guest (required)</label>
    <textarea id="vbw-guest-message" class="res-input" rows="3" placeholder="e.g. We moved your event to the larger chapel to accommodate your guest count.">${escapeHtml(state.guestMessage)}</textarea>
  ` : '';

  return `
    <p class="res-lead">${state.modifyRequest
    ? 'Review the updated details before approving.'
    : state.mode === 'edit'
      ? 'Review your changes before saving.'
      : 'Review everything before saving. The booking will be confirmed immediately.'}</p>
    ${modifyBlock}
    <div class="res-review">
      <h4>Guest</h4>
      <p><strong>${escapeHtml(state.guestName || '—')}</strong>${state.email ? `<br>${escapeHtml(state.email)}` : ''}</p>
    </div>
    <div class="res-review">
      <h4>Venue</h4>
      <p><strong>${escapeHtml(v?.label || '—')}</strong>${rateLine ? `<br>${escapeHtml(rateLine)}` : ''}</p>
    </div>
    <div class="res-review">
      <h4>Schedule</h4>
      <p>${state.eventDate ? formatDateLong(state.eventDate) : '—'}<br>
      ${escapeHtml(state.startTime)} – ${escapeHtml(state.endTime)} · ${state.guestCount} guest${state.guestCount === 1 ? '' : 's'}</p>
      ${estimatedTotal ? `<p class="res-hint">Estimated total: ${estimatedTotal}</p>` : ''}
    </div>
    ${state.notes ? `<div class="res-review"><h4>Notes</h4><p>${escapeHtml(state.notes)}</p></div>` : ''}`;
}

function syncSpaceFromKey() {
  const v = selectedVenue();
  if (v) {
    state.facilityId = v.facilityId || v.eventVenueId || '';
    state.eventVenueId = state.facilityId;
    state.category = v.category;
    state.item = v.item;
  }
}

/** Only update fields that exist in the DOM (avoids wiping state on review step). */
function readForm() {
  const userEl = $('vbw-user');
  if (userEl) state.userId = userEl.value || '';

  const nameEl = $('vbw-name');
  if (nameEl) state.guestName = nameEl.value.trim();

  const emailEl = $('vbw-email');
  if (emailEl) state.email = emailEl.value.trim();

  const spaceEl = $('vbw-space');
  if (spaceEl) {
    state.spaceKey = spaceEl.value || '';
    syncSpaceFromKey();
  }

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

  const msgEl = $('vbw-guest-message');
  if (msgEl) state.guestMessage = msgEl.value.trim();
}

async function refreshSlotAvailability() {
  const catalogId = state.facilityId || state.eventVenueId;
  if (!catalogId || !state.eventDate || !state.startTime || !state.endTime || state.endTime <= state.startTime) {
    state.slotCheck = { checked: false, available: true, message: '' };
    updateSlotErrorUI();
    return;
  }
  try {
    const slot = await checkVenueSlotAvailability({
      facility_id: catalogId,
      event_date: state.eventDate,
      start_time: state.startTime,
      end_time: state.endTime,
      exclude_booking_id: state.bookingId || state.fromRequestId || undefined,
    });
    state.slotCheck = {
      checked: true,
      available: Boolean(slot.available),
      message: slot.available ? '' : (slot.message || 'This time slot is not available.'),
    };
    if (slot.available && state.rateQuote) {
      state.rateQuote = { ...state.rateQuote, estimated_total: slot.estimated_total };
    }
  } catch (err) {
    state.slotCheck = {
      checked: true,
      available: false,
      message: err.message || 'Could not verify this time slot.',
    };
  }
  updateSlotErrorUI();
}

async function refreshRateQuote() {
  const hint = $('vbw-rate-hint');
  if ((!state.facilityId && !state.eventVenueId && (!state.category || !state.item)) || !state.eventDate) {
    state.rateQuote = null;
    if (hint) hint.textContent = 'Rate is based on the event date (Regular or Peak).';
    return;
  }
  if (hint) hint.textContent = 'Checking rate for this date…';
  try {
    const catalogId = state.facilityId || state.eventVenueId;
    state.rateQuote = catalogId
      ? await getVenueRateQuote({ facility_id: catalogId, date: state.eventDate })
      : await getVenueRateQuote(state.category, state.item, state.eventDate);
    await refreshSlotAvailability();
    if (hint) {
      const label = state.rateQuote.calendar_season || state.rateQuote.season;
      hint.innerHTML = `<strong>${escapeHtml(label)}</strong> rate: ${formatMoney(state.rateQuote.rate)}/hr`;
    }
  } catch {
    state.rateQuote = null;
    if (hint) hint.textContent = 'Could not load rate for this date.';
  }
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

function bindStep2() {
  const onScheduleChange = async () => {
    readForm();
    state.formError = '';
    await refreshRateQuote();
  };
  $('vbw-space')?.addEventListener('change', onScheduleChange);
  $('vbw-date')?.addEventListener('change', onScheduleChange);
  $('vbw-start')?.addEventListener('change', onScheduleChange);
  $('vbw-end')?.addEventListener('change', onScheduleChange);
}

function showError(msg) {
  state.formError = msg || '';
  const el = $('venue-wizard-error');
  if (!el) return;
  if (!state.formError) {
    el.classList.add('hidden');
    el.textContent = '';
    return;
  }
  el.textContent = state.formError;
  el.classList.remove('hidden');
}

function renderBody() {
  renderSteps();
  const mount = $('venue-wizard-body');
  if (!mount) return;
  if (state.step === 1) mount.innerHTML = renderStep1();
  else if (state.step === 2) mount.innerHTML = renderStep2();
  else mount.innerHTML = renderStep3();

  $('venue-wizard-title').textContent = wizardTitle();
  $('venue-wizard-subtitle').textContent = STEPS[state.step - 1]?.short || '';
  $('venue-wizard-back').classList.toggle('hidden', state.step <= 1);
  $('venue-wizard-next').classList.toggle('hidden', state.step >= 3 || (state.step === 2 && !venues.length));
  $('venue-wizard-confirm').classList.toggle('hidden', state.step < 3);
  const confirmBtn = $('venue-wizard-confirm');
  if (confirmBtn) {
    confirmBtn.disabled = state.saving;
    confirmBtn.textContent = confirmLabel();
  }
  showError(state.formError);

  if (state.step === 1) bindStep1();
  if (state.step === 2) {
    bindStep2();
    refreshRateQuote().catch(() => {});
  }
}

function validateStep1() {
  if (!state.guestName && !state.userId) return 'Please enter a guest name.';
  return '';
}

function validateStep2() {
  if (!venues.length) return 'No venue spaces configured.';
  if (!state.spaceKey) return 'Please select a venue space.';
  if (!state.eventDate) return 'Please pick an event date.';
  if (!state.startTime || !state.endTime) return 'Please set start and end times.';
  if (state.endTime <= state.startTime) return 'End time must be after start time.';
  if (state.guestCount < 1) return 'Guest count must be at least 1.';
  if (state.slotCheck.checked && !state.slotCheck.available) {
    return state.slotCheck.message || 'This time slot is not available.';
  }
  return '';
}

function validateAll() {
  const e1 = validateStep1();
  if (e1) return e1;
  const e2 = validateStep2();
  if (e2) return e2;
  if (state.modifyRequest && !state.guestMessage?.trim()) {
    return 'Please enter a message explaining the change for the guest.';
  }
  return '';
}

function validateCurrentStep() {
  readForm();
  if (state.step === 1) return validateStep1();
  if (state.step === 2) return validateStep2();
  return '';
}

async function goNext() {
  readForm();
  if (state.step === 2 && venues.length) {
    await refreshRateQuote();
  }
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

function applySpaceFromFacilityId(facilityId) {
  if (!facilityId) return;
  const id = String(facilityId);
  const match = venues.find((v) => String(v.facilityId) === id || String(v.eventVenueId) === id)
    || findSpaceByFacilityId(id);
  if (match) {
    state.spaceKey = match.spaceKey;
    state.facilityId = match.facilityId || match.eventVenueId || id;
    state.eventVenueId = state.facilityId;
    state.category = match.category;
    state.item = match.item;
  } else {
    state.spaceKey = id;
    state.facilityId = id;
    state.eventVenueId = id;
  }
}

async function confirmSave() {
  readForm();
  const err = validateAll();
  if (err) { showError(err); return; }

  state.saving = true;
  renderBody();
  showError('');

  try {
    const catalogId = state.facilityId || state.eventVenueId;
    if (catalogId) {
      await refreshSlotAvailability();
      if (!state.slotCheck.available) {
        const msg = state.slotCheck.message || 'This time slot is not available.';
        state.formError = msg;
        state.saving = false;
        state.step = 2;
        renderBody();
        return;
      }
    }

    const noteText = state.notes || '';
    const modLine = state.modifyRequest && state.guestMessage?.trim()
      ? `[Modified by admin] ${state.guestMessage.trim()}`
      : '';
    const combinedNotes = [noteText, modLine].filter(Boolean).join('\n') || null;

    const payload = {
      facility_id: catalogId ? Number(catalogId) : undefined,
      category: state.category,
      item: state.item,
      event_date: state.eventDate,
      start_time: state.startTime,
      end_time: state.endTime,
      guest_count: state.guestCount,
      notes: combinedNotes,
      user_id: state.userId ? Number(state.userId) : null,
      guest_name: state.guestName,
      email: state.email || null,
      status: state.modifyRequest ? 'Approved' : (state.originalStatus || 'Approved'),
      modification_message: state.modifyRequest ? state.guestMessage?.trim() : undefined,
      notify_guest: Boolean(state.modifyRequest),
      notify_modification: Boolean(state.modifyRequest),
    };

    let result;
    const targetId = state.bookingId || state.fromRequestId;
    if (isEditing() && targetId) {
      result = await updateFacilityBooking(targetId, payload);
    } else {
      payload.status = 'Approved';
      result = await createFacilityBooking(payload);
    }

    window.dispatchEvent(new CustomEvent('booking:updated', { detail: { venueBooking: result?.booking } }));
    refreshVenueScheduleBoard().catch(() => {});
    closeVenueBookingWizard();
  } catch (e) {
    const msg = e.message || 'Could not save venue booking.';
    if (/booked|slot|not available|overlap/i.test(msg)) {
      state.slotCheck = { checked: true, available: false, message: msg };
      state.formError = msg;
      state.step = 2;
    } else {
      showError(msg);
    }
  } finally {
    state.saving = false;
    renderBody();
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
    mode: detail.mode || 'create',
    bookingId: detail.bookingId || null,
    fromRequestId: detail.fromRequestId || null,
    modifyRequest: Boolean(detail.modifyRequest),
    spaceKey: detail.spaceKey || '',
    category: detail.category || '',
    item: detail.item || '',
    eventDate: detail.eventDate || '',
    startTime: normalizeTime(detail.startTime || '09:00'),
    endTime: normalizeTime(detail.endTime || addHoursToTime(detail.startTime || '09:00', 4)),
    guestCount: detail.guestCount || 1,
  };

  if (detail.prefill) {
    const p = detail.prefill;
    state.userId = p.userId || state.userId;
    state.guestName = p.guestName || state.guestName;
    state.email = p.email || state.email;
    state.eventDate = p.eventDate || state.eventDate;
    state.startTime = normalizeTime(p.startTime || state.startTime);
    state.endTime = normalizeTime(p.endTime || state.endTime);
    state.guestCount = p.guestCount || state.guestCount;
    state.notes = p.notes || state.notes;
    if (p.facilityId) applySpaceFromFacilityId(p.facilityId);
  }

  show();
  $('venue-wizard-body').innerHTML = '<p class="res-lead">Loading venue list…</p>';

  try {
    const loaders = [
      getUsers().catch(() => []),
      getFacilitiesOverview(),
    ];
    if (state.bookingId) loaders.push(getFacilityBookingById(state.bookingId));
    else if (state.fromRequestId) loaders.push(getFacilityBookingById(state.fromRequestId));

    const results = await Promise.all(loaders);
    users = results[0] || [];
    const catalog = results[1];
    venues = buildVenueSpaces(catalog);

    const booking = results[2];
    if (booking) {
      state.bookingId = booking.id;
      if (state.modifyRequest && !state.fromRequestId) {
        state.fromRequestId = booking.id;
      }
      state.userId = booking.user_id || '';
      state.guestName = booking.guest_name || '';
      state.email = booking.guest_email || '';
      state.eventDate = String(booking.event_date).slice(0, 10);
      state.startTime = normalizeTime(booking.start_time);
      state.endTime = normalizeTime(booking.end_time);
      state.guestCount = booking.guest_count || 1;
      state.notes = booking.notes || '';
      state.originalStatus = booking.status || 'Approved';
      applySpaceFromFacilityId(booking.facility_id);
    } else if (detail.facility_id || detail.facilityId || detail.event_venue_id || detail.eventVenueId) {
      applySpaceFromFacilityId(detail.facility_id || detail.facilityId || detail.event_venue_id || detail.eventVenueId);
    } else if (detail.category && detail.item) {
      const match = venues.find((v) => v.category === detail.category && v.item === detail.item);
      state.spaceKey = match?.spaceKey || `${detail.category}\x1f${detail.item}`;
      state.facilityId = match?.facilityId || match?.eventVenueId || '';
      state.eventVenueId = state.facilityId;
      state.category = detail.category;
      state.item = detail.item;
    }

    if (!state.spaceKey && venues.length === 1) {
      state.spaceKey = venues[0].spaceKey;
      state.facilityId = venues[0].facilityId || venues[0].eventVenueId || '';
      state.eventVenueId = state.facilityId;
      state.category = venues[0].category;
      state.item = venues[0].item;
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
  $('venue-wizard-next')?.addEventListener('click', () => { goNext().catch((err) => showError(err.message)); });
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
