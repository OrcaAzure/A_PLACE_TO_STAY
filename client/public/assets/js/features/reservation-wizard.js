/**
 * Step-by-step reservation wizard — create & edit (boomer-friendly).
 */

import {
  createBooking, updateBooking, getMealRates, getRoomAvailability, getUsers, getBookingById, getFacilitiesOverview,
} from '/assets/js/services/api.js';
import {
  WIZARD_STEPS, escapeHtml, formatDateLong, formatMoney,
  emptyWizardState, mealsFromBooking, calcGrandTotal, sanitizeGuestModifyFees,
  loadFiscalYearBounds, applyBookingDateBounds, formatBookingWindowHint,
  recommendRooms, servicesToQuickFees, applyLoggedInGuestContact, filterRoomsList,
  collectWizardRoomTypes,
  DORM_MIN_GUEST_COUNT, dormPriceLabel,
  isRoomListVisible, isRoomBookable, dormMinGuestsNotice, validateRoomGuestCapacity,
  readMealsFromInputs, clampMealQty, mealTypesOrdered, ensureMealsShape, isValidEmail,
  guestModifyMinStep, renderGuestModifyProgress, renderGuestModifyReviewSummary, renderGuestModifyReviewCallout,
} from '/assets/js/features/reservation-shared.js';
import {
  renderWizardMealGrid,
  renderGuestModifyMealList,
  syncWizardMealCards,
  renderWizardRoomCard,
  renderGuestModifyRoomRow,
  renderWizardRoomTypeFilter,
  bindWizardRoomTypeFilter,
  closeAllWizardRoomTypePanels,
  renderWizardConfirmCard,
  renderWizardPriceSummary,
} from '/assets/js/features/wizard-visuals.js';
import { buildFeeGroups, getGuestSelfBookFeeCatalog, renderWizardFeePicker, handleWizardFeePickerClick } from '/assets/js/features/booking-fee-picker.js';

let initialized = false;
let isOpen = false;
let state = emptyWizardState();
let users = [];
let fiscalBounds = null;
let feeGroups = [];
let quickFees = [];
let feePickerClickBound = false;
let mealDelegationBound = false;
let roomPickBound = false;

function $(id) { return document.getElementById(id); }

function nameInitials(name) {
  const parts = String(name || 'G').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'G';
  return parts.slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

function setBtnVisible(el, visible) {
  if (!el) return;
  el.classList.toggle('hidden', !visible);
  el.hidden = !visible;
}

function renderGuestContactCard({ lead, compact } = {}) {
  const phone = state.contactPhone?.trim() || 'No phone on file';
  const email = state.email?.trim() || 'No email on file';
  const card = `
    <div class="guest-wizard-contact${compact ? ' guest-wizard-contact--compact' : ''}">
      <div class="guest-wizard-contact__avatar" aria-hidden="true">${escapeHtml(nameInitials(state.guestName))}</div>
      <div>
        <p class="guest-wizard-contact__name">${escapeHtml(state.guestName || 'Guest')}</p>
        <p class="guest-wizard-contact__meta">${escapeHtml(phone)}<br>${escapeHtml(email)}</p>
      </div>
    </div>`;
  if (compact) return card;
  return `${lead ? `<p class="res-lead">${lead}</p>` : ''}${card}`;
}

function applyGuestModifyChrome() {
  const modal = $('reservation-wizard-modal')?.querySelector('.res-modal');
  const headerWrap = modal?.querySelector('.res-modal-header > div:first-child');
  const subtitle = $('reservation-wizard-subtitle');
  if (!state.guestModify) {
    subtitle?.classList.remove('hidden');
    headerWrap?.querySelector('.guest-modify-status')?.remove();
    return;
  }
  $('reservation-wizard-title').textContent = 'Modify reservation';
  if (subtitle) {
    subtitle.textContent = '';
    subtitle.classList.add('hidden');
  }
  let status = headerWrap?.querySelector('.guest-modify-status');
  if (!status) {
    status = document.createElement('span');
    $('reservation-wizard-title')?.insertAdjacentElement('afterend', status);
  }
  if (status) {
    status.textContent = state.guestWasApproved ? 'Approved' : 'Pending';
    status.className = `guest-modify-status guest-modify-status--${state.guestWasApproved ? 'approved' : 'pending'}`;
  }
}

function renderSteps() {
  const el = $('reservation-wizard-steps');
  if (!el) return;
  const modal = $('reservation-wizard-modal')?.querySelector('.res-modal');
  if (state.guestModify) {
    modal?.classList.add('res-modal--guest-modify');
    el.className = 'res-steps res-steps--guest-modify';
    el.innerHTML = renderGuestModifyProgress(state.step);
    applyGuestModifyChrome();
    return;
  }
  modal?.classList.remove('res-modal--guest-modify');
  el.className = 'res-steps';
  el.innerHTML = WIZARD_STEPS.map((s) => {
    const done = s.id < state.step;
    const active = s.id === state.step;
    return `<div class="res-step${active ? ' is-active' : ''}${done ? ' is-done' : ''}">
      <span class="res-step-num">${s.id}</span>
      <span class="res-step-label">${s.label}</span>
    </div>`;
  }).join('');
}

function renderStep1() {
  if (state.guestModify) {
    return renderGuestContactCard({ lead: 'Your contact details for this stay.' });
  }
  const opts = users.map((u) =>
    `<option value="${u.id}" data-name="${escapeHtml(u.full_name)}" data-email="${escapeHtml(u.email)}"${String(u.id) === String(state.userId) ? ' selected' : ''}>${escapeHtml(u.full_name)}</option>`
  ).join('');
  return `
    <p class="res-lead">Enter who will be staying. You can pick an existing guest or type their details.</p>
    <label class="res-label">Select guest (optional)</label>
    <select id="wiz-user" class="res-input"><option value="">— Type new guest below —</option>${opts}</select>
    <label class="res-label" for="wiz-name">Guest name</label>
    <input id="wiz-name" class="res-input" type="text" value="${escapeHtml(state.guestName)}" placeholder="Full name" />
    <label class="res-label" for="wiz-email">Email <span class="res-label-required">(required)</span></label>
    <input id="wiz-email" class="res-input" type="email" value="${escapeHtml(state.email)}" placeholder="email@example.com" autocomplete="email" required />
    <label class="res-label" for="wiz-phone">Contact number <span class="res-label-optional">(optional)</span></label>
    <input id="wiz-phone" class="res-input" type="tel" value="${escapeHtml(state.contactPhone)}" placeholder="09XX XXX XXXX" autocomplete="tel" />`;
}

function renderStep2() {
  const showAvailBanner = state.guestModify
    ? (state.checkIn && state.checkOut && state.checkOut > state.checkIn && !state.loadingRooms && state.availableCount === 0)
    : (state.checkIn && state.checkOut && state.checkOut > state.checkIn);
  const banner = showAvailBanner ? `
    <div class="res-banner ${state.guestModify || state.availableCount > 0 ? 'res-banner--ok' : 'res-banner--warn'}">
      ${state.loadingRooms ? 'Checking room availability…'
    : state.availableCount > 0
      ? (state.guestModify ? '' : `<strong>${state.availableCount} room(s)</strong> can fit ${state.guestCount} guest(s) on these dates.`)
      : `<strong>No rooms available</strong> for ${state.guestCount} guest(s) on these dates. Try different dates or fewer guests.`}
    </div>` : '';
  const fields = `
    <div class="res-row">
      <div><label class="res-label">Check-in</label><input id="wiz-check-in" class="res-input" type="date" value="${escapeHtml(state.checkIn)}" /></div>
      <div><label class="res-label">Check-out</label><input id="wiz-check-out" class="res-input" type="date" value="${escapeHtml(state.checkOut)}" /></div>
    </div>
    <label class="res-label">Guests</label>
    <input id="wiz-guests" class="res-input res-input--short" type="number" min="1" max="500" value="${state.guestCount}" inputmode="numeric" />`;
  if (state.guestModify) {
    return `<div class="guest-modify-panel">${fields}${banner}</div>`;
  }
  return `
    <p class="res-lead">Pick the stay dates and how many people will stay.</p>
    ${(() => {
      const hint = fiscalBounds ? formatBookingWindowHint(fiscalBounds) : '';
      return hint ? `<p class="res-hint">${escapeHtml(hint)}</p>` : '';
    })()}
    ${fields}
    <p class="res-hint">Room options on the next step will update based on this number. Dorm bookings require at least ${DORM_MIN_GUEST_COUNT} guests (per-person pricing).</p>
    ${banner}`;
}

function renderRoomRow(room, { recommended = false } = {}) {
  if (state.guestModify) {
    return renderGuestModifyRoomRow(room, {
      selected: String(room.id) === String(state.roomId),
      guestCount: state.guestCount,
    });
  }
  return renderWizardRoomCard(room, {
    selected: String(room.id) === String(state.roomId),
    guestCount: state.guestCount,
    recommended,
    bookable: isRoomBookable(room.availability_status),
    visible: isRoomListVisible(room.availability_status),
  });
}

function getFilteredAvailableRooms() {
  const statuses = state.guestModify ? ['available'] : ['available', 'dorm_min_guests'];
  return filterRoomsList(state.availableRooms, {
    search: state.roomSearch,
    roomType: state.roomTypeFilter,
    includeStatuses: statuses,
  });
}

function renderRoomFilters(extraToolbarHtml = '') {
  const types = collectWizardRoomTypes(state.availableRooms);
  return `
    <div class="wiz-room-filters">
      <div class="wiz-room-toolbar">
        <input id="wiz-room-search" type="search" class="res-input" placeholder="Search room number or type…" value="${escapeHtml(state.roomSearch)}" />
        ${renderWizardRoomTypeFilter(types, state.roomTypeFilter, { idPrefix: 'wiz' })}
        ${extraToolbarHtml}
      </div>
    </div>`;
}

function renderStep3() {
  const originalRoom = state.originalRoomId
    ? state.availableRooms.find((r) => String(r.id) === String(state.originalRoomId))
    : null;
  const requestedUnavailable = originalRoom && originalRoom.availability_status === 'booked';
  const filtered = getFilteredAvailableRooms();
  const recommended = recommendRooms(filtered, state.guestCount, 3);

  const conflictBanner = requestedUnavailable ? `
    <div class="res-banner res-banner--warn">
      ${state.guestModify
    ? `<strong>${escapeHtml(state.originalRoomLabel || 'Your room')}</strong> is no longer available. Please pick another room.`
    : `<strong>Room conflict:</strong> The guest requested <strong>${escapeHtml(state.originalRoomLabel || 'this room')}</strong>, but it is already booked on these dates. Choose another room and explain the change on the last step.`}
    </div>` : (state.modifyRequest && state.originalRoomLabel ? `
    <div class="res-banner res-banner--warn">
      Guest originally requested <strong>${escapeHtml(state.originalRoomLabel)}</strong>. You can change the room, dates, or details before approving.
    </div>` : '');

  const lead = state.guestModify
    ? 'Choose from the available rooms below. Your current room stays selected if it is still free on these dates.'
    : 'Search and pick a room. Use <strong>Show suggested rooms</strong> if you want help finding a good fit.';

  const recToggle = (!state.guestModify && recommended.length) ? `
    <button type="button" id="wiz-toggle-rec" class="res-btn res-btn--secondary res-rec-toggle">
      <span class="material-symbols-outlined">auto_awesome</span>
      ${state.showRecommendations ? 'Hide suggested rooms' : `Show ${recommended.length} suggested room${recommended.length === 1 ? '' : 's'}`}
    </button>` : '';

  const recBlock = (!state.guestModify && state.showRecommendations && recommended.length) ? `
    <div class="res-rec-section">
      <h3 class="res-rec-head"><span class="material-symbols-outlined">star</span> Suggested for ${state.guestCount} guest(s)</h3>
      <div class="res-room-list wiz-room-list">${recommended.map((r) => renderRoomRow(r, { recommended: true })).join('')}</div>
    </div>` : '';

  const listBlock = filtered.length ? `
    ${state.guestModify ? '' : `<h3 class="res-subhead res-subhead--spaced">Available rooms (${filtered.length})</h3>`}
    <div class="wiz-room-list${state.guestModify ? ' wiz-room-list--compact' : ''}">${filtered.map((r) => renderRoomRow(r)).join('')}</div>`
    : (!state.loadingRooms
      ? '<div class="res-empty-box"><p>No rooms available. Try different dates.</p></div>'
      : '');

  if (state.guestModify) {
    return `
      ${conflictBanner}
      ${state.loadingRooms ? '<p class="res-hint">Loading rooms…</p>' : ''}
      <input id="wiz-room-search" type="search" class="res-input guest-modify-search" placeholder="Search rooms…" value="${escapeHtml(state.roomSearch)}" />
      ${listBlock}`;
  }

  return `
    <p class="res-lead">${lead}</p>
    ${conflictBanner}
    ${state.loadingRooms ? '<p class="res-hint">Loading rooms…</p>' : ''}
    ${renderRoomFilters(recToggle)}
    ${recBlock}
    ${listBlock}`;
}

function bindRoomPickDelegation() {
  if (roomPickBound) return;
  const root = $('reservation-wizard-body');
  if (!root) return;
  roomPickBound = true;
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-room-id]');
    if (!btn || btn.disabled || !root.contains(btn)) return;
    const roomId = btn.getAttribute('data-room-id');
    const room = state.availableRooms.find((r) => String(r.id) === String(roomId)) || null;
    if (!room) return;
    if (!isRoomBookable(room.availability_status)) {
      state.roomId = '';
      state.selectedRoom = null;
      state.roomTotal = 0;
      state.error = dormMinGuestsNotice(state.guestCount)
        || 'This room cannot be booked for the current guest count.';
      renderBody();
      return;
    }
    state.roomId = roomId;
    state.selectedRoom = room;
    state.roomTotal = room.estimated_total || 0;
    state.error = null;
    renderBody();
  });
}

function bindMealDelegation() {
  if (mealDelegationBound) return;
  const root = $('reservation-wizard-body');
  if (!root) return;
  mealDelegationBound = true;
  root.addEventListener('click', (e) => {
    const minus = e.target.closest('[data-meal-minus]');
    const plus = e.target.closest('[data-meal-plus]');
    if (!minus && !plus) return;
    const type = minus?.getAttribute('data-meal-minus') || plus?.getAttribute('data-meal-plus');
    if (!type) return;
    state.meals[type] = clampMealQty((state.meals[type] || 0) + (minus ? -1 : 1));
    syncWizardMealCards(root, state.meals, state.mealRates);
  });
  root.addEventListener('input', (e) => {
    const input = e.target.closest('[data-meal-qty]');
    if (!input) return;
    const type = input.getAttribute('data-meal-qty');
    if (!type) return;
    // Keep raw typing in the field; only update state/subtotals (do not rewrite value here).
    const raw = String(input.value ?? '').trim();
    state.meals[type] = raw === '' ? 0 : clampMealQty(raw);
    syncWizardMealCards(root, state.meals, state.mealRates, { skipFocusedInput: true });
  });
  root.addEventListener('blur', (e) => {
    const input = e.target.closest('[data-meal-qty]');
    if (!input) return;
    const type = input.getAttribute('data-meal-qty');
    if (!type) return;
    const qty = clampMealQty(input.value);
    state.meals[type] = qty;
    input.value = qty;
    syncWizardMealCards(root, state.meals, state.mealRates);
  }, true);
}

function renderStep4() {
  const feePickerBlock = renderWizardFeePicker({
    feeGroups,
    expandedGroupId: state.expandedFeeGroupId,
    fees: state.fees,
    emptyMessage: state.guestModify
      ? 'No add-on services are listed right now. Contact housing if you need something extra.'
      : 'No extra services in the catalog yet — add a custom line below or configure fees under Facilities → Extra fees.',
    showCustom: !state.guestModify,
    customNameInputId: 'wiz-fee-name',
    customAmtInputId: 'wiz-fee-amt',
    customAddBtnId: 'wiz-add-fee',
  });
  if (state.guestModify) {
    return `
      <div class="guest-modify-extras">
        <section class="guest-modify-extras__section">
          <h3 class="guest-modify-section-title">Meals</h3>
          ${renderGuestModifyMealList(state.meals, state.mealRates)}
        </section>
        <section class="guest-modify-extras__section">
          <label class="guest-modify-field-label" for="wiz-meal-allergens">Dietary notes <span class="guest-modify-optional">optional</span></label>
          <textarea id="wiz-meal-allergens" class="res-input guest-modify-textarea" rows="2" placeholder="Allergies or dietary needs…">${escapeHtml(state.mealAllergenNotes || '')}</textarea>
        </section>
        ${state.fees.length || feeGroups.length ? `
        <section class="guest-modify-extras__section">
          <h3 class="guest-modify-section-title">Add-ons</h3>
          ${renderWizardFeePicker({
    feeGroups,
    expandedGroupId: state.expandedFeeGroupId,
    fees: state.fees,
    emptyMessage: 'No add-on services are available right now.',
    showCustom: false,
    compact: true,
  })}
        </section>` : ''}
      </div>`;
  }
  return `
    <p class="res-lead">Add meals if needed. Set a quantity for each meal type.</p>
    <div class="wiz-extras-block">
      <p class="guest-extras-block__label">Meals</p>
      ${renderWizardMealGrid(state.meals, state.mealRates, { idPrefix: 'wiz' })}
    </div>
    <label class="res-label" for="wiz-meal-allergens">Meal allergens &amp; dietary notes (optional)</label>
    <textarea id="wiz-meal-allergens" class="res-input" rows="2" placeholder="e.g. nut allergy, gluten-free, vegetarian…">${escapeHtml(state.mealAllergenNotes || '')}</textarea>
    <div class="wiz-extras-block">
      <p class="guest-extras-block__label">Additional fees (optional)</p>
      <p class="res-hint">Choose a category to browse options, or add a custom fee below.</p>
      ${feePickerBlock}
    </div>`;
}

function renderStep5() {
  const r = state.selectedRoom;
  const grand = calcGrandTotal(state.roomTotal, state.meals, state.fees, state.mealRates);
  const summaryLines = [
    { label: 'Room', value: r ? formatMoney(state.roomTotal) : '—' },
  ];
  mealTypesOrdered(state.mealRates).forEach((t) => {
    if (state.meals[t] > 0) {
      summaryLines.push({
        label: `${t} × ${state.meals[t]}`,
        value: state.meals[t] * (Number(state.mealRates[t]) || 0),
      });
    }
  });
  state.fees.forEach((f) => {
    summaryLines.push({ label: f.fee_name, value: f.amount });
  });

  const modifyBlock = state.guestModify
    ? renderGuestModifyReviewCallout({
      approved: state.guestWasApproved,
      textareaId: 'wiz-guest-message',
      message: state.guestMessage,
    })
    : state.modifyRequest ? `
    <div class="res-banner res-banner--warn">
      You are approving this request with changes. The guest will receive an email explaining what changed.
    </div>
    <label class="res-label" for="wiz-guest-message">Message to guest (required)</label>
    <textarea id="wiz-guest-message" class="res-input" rows="3" placeholder="e.g. Your requested room was already booked, so we assigned Room 102 in the same building instead.">${escapeHtml(state.guestMessage)}</textarea>
  ` : (state.fromRequestId ? `
    <div class="res-banner res-banner--ok">The guest will receive a confirmation email when you save.</div>
  ` : '');

  const roomDetail = r
    ? `Room ${escapeHtml(r.room_number)} · ${escapeHtml(r.room_type_label || r.room_type)}${dormPriceLabel(r, state.guestCount, r.nights) ? `<br><span class="res-hint">${escapeHtml(dormPriceLabel(r, state.guestCount, r.nights))}</span>` : ''}`
    : '—';

  if (state.guestModify) {
    const reviewRows = [
      { label: 'Stay', value: `${formatDateLong(state.checkIn)} – ${formatDateLong(state.checkOut)} · ${state.guestCount} guest${state.guestCount === 1 ? '' : 's'}` },
      { label: 'Room', value: r ? `Room ${r.room_number} · ${r.room_type_label || r.room_type}` : '—' },
    ];
    mealTypesOrdered(state.mealRates).forEach((t) => {
      if (state.meals[t] > 0) {
        reviewRows.push({
          label: `${t} × ${state.meals[t]}`,
          value: state.meals[t] * (Number(state.mealRates[t]) || 0),
        });
      }
    });
    state.fees.forEach((f) => {
      reviewRows.push({ label: f.fee_name, value: f.amount });
    });
    return `
      ${renderGuestModifyReviewCallout({
      approved: state.guestWasApproved,
      textareaId: 'wiz-guest-message',
      message: state.guestMessage,
    })}
      ${renderGuestModifyReviewSummary(reviewRows, { grandLabel: 'Estimated total', grandTotal: grand })}
      <label class="res-label" for="wiz-notes">Notes <span class="guest-modify-optional">optional</span></label>
      <textarea id="wiz-notes" class="res-input" rows="2" placeholder="Anything else for housing…">${escapeHtml(state.notes)}</textarea>`;
  }

  return `
    <p class="res-lead">Please review everything before saving.</p>
    ${modifyBlock}
    <div class="wiz-confirm-grid">
      ${state.guestModify
    ? renderWizardConfirmCard('Guest', renderGuestContactCard({ compact: true }))
    : renderWizardConfirmCard('Guest', `<p>${escapeHtml(state.guestName)}<br>${escapeHtml(state.contactPhone || '—')}<br>${escapeHtml(state.email || '—')}</p>`)}
      ${renderWizardConfirmCard('Stay', `<p>${formatDateLong(state.checkIn)} → ${formatDateLong(state.checkOut)}<br>${state.guestCount} guest(s)</p>`)}
      ${renderWizardConfirmCard('Room', `<p>${roomDetail}</p>`)}
    </div>
    ${renderWizardPriceSummary({
    lines: summaryLines,
    grandLabel: state.guestModify || state.fromRequestId ? 'Estimated total' : 'Grand total',
    grandTotal: grand,
  })}
    <label class="res-label">Notes (optional)</label>
    <textarea id="wiz-notes" class="res-input" rows="2">${escapeHtml(state.notes)}</textarea>`;
}

function renderBody() {
  const mount = $('reservation-wizard-body');
  if (!mount) return;
  closeAllWizardRoomTypePanels();
  const fns = { 1: renderStep1, 2: renderStep2, 3: renderStep3, 4: renderStep4, 5: renderStep5 };
  mount.classList.remove('res-wizard-body--enter');
  const stepHtml = fns[state.step]?.() || '';
  mount.innerHTML = stepHtml;
  requestAnimationFrame(() => mount.classList.add('res-wizard-body--enter'));

  if (!state.guestModify) {
  $('reservation-wizard-title').textContent = state.mode === 'edit'
      ? 'Edit Reservation'
      : state.modifyRequest
        ? 'Modify & Approve Request'
        : state.fromRequestId
          ? 'Approve Guest Request'
          : 'Create Reservation';
  $('reservation-wizard-subtitle').textContent = WIZARD_STEPS[state.step - 1]?.short || '';
  } else {
    applyGuestModifyChrome();
  }
  setBtnVisible($('reservation-wizard-back'), state.step > (state.guestModify ? guestModifyMinStep() : 1));
  setBtnVisible($('reservation-wizard-next'), state.step < 5);
  setBtnVisible($('reservation-wizard-confirm'), state.step >= 5);
  $('reservation-wizard-next').disabled = state.saving;
  $('reservation-wizard-confirm').disabled = state.saving;
  $('reservation-wizard-next').textContent = state.saving ? 'Please wait…' : (state.guestModify ? 'Continue' : 'Next step');
  $('reservation-wizard-confirm').textContent = state.saving
    ? 'Saving…'
    : (state.guestModify
      ? 'Submit'
      : (state.modifyRequest || state.fromRequestId ? 'Save & approve' : 'Save reservation'));

  const err = $('reservation-wizard-error');
  if (state.error) { err.textContent = state.error; err.classList.remove('hidden'); }
  else err?.classList.add('hidden');

  bindEvents();
  if (state.step === 2) {
    applyBookingDateBounds($('wiz-check-in'), $('wiz-check-out'), fiscalBounds);
  }
}

function readFields() {
  if (state.step === 1) {
    state.guestName = $('wiz-name')?.value?.trim() || '';
    state.contactPhone = $('wiz-phone')?.value?.trim() || '';
    state.email = $('wiz-email')?.value?.trim() || '';
    state.userId = $('wiz-user')?.value || '';
  }
  if (state.step === 2) {
    state.checkIn = $('wiz-check-in')?.value || '';
    state.checkOut = $('wiz-check-out')?.value || '';
    state.guestCount = Math.max(1, Number($('wiz-guests')?.value) || 1);
  }
  if (state.step === 5) {
    state.notes = $('wiz-notes')?.value?.trim() || '';
    state.guestMessage = $('wiz-guest-message')?.value?.trim() || state.guestMessage;
  }
  if ($('wiz-meal-allergens')) {
    state.mealAllergenNotes = $('wiz-meal-allergens').value?.trim() || '';
  }
  const mealRoot = $('reservation-wizard-body');
  if (mealRoot?.querySelector('[data-meal-qty]')) {
    state.meals = readMealsFromInputs(mealRoot, state.meals);
  }
  if ($('wiz-guest-message')) {
    state.guestMessage = $('wiz-guest-message').value?.trim() || '';
  }
}

let fetchRoomsToken = 0;

async function fetchRooms() {
  if (!state.checkIn || !state.checkOut || state.checkOut <= state.checkIn) return;
  const token = ++fetchRoomsToken;
  state.loadingRooms = true;
  state.error = null;
  renderBody();
  try {
    const data = await getRoomAvailability({
      check_in: state.checkIn,
      check_out: state.checkOut,
      guest_count: state.guestCount,
      exclude_booking_id: state.bookingId || state.fromRequestId || undefined,
    });
    if (token !== fetchRoomsToken) return;
    state.availableRooms = data.rooms || [];
    state.availableCount = data.available_count ?? 0;
    if (state.roomId) {
      const match = state.availableRooms.find((r) => String(r.id) === String(state.roomId));
      if (match?.availability_status === 'available') {
        state.selectedRoom = match;
        state.roomTotal = match.estimated_total || 0;
      } else {
        state.roomId = '';
        state.selectedRoom = null;
        state.roomTotal = 0;
      }
    }
  } catch (err) {
    if (token !== fetchRoomsToken) return;
    state.error = err.message || 'Could not load available rooms.';
  } finally {
    if (token !== fetchRoomsToken) return;
    state.loadingRooms = false;
    renderSteps();
    renderBody();
  }
}

function bindEvents() {
  const clearWizardError = () => {
    if (!state.error) return;
    state.error = null;
    const err = $('reservation-wizard-error');
    if (err) {
      err.textContent = '';
      err.classList.add('hidden');
    }
  };

  $('wiz-user')?.addEventListener('change', (e) => {
    const opt = e.target.selectedOptions[0];
    if (!opt?.value) return;
    state.userId = opt.value;
    state.guestName = opt.dataset.name || state.guestName;
    state.email = opt.dataset.email || state.email;
    renderBody();
  });

  ['wiz-name', 'wiz-email', 'wiz-phone', 'wiz-guest-message', 'wiz-notes'].forEach((id) => {
    $(id)?.addEventListener('input', clearWizardError);
  });

  const onStayChange = () => {
    readFields();
    if (!state.guestModify) {
      state.roomId = '';
      state.selectedRoom = null;
    }
    state.error = null;
    fetchRooms();
  };
  $('wiz-check-in')?.addEventListener('change', onStayChange);
  $('wiz-check-out')?.addEventListener('change', onStayChange);
  // Use change (not input) so multi-digit guest counts like 25 are not remounted mid-typing.
  $('wiz-guests')?.addEventListener('change', onStayChange);

  $('wiz-room-search')?.addEventListener('input', (e) => {
    state.roomSearch = e.target.value;
    renderBody();
  });
  bindWizardRoomTypeFilter($('reservation-wizard-body'), {
    idPrefix: 'wiz',
    onChange: (value) => {
      state.roomTypeFilter = value;
      renderBody();
    },
  });
  $('wiz-toggle-rec')?.addEventListener('click', () => {
    state.showRecommendations = !state.showRecommendations;
    renderBody();
  });

  // Room pick uses event delegation (bound once in init) so re-renders cannot drop listeners.

  const bodyEl = $('reservation-wizard-body');

  if (!feePickerClickBound) {
    $('reservation-wizard-body')?.addEventListener('click', (e) => {
      if (!e.target.closest('[data-fee-picker]')) return;
      const handled = handleWizardFeePickerClick(e, {
        getExpandedGroupId: () => state.expandedFeeGroupId,
        setExpandedGroupId: (id) => { state.expandedFeeGroupId = id; renderBody(); },
        onAddFee: (fee) => {
          state.fees.push(fee);
          renderBody();
        },
        onRemoveFee: (index) => {
          state.fees.splice(index, 1);
          renderBody();
        },
      });
      if (handled) e.stopPropagation();
    });
    feePickerClickBound = true;
  }

  $('wiz-add-fee')?.addEventListener('click', () => {
    if (state.guestModify) return;
    const name = $('wiz-fee-name')?.value?.trim();
    const amount = Number($('wiz-fee-amt')?.value);
    if (!name || !amount) { state.error = 'Enter a fee name and amount.'; renderBody(); return; }
    state.fees.push({ fee_name: name, amount });
    state.error = null;
    renderBody();
  });

  if (!state.guestModify && state.step === 5) {
  }
}

function showWizardError(message) {
  state.error = message;
  renderBody();
  const err = $('reservation-wizard-error');
  err?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function validate() {
  readFields();
  state.error = null;
  if (state.step === 1 && !state.guestModify) {
    if (!state.guestName) { state.error = 'Please enter the guest name.'; return false; }
    if (!isValidEmail(state.email)) {
      state.error = 'Please enter a valid email address for the guest.';
      return false;
    }
  }
  if (state.step === 2) {
    if (!state.checkIn || !state.checkOut) { state.error = 'Please select check-in and check-out dates.'; return false; }
    if (state.checkOut <= state.checkIn) { state.error = 'Check-out must be after check-in.'; return false; }
  }
  if (state.step === 3 && !state.roomId) { state.error = 'Please select an available room.'; return false; }
  if (state.step === 3 && state.roomId) {
    const picked = state.availableRooms.find((r) => String(r.id) === String(state.roomId));
    if (!picked || picked.availability_status !== 'available') {
      state.error = 'The selected room is not available on these dates. Choose another room or change your dates.';
      return false;
    }
  }
  if (state.step === 3 && state.selectedRoom) {
    const capacityError = validateRoomGuestCapacity(state.selectedRoom, state.guestCount);
    if (capacityError) { state.error = capacityError; return false; }
  }
  if (state.step === 5 && state.modifyRequest && !state.guestModify && !state.guestMessage?.trim()) {
    state.error = 'Please enter a message explaining the change for the guest.';
    return false;
  }
  if (state.step === 5 && state.guestModify && state.guestWasApproved && !state.guestMessage?.trim()) {
    state.error = 'Please enter a message explaining what you want changed.';
    return false;
  }
  return true;
}

async function goNext() {
  if (!validate()) {
    renderBody();
    $('reservation-wizard-error')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }
  if (state.step === 2) await fetchRooms();
  if (state.step < 5) state.step++;
  renderSteps();
  renderBody();
}

function goBack() {
  readFields();
  const minStep = state.guestModify ? guestModifyMinStep() : 1;
  if (state.step > minStep) state.step--;
  state.error = null;
  renderSteps();
  renderBody();
}

async function confirmSave() {
  readFields();
  if (!state.guestModify && !isValidEmail(state.email)) {
    state.step = 1;
    showWizardError('Please enter a valid email address for the guest.');
    return;
  }
  if (state.modifyRequest && !state.guestModify && !state.guestMessage?.trim()) {
    showWizardError('Please enter a message explaining the change for the guest.');
    return;
  }
  if (state.guestModify && state.guestWasApproved && !state.guestMessage?.trim()) {
    state.error = 'Please enter a message explaining what you want changed.';
    renderBody();
    return;
  }
  if (!state.roomId) { state.error = 'Please select a room.'; renderBody(); return; }
  const pickedRoom = state.availableRooms.find((r) => String(r.id) === String(state.roomId));
  if (!pickedRoom || pickedRoom.availability_status !== 'available') {
    state.step = 3;
    showWizardError('The selected room is not available on these dates. Choose another room or change your dates.');
    return;
  }
  const capacityError = validateRoomGuestCapacity(state.selectedRoom || pickedRoom, state.guestCount);
  if (capacityError) {
    state.step = 3;
    showWizardError(capacityError);
    return;
  }
  state.saving = true;
  state.error = null;
  renderBody();

  const noteText = state.notes || '';
  let modLine = '';
  if (!state.guestModify && state.modifyRequest && state.guestMessage?.trim()) {
    modLine = `[Modified by admin] ${state.guestMessage.trim()}`;
  }
  const combinedNotes = state.guestModify
    ? (noteText || undefined)
    : [noteText, modLine].filter(Boolean).join('\n') || undefined;

  const payload = {
    user_id: state.guestModify ? undefined : (state.userId ? Number(state.userId) : undefined),
    guest_name: state.guestModify ? undefined : state.guestName,
    email: state.guestModify ? undefined : state.email,
    room_id: Number(state.roomId),
    check_in: state.checkIn,
    check_out: state.checkOut,
    guest_count: state.guestCount,
    contact_phone: state.contactPhone || undefined,
    notes: combinedNotes,
    status: state.guestModify ? 'Pending' : 'Approved',
    meals: state.meals,
    fees: state.guestModify
      ? sanitizeGuestModifyFees(state.fees, quickFees, state.originalFees)
      : state.fees,
    meal_allergen_notes: state.mealAllergenNotes || undefined,
    modification_message: state.guestModify && state.guestWasApproved
      ? state.guestMessage?.trim()
      : (state.guestModify && state.guestMessage?.trim()
        ? state.guestMessage.trim()
        : (state.modifyRequest ? state.guestMessage?.trim() : undefined)),
    notify_guest: Boolean(!state.guestModify && (state.fromRequestId || state.modifyRequest)),
    notify_modification: Boolean(!state.guestModify && state.modifyRequest),
  };

  try {
    if (state.mode === 'edit' && state.bookingId) {
      await updateBooking(state.bookingId, payload);
    } else if (state.fromRequestId) {
      await updateBooking(state.fromRequestId, payload);
    } else {
      await createBooking(payload);
    }
    window.dispatchEvent(new CustomEvent('booking:updated'));
    closeReservationWizard();
  } catch (err) {
    state.error = err.message || 'Could not save. Please check dates and room availability.';
    state.saving = false;
    renderBody();
  }
}

function showModal() {
  $('reservation-wizard-overlay')?.classList.remove('hidden');
  $('reservation-wizard-modal')?.classList.remove('hidden');
  document.body.classList.add('guest-wizard-open');
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => {
    $('reservation-wizard-modal')?.querySelector('.res-modal')?.getBoundingClientRect();
  });
}

function hideModal() {
  closeAllWizardRoomTypePanels();
  $('reservation-wizard-overlay')?.classList.add('hidden');
  $('reservation-wizard-modal')?.classList.add('hidden');
  $('reservation-wizard-modal')?.querySelector('.res-modal')?.classList.remove('res-modal--guest-modify');
  document.body.classList.remove('guest-wizard-open');
  const groupOpen = !$('group-wizard-modal')?.classList.contains('hidden');
  const venueOpen = !$('venue-wizard-modal')?.classList.contains('hidden');
  if (!groupOpen && !venueOpen) document.body.style.overflow = '';
}

export function isReservationWizardOpen() { return isOpen; }

export async function openReservationWizard(options = {}) {
  const {
    mode = 'create',
    bookingId = null,
    fromRequestId = null,
    modifyRequest = false,
    guestModify = false,
    guestWasApproved = false,
    prefill = null,
    originalRequest = null,
  } = options;

  try {
  state = emptyWizardState();
  state.mode = mode;
  state.fromRequestId = fromRequestId;
  state.modifyRequest = modifyRequest;
  state.guestModify = guestModify;
  state.guestWasApproved = guestWasApproved;
  try {
    const loaders = [
      guestModify ? getUsers().catch(() => []) : getUsers(),
      getMealRates(),
      loadFiscalYearBounds(),
      getFacilitiesOverview({ fresh: guestModify }).catch(() => ({ services: [] })),
    ];
    const [usersResult, mealRatesResult, fiscalResult, catalogResult] = await Promise.all(loaders);
    users = usersResult;
    state.mealRates = mealRatesResult;
    state.meals = ensureMealsShape(state.meals, state.mealRates);
    fiscalBounds = fiscalResult;
    const catalogServices = catalogResult.services || [];
    if (guestModify) {
      const guestCatalog = getGuestSelfBookFeeCatalog(catalogServices);
      quickFees = guestCatalog.quickFees;
      feeGroups = guestCatalog.feeGroups;
    } else {
      quickFees = servicesToQuickFees(catalogServices);
      feeGroups = buildFeeGroups(catalogServices);
    }
  } catch {
    users = [];
    quickFees = [];
    feeGroups = [];
  }

  if (bookingId) {
    const booking = await getBookingById(bookingId);
    state.bookingId = booking.id;
    state.userId = booking.user_id;
    state.guestName = booking.guest_name || '';
    state.email = booking.guest_email || '';
    state.contactPhone = booking.contact_phone || '';
    state.checkIn = String(booking.check_in).slice(0, 10);
    state.checkOut = String(booking.check_out).slice(0, 10);
    state.guestCount = booking.guest_count || 1;
    state.roomId = booking.room_id;
    state.notes = booking.notes || '';
    state.meals = mealsFromBooking(booking.meals || []);
    state.mealAllergenNotes = booking.meal_allergen_notes || '';
    state.fees = (booking.fees || []).map((f) => ({ fee_name: f.fee_name, amount: f.amount }));
    state.originalFees = state.fees.map((f) => ({ ...f }));
    if (guestModify) {
      applyLoggedInGuestContact(state);
      state.originalRoomId = booking.room_id;
      state.originalRoomLabel = [booking.building_name, booking.room_number].filter(Boolean).join(' ');
    }
  } else if (fromRequestId) {
    const booking = await getBookingById(fromRequestId);
    state.bookingId = null;
    state.fromRequestId = fromRequestId;
    state.userId = booking.user_id;
    state.guestName = booking.guest_name || '';
    state.email = booking.guest_email || '';
    state.contactPhone = booking.contact_phone || '';
    state.checkIn = String(booking.check_in).slice(0, 10);
    state.checkOut = String(booking.check_out).slice(0, 10);
    state.guestCount = booking.guest_count || 1;
    state.roomId = booking.room_id;
    state.notes = booking.notes || '';
    state.meals = mealsFromBooking(booking.meals || []);
    state.mealAllergenNotes = booking.meal_allergen_notes || '';
    state.fees = (booking.fees || []).map((f) => ({ fee_name: f.fee_name, amount: f.amount }));
    state.originalFees = state.fees.map((f) => ({ ...f }));
  }

  if (prefill) {
    Object.assign(state, {
      userId: prefill.userId || prefill.user_id || state.userId,
      guestName: prefill.guestName || prefill.requester?.name || state.guestName,
      email: prefill.email || prefill.requester?.email || state.email,
      contactPhone: prefill.contactPhone || prefill.contact_phone || state.contactPhone,
      checkIn: prefill.checkIn || prefill.schedule?.checkIn || state.checkIn,
      checkOut: prefill.checkOut || prefill.schedule?.checkOut || state.checkOut,
      guestCount: prefill.guestCount || prefill.guest_count || state.guestCount,
      roomId: prefill.roomId || prefill.room_id || state.roomId,
      notes: prefill.notes || state.notes,
    });
    if (prefill.meals) {
      state.meals = Array.isArray(prefill.meals) ? mealsFromBooking(prefill.meals) : { ...state.meals, ...prefill.meals };
    }
    if (prefill.mealAllergenNotes != null) state.mealAllergenNotes = prefill.mealAllergenNotes;
    if (prefill.fees?.length) {
      state.fees = prefill.fees.map((f) => ({ fee_name: f.fee_name, amount: f.amount }));
      state.originalFees = state.fees.map((f) => ({ ...f }));
    }
  }

  if (originalRequest) {
    state.originalRoomId = originalRequest.roomId || originalRequest.room_id || state.roomId || '';
    state.originalCheckIn = originalRequest.checkIn || originalRequest.check_in || state.checkIn;
    state.originalCheckOut = originalRequest.checkOut || originalRequest.check_out || state.checkOut;
    state.originalRoomLabel = originalRequest.roomLabel
      || [originalRequest.building, originalRequest.roomNumber].filter(Boolean).join(' ')
      || '';
  } else if (state.roomId && prefill?.facility) {
    state.originalRoomId = state.roomId;
    state.originalRoomLabel = [prefill.facility?.building, prefill.facility?.roomNumber].filter(Boolean).join(' ');
  }

  if (guestModify && state.checkIn && state.checkOut && state.checkOut > state.checkIn) {
    state.step = 2;
  } else if (modifyRequest && state.roomId && state.checkIn && state.checkOut) {
    state.step = 3;
    state.showRecommendations = true;
  }

  state.meals = ensureMealsShape(state.meals, state.mealRates);

  isOpen = true;
  showModal();
  renderSteps();
  renderBody();

  if (state.checkIn && state.checkOut && state.checkOut > state.checkIn) {
    await fetchRooms();
  }
  } catch (err) {
    console.error('[reservation-wizard]', err);
    state = emptyWizardState();
    state.error = err.message || 'Could not open this reservation. Please try again.';
    isOpen = true;
    showModal();
    renderSteps();
    renderBody();
  }
}

export function closeReservationWizard() {
  isOpen = false;
  hideModal();
  state = emptyWizardState();
}

export function initReservationWizard() {
  if (initialized) return;
  initialized = true;

  $('reservation-wizard-close')?.addEventListener('click', closeReservationWizard);
  $('reservation-wizard-overlay')?.addEventListener('click', closeReservationWizard);
  $('reservation-wizard-back')?.addEventListener('click', goBack);
  $('reservation-wizard-next')?.addEventListener('click', goNext);
  $('reservation-wizard-confirm')?.addEventListener('click', confirmSave);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !isOpen) return;
    closeReservationWizard();
  });

  window.addEventListener('reservation-wizard:open', (e) => openReservationWizard(e.detail || {}));
  bindMealDelegation();
  bindRoomPickDelegation();
}
