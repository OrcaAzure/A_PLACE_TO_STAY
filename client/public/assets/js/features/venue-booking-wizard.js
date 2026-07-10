/**
 * Admin venue booking wizard — chapels, Prayer Mountain, commons, etc.
 */

import {
  createFacilityBooking, getFacilitiesOverview, getFacilityBookingById, getUsers,
  getVenueRateQuote, updateFacilityBooking, checkVenueSlotAvailability,
} from '/assets/js/services/api.js';
import { escapeHtml, formatDateLong, formatMoney, isValidEmail } from '/assets/js/features/reservation-shared.js';
import { venuePreviewImage } from '/assets/js/features/facility-display.js';
import {
  validateVenueCapacityClient,
  validateVenueDurationClient,
  venueCapacityLabel,
} from '/assets/js/features/guest-booking-flow.js';
import {
  renderWizardRoomTypeFilter,
  bindWizardRoomTypeFilter,
} from '/assets/js/features/wizard-visuals.js';
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
    contactPhone: '',
    spaceKey: '',
    eventVenueId: '',
    facilityId: '',
    category: '',
    item: '',
    venueSearch: '',
    venueCategory: '',
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

/**
 * Collapse catalog rows that share a physical space into one venue with uses[].
 * Same grouping as guest facilities (category + name + room_code).
 */
function buildVenueSpaces(catalog) {
  const byKey = new Map();
  for (const group of catalog?.venues || []) {
    for (const item of group.items || []) {
      const catalogId = item.facility_id ?? item.id;
      if (!catalogId) continue;
      const key = `${group.category}\x1f${item.name || ''}\x1f${item.room_code || ''}`;
      if (!byKey.has(key)) {
        byKey.set(key, {
          spaceKey: key,
          category: group.category,
          name: item.name || group.category || '',
          roomCode: item.room_code || '',
          description: item.description || '',
          label: item.name
            ? (item.room_code ? `${item.name} (${item.room_code})` : item.name)
            : (item.label || group.category),
          uses: [],
        });
      }
      const venue = byKey.get(key);
      if (item.description && !venue.description) venue.description = item.description;
      venue.uses.push({
        facilityId: catalogId,
        eventVenueId: catalogId,
        functionName: item.package_name || '',
        item: item.item,
        label: item.label || item.package_name || item.name || item.item,
        capacity_min: item.capacity_min ?? null,
        capacity_max: item.capacity_max ?? null,
        min_hours: item.min_hours ?? null,
        rates: item.rates || [],
      });
      if (venue.capacity_min == null && item.capacity_min != null) venue.capacity_min = item.capacity_min;
      if (venue.capacity_max == null && item.capacity_max != null) venue.capacity_max = item.capacity_max;
      if (venue.min_hours == null && item.min_hours != null) venue.min_hours = item.min_hours;
    }
  }
  return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function venueDisplayName(v) {
  if (!v) return '—';
  if (v.roomCode && v.name) return `${v.name} (${v.roomCode})`;
  return v.name || v.label || '—';
}

function venueCardImage(v) {
  return venuePreviewImage({
    name: v.name,
    label: v.label,
    item: v.uses?.[0]?.item,
    category: v.category,
    facility_group: v.category,
    room_code: v.roomCode,
  });
}

function venueRateFromLine(v) {
  const rates = (v.uses || [])
    .flatMap((u) => (u.rates || []).filter((r) => r.season === 'Regular').map((r) => Number(r.rate)))
    .filter((n) => Number.isFinite(n));
  if (!rates.length) return '';
  const min = Math.min(...rates);
  const prefix = v.uses.length > 1 ? 'From ' : '';
  return `${prefix}${formatMoney(min)}/hr`;
}

function collectVenueCategories() {
  const map = new Map();
  for (const v of venues) {
    if (v.category) map.set(v.category, v.category);
  }
  return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
}

function getFilteredVenues() {
  const q = String(state.venueSearch || '').trim().toLowerCase();
  return venues.filter((v) => {
    if (state.venueCategory && v.category !== state.venueCategory) return false;
    if (!q) return true;
    const hay = [
      v.name, v.label, v.roomCode, v.category, v.description,
      ...(v.uses || []).flatMap((u) => [u.functionName, u.item, u.label]),
    ].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

function selectedVenue() {
  return venues.find((v) => v.spaceKey === state.spaceKey) || null;
}

function selectedUse() {
  const v = selectedVenue();
  if (!v?.uses?.length) return null;
  return v.uses.find((u) => String(u.facilityId) === String(state.facilityId)) || v.uses[0];
}

function syncSelection() {
  const v = selectedVenue();
  if (!v) {
    state.facilityId = '';
    state.eventVenueId = '';
    state.category = '';
    state.item = '';
    return;
  }
  state.category = v.category;
  let use = selectedUse();
  if (!use || !v.uses.some((u) => String(u.facilityId) === String(use.facilityId))) {
    use = v.uses[0];
  }
  if (use) {
    state.facilityId = use.facilityId;
    state.eventVenueId = use.facilityId;
    state.item = use.item;
  }
}

function renderVenueOptionCard(v) {
  const selected = v.spaceKey === state.spaceKey;
  const img = venueCardImage(v);
  const usesNote = v.uses.length > 1
    ? `${v.uses.length} uses`
    : (v.uses[0]?.functionName || '');
  const rateLine = venueRateFromLine(v);

  return `
    <button type="button"
      class="wiz-room-option wiz-room-card--grid vbw-venue-card${selected ? ' is-selected' : ''}"
      data-vbw-venue="${escapeHtml(v.spaceKey)}"
      aria-pressed="${selected ? 'true' : 'false'}">
      <div class="wiz-room-option__media">
        <img src="${escapeHtml(img)}" alt="" loading="lazy" />
      </div>
      <div class="wiz-room-option__content">
        <div class="wiz-room-option__body">
          <p class="wiz-room-option__title">${escapeHtml(venueDisplayName(v))}</p>
          <p class="wiz-room-option__meta">${escapeHtml(v.category)}${usesNote ? ` · ${escapeHtml(usesNote)}` : ''}</p>
          ${rateLine ? `<p class="wiz-room-option__hint">${escapeHtml(rateLine)}</p>` : ''}
        </div>
      </div>
    </button>`;
}

function findSpaceByFacilityId(facilityId) {
  if (!facilityId) return null;
  const id = String(facilityId);
  for (const v of venues) {
    const use = v.uses.find((u) => String(u.facilityId) === id
      || u.rates?.some((r) => String(r.id) === id));
    if (use) return { venue: v, use };
  }
  return null;
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
    <label class="res-label" for="vbw-name">Guest name</label>
    <input id="vbw-name" class="res-input" type="text" value="${escapeHtml(state.guestName)}" placeholder="Full name" required />
    <label class="res-label" for="vbw-email">Email <span class="res-label-required">(required)</span></label>
    <input id="vbw-email" class="res-input" type="email" value="${escapeHtml(state.email)}" placeholder="email@example.com" autocomplete="email" required />
    <label class="res-label" for="vbw-phone">Contact number <span class="res-label-optional">(optional)</span></label>
    <input id="vbw-phone" class="res-input" type="tel" value="${escapeHtml(state.contactPhone)}" placeholder="09XX XXX XXXX" autocomplete="tel" />`;
}

function renderStep2() {
  if (!venues.length) {
    return `
      <p class="res-lead">No venue spaces are configured yet.</p>
      <div class="res-banner res-banner--warn">
        Add venue rates in system settings, then try again.
      </div>`;
  }

  const filtered = getFilteredVenues();
  const selected = selectedVenue();
  const use = selectedUse();
  const today = new Date().toISOString().slice(0, 10);
  const categories = collectVenueCategories();

  const useOptions = selected?.uses?.length
    ? selected.uses.map((u) => `
        <option value="${escapeHtml(u.facilityId)}"${String(u.facilityId) === String(state.facilityId) ? ' selected' : ''}>
          ${escapeHtml(u.functionName || u.label || 'Standard booking')}
        </option>`).join('')
    : '';

  const detailsPanel = selected ? `
    <div class="vbw-details-panel">
      <div class="vbw-selected-panel__head">
        <div class="wiz-room-option__thumb">
          <img src="${escapeHtml(venueCardImage(selected))}" alt="" loading="lazy" />
        </div>
        <div>
          <p class="vbw-selected-panel__title">${escapeHtml(venueDisplayName(selected))}</p>
          <p class="vbw-selected-panel__meta">${escapeHtml(selected.category)}</p>
        </div>
      </div>

      ${selected.uses.length > 1 ? `
        <label class="res-label" for="vbw-use">Use / function</label>
        <select id="vbw-use" class="res-input">${useOptions}</select>
      ` : `
        <input type="hidden" id="vbw-use" value="${escapeHtml(use?.facilityId || '')}" />
        ${use?.functionName ? `<p class="res-hint vbw-use-hint">Use: ${escapeHtml(use.functionName)}</p>` : ''}
      `}

      <label class="res-label" for="vbw-date">Event date</label>
      <input id="vbw-date" class="res-input" type="date" min="${today}" value="${escapeHtml(state.eventDate)}" required />
      ${rateHintHtml()}

      <div class="res-row">
        <div>
          <label class="res-label" for="vbw-start">Start time</label>
          <input id="vbw-start" class="res-input" type="time" value="${escapeHtml(state.startTime)}" required />
        </div>
        <div>
          <label class="res-label" for="vbw-end">End time</label>
          <input id="vbw-end" class="res-input" type="time" value="${escapeHtml(state.endTime)}" required />
        </div>
      </div>
      <p id="vbw-slot-error" class="res-error res-slot-error${slotInlineError() ? '' : ' hidden'}" role="alert">${escapeHtml(slotInlineError())}</p>

      <label class="res-label" for="vbw-guests">Number of guests</label>
      <input id="vbw-guests" class="res-input res-input--short" type="number" min="${use?.capacity_min || 1}" max="${use?.capacity_max || 500}" value="${state.guestCount}" />
      ${venueCapacityLabel(use || selected) ? `<p class="res-hint">${escapeHtml(venueCapacityLabel(use || selected))}${use?.min_hours ? ` · ${use.min_hours}-hr minimum` : ''}</p>` : (use?.min_hours ? `<p class="res-hint">${use.min_hours}-hour minimum booking</p>` : '')}

      <label class="res-label" for="vbw-notes">Notes (optional)</label>
      <textarea id="vbw-notes" class="res-input vbw-notes" rows="4" placeholder="Setup needs, contact person, etc.">${escapeHtml(state.notes)}</textarea>
    </div>` : `
    <div class="vbw-details-panel vbw-details-panel--empty">
      <span class="material-symbols-outlined" aria-hidden="true">meeting_room</span>
      <p class="vbw-details-panel__empty-title">Select a venue</p>
      <p class="res-hint">Choose a space on the left. Use, date, time, and notes will appear here.</p>
      <input type="hidden" id="vbw-use" value="" />
      <input type="hidden" id="vbw-date" value="${escapeHtml(state.eventDate)}" />
      <input type="hidden" id="vbw-start" value="${escapeHtml(state.startTime)}" />
      <input type="hidden" id="vbw-end" value="${escapeHtml(state.endTime)}" />
      <input type="hidden" id="vbw-guests" value="${state.guestCount}" />
      <input type="hidden" id="vbw-notes" value="${escapeHtml(state.notes)}" />
      <p id="vbw-slot-error" class="hidden"></p>
      <p id="vbw-rate-hint" class="hidden"></p>
    </div>`;

  return `
    <p class="res-lead">Pick a venue on the left, then set use and schedule on the right.</p>
    <div class="vbw-split">
      <section class="vbw-split__venues" aria-label="Venue list">
        <div class="wiz-room-filters vbw-filters">
          <div class="wiz-room-toolbar">
            <input id="vbw-venue-search" type="search" class="res-input" placeholder="Search venues…" value="${escapeHtml(state.venueSearch)}" />
            ${renderWizardRoomTypeFilter(categories, state.venueCategory, {
              idPrefix: 'vbw',
              title: 'Category',
              buttonLabel: 'Category',
              allLabel: 'All categories',
              clearLabel: 'Clear category',
            })}
          </div>
        </div>
        <input type="hidden" id="vbw-space" value="${escapeHtml(state.spaceKey)}" />
        <div class="vbw-venue-list-wrap" role="listbox" aria-label="Venue spaces">
          <div class="wiz-room-list vbw-venue-list">
            ${filtered.length
    ? filtered.map(renderVenueOptionCard).join('')
    : '<div class="res-empty-box"><span class="material-symbols-outlined">search_off</span><p>No venues match your search.</p></div>'}
          </div>
        </div>
      </section>
      <section class="vbw-split__details" aria-label="Booking details">
        ${detailsPanel}
      </section>
    </div>`;
}

function renderStep3() {
  const v = selectedVenue();
  const use = selectedUse();
  const rateLine = state.rateQuote
    ? `${state.rateQuote.calendar_season || state.rateQuote.season} rate · ${formatMoney(state.rateQuote.rate)}/hr`
    : '';
  const estimatedTotal = state.rateQuote?.estimated_total != null
    ? formatMoney(state.rateQuote.estimated_total)
    : null;
  const useLine = use?.functionName ? `<br>${escapeHtml(use.functionName)}` : '';
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
      <p><strong>${escapeHtml(state.guestName || '—')}</strong><br>${escapeHtml(state.contactPhone || '—')}<br>${escapeHtml(state.email || '—')}</p>
    </div>
    <div class="res-review">
      <h4>Venue</h4>
      ${v ? `
      <div class="vbw-review-venue">
        <div class="wiz-room-option__thumb">
          <img src="${escapeHtml(venueCardImage(v))}" alt="" loading="lazy" />
        </div>
        <p><strong>${escapeHtml(venueDisplayName(v))}</strong>${useLine}${rateLine ? `<br>${escapeHtml(rateLine)}` : ''}</p>
      </div>` : `<p><strong>—</strong></p>`}
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
  syncSelection();
}

/** Only update fields that exist in the DOM (avoids wiping state on review step). */
function readForm() {
  const userEl = $('vbw-user');
  if (userEl) state.userId = userEl.value || '';

  const nameEl = $('vbw-name');
  if (nameEl) state.guestName = nameEl.value.trim();

  const emailEl = $('vbw-email');
  if (emailEl) state.email = emailEl.value.trim();

  const phoneEl = $('vbw-phone');
  if (phoneEl) state.contactPhone = phoneEl.value.trim();

  const spaceEl = $('vbw-space');
  if (spaceEl) state.spaceKey = spaceEl.value || '';

  const useEl = $('vbw-use');
  if (useEl && useEl.value) state.facilityId = useEl.value;

  if (spaceEl || useEl) syncSelection();

  const searchEl = $('vbw-venue-search');
  if (searchEl) state.venueSearch = searchEl.value || '';

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
    await refreshSlotAvailability();
    return;
  }
  if (hint) hint.textContent = 'Checking rate for this date…';
  try {
    const catalogId = state.facilityId || state.eventVenueId;
    state.rateQuote = catalogId
      ? await getVenueRateQuote({ facility_id: catalogId, date: state.eventDate })
      : await getVenueRateQuote(state.category, state.item, state.eventDate);
    if (hint) {
      const label = state.rateQuote.calendar_season || state.rateQuote.season;
      hint.innerHTML = `<strong>${escapeHtml(label)}</strong> rate: ${formatMoney(state.rateQuote.rate)}/hr`;
    }
  } catch {
    state.rateQuote = null;
    if (hint) hint.textContent = 'Could not load rate for this date.';
  }
  await refreshSlotAvailability();
}

function bindStep1() {
  const clearStepError = () => {
    if (state.formError) showError('');
  };

  $('vbw-user')?.addEventListener('change', () => {
    const sel = $('vbw-user');
    const opt = sel?.selectedOptions?.[0];
    if (!opt?.value) return;
    state.userId = opt.value;
    state.guestName = opt.getAttribute('data-name') || opt.textContent.trim();
    state.email = opt.getAttribute('data-email') || '';
    if ($('vbw-name')) $('vbw-name').value = state.guestName;
    if ($('vbw-email')) $('vbw-email').value = state.email;
    clearStepError();
  });

  ['vbw-name', 'vbw-email', 'vbw-phone'].forEach((id) => {
    $(id)?.addEventListener('input', clearStepError);
  });
}

function refreshVenueListDom() {
  const list = document.querySelector('.vbw-venue-list');
  if (!list) return;
  const filtered = getFilteredVenues();
  list.innerHTML = filtered.length
    ? filtered.map(renderVenueOptionCard).join('')
    : '<div class="res-empty-box"><span class="material-symbols-outlined">search_off</span><p>No venues match your search.</p></div>';

  list.querySelectorAll('[data-vbw-venue]').forEach((btn) => {
    btn.addEventListener('click', onVenueCardClick);
  });
}

async function onVenueCardClick(e) {
  const btn = e.currentTarget;
  const key = btn.getAttribute('data-vbw-venue') || '';
  readForm();
  state.spaceKey = key;
  const venue = selectedVenue();
  state.facilityId = venue?.uses?.[0]?.facilityId || '';
  syncSelection();
  state.formError = '';
  renderBody();
  await refreshRateQuote();
}

function bindStep2() {
  const clearStepError = () => {
    if (state.formError) showError('');
  };

  const onScheduleChange = async () => {
    readForm();
    clearStepError();
    await refreshRateQuote();
  };

  $('vbw-venue-search')?.addEventListener('input', (e) => {
    state.venueSearch = e.target.value || '';
    refreshVenueListDom();
  });

  bindWizardRoomTypeFilter($('venue-wizard-body'), {
    idPrefix: 'vbw',
    onChange: (value) => {
      readForm();
      state.venueCategory = value || '';
      refreshVenueListDom();
    },
  });

  document.querySelectorAll('[data-vbw-venue]').forEach((btn) => {
    btn.addEventListener('click', onVenueCardClick);
  });

  $('vbw-use')?.addEventListener('change', async () => {
    state.facilityId = $('vbw-use')?.value || '';
    syncSelection();
    clearStepError();
    await refreshRateQuote();
  });

  $('vbw-date')?.addEventListener('change', onScheduleChange);
  $('vbw-start')?.addEventListener('change', onScheduleChange);
  $('vbw-end')?.addEventListener('change', onScheduleChange);

  const onGuestsChange = () => {
    readForm();
    clearStepError();
  };
  $('vbw-guests')?.addEventListener('input', onGuestsChange);
  $('vbw-guests')?.addEventListener('change', onGuestsChange);
  $('vbw-notes')?.addEventListener('input', clearStepError);

  if (state.spaceKey || state.facilityId) {
    refreshRateQuote().catch(() => {});
  }
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
  if (state.step === 2) bindStep2();
}

function validateStep1() {
  if (!state.guestName && !state.userId) return 'Please enter a guest name.';
  if (!isValidEmail(state.email)) return 'Please enter a valid email address for the guest.';
  return '';
}

function validateStep2() {
  if (!venues.length) return 'No venue spaces configured.';
  if (!state.spaceKey) return 'Please select a venue.';
  if (!state.facilityId) return 'Please choose a use / function for this venue.';
  if (!state.eventDate) return 'Please pick an event date.';
  if (!state.startTime || !state.endTime) return 'Please set start and end times.';
  if (state.endTime <= state.startTime) return 'End time must be after start time.';
  if (state.guestCount < 1) return 'Guest count must be at least 1.';

  const use = selectedUse() || selectedVenue();
  const capacityError = validateVenueCapacityClient(use, state.guestCount);
  if (capacityError) return capacityError;
  const durationError = validateVenueDurationClient(use, state.startTime, state.endTime);
  if (durationError) return durationError;

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
    const use = selectedUse() || selectedVenue();
    const ruleError = (!state.spaceKey && 'Please select a venue.')
      || (!state.facilityId && 'Please choose a use / function for this venue.')
      || (!state.eventDate && 'Please pick an event date.')
      || ((!state.startTime || !state.endTime) && 'Please set start and end times.')
      || (state.endTime <= state.startTime && 'End time must be after start time.')
      || (state.guestCount < 1 && 'Guest count must be at least 1.')
      || validateVenueCapacityClient(use, state.guestCount)
      || validateVenueDurationClient(use, state.startTime, state.endTime);
    if (ruleError) {
      showError(ruleError);
      return;
    }
    await refreshRateQuote();
    if (!state.slotCheck.checked) await refreshSlotAvailability();
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
  const match = findSpaceByFacilityId(id);
  if (match) {
    state.spaceKey = match.venue.spaceKey;
    state.facilityId = match.use.facilityId;
    state.eventVenueId = match.use.facilityId;
    state.category = match.venue.category;
    state.item = match.use.item;
  } else {
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
      contact_phone: state.contactPhone || null,
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
    state.contactPhone = p.contactPhone || p.contact_phone || state.contactPhone;
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
      state.contactPhone = booking.contact_phone || '';
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
      const match = venues.find((v) =>
        v.category === detail.category
        && v.uses.some((u) => u.item === detail.item));
      if (match) {
        state.spaceKey = match.spaceKey;
        const use = match.uses.find((u) => u.item === detail.item) || match.uses[0];
        state.facilityId = use?.facilityId || '';
        state.eventVenueId = state.facilityId;
        state.category = match.category;
        state.item = use?.item || detail.item;
      } else {
        state.category = detail.category;
        state.item = detail.item;
      }
    } else if (detail.prefill?.facilityId) {
      applySpaceFromFacilityId(detail.prefill.facilityId);
    }

    if (!state.spaceKey && venues.length === 1) {
      state.spaceKey = venues[0].spaceKey;
      state.facilityId = venues[0].uses[0]?.facilityId || '';
      syncSelection();
    } else if (state.spaceKey || state.facilityId) {
      syncSelection();
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
