/**
 * Step-by-step reservation wizard — create & edit (boomer-friendly).
 */

import {
  createBooking, updateBooking, getMealRates, getRoomAvailability, getUsers, getBookingById, getFacilitiesOverview,
} from '/assets/js/services/api.js';
import {
  WIZARD_STEPS, escapeHtml, formatDateLong, formatMoney,
  emptyWizardState, mealsFromBooking, calcGrandTotal, calcMealsSubtotal, calcFeesSubtotal, sanitizeGuestModifyFees, availLabel, debounce,
  loadFiscalYearBounds, applyBookingDateBounds, formatBookingWindowHint,
  recommendRooms, recommendationReason, servicesToQuickFees, applyLoggedInGuestContact, filterRoomsList,
  DORM_MIN_GUEST_COUNT, dormPriceLabel, effectiveCapacityMin,
  isRoomListVisible, isRoomBookable, dormMinGuestsNotice,
  renderAdminMealRow, readMealsFromInputs, syncAdminMealSubtotals, clampMealQty,
} from '/assets/js/features/reservation-shared.js';
import { buildFeeGroups, renderWizardFeePicker, handleWizardFeePickerClick } from '/assets/js/features/booking-fee-picker.js';
import {
  normalizePricingCategory,
  renderPricingCategoryField,
  bindPricingCategoryField,
  readPricingCategory,
} from '/assets/js/features/admin-pricing-category.js';

let initialized = false;
let isOpen = false;
let state = emptyWizardState();
let users = [];
let fiscalBounds = null;
let feeGroups = [];
let quickFees = [];
let feePickerClickBound = false;

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

function renderSteps() {
  const el = $('reservation-wizard-steps');
  if (!el) return;
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
    <label class="res-label">Guest name</label>
    <input id="wiz-name" class="res-input" type="text" value="${escapeHtml(state.guestName)}" placeholder="Full name" />
    <label class="res-label">Contact number</label>
    <input id="wiz-phone" class="res-input" type="tel" value="${escapeHtml(state.contactPhone)}" placeholder="09XX XXX XXXX" />
    <label class="res-label">Email</label>
    <input id="wiz-email" class="res-input" type="email" value="${escapeHtml(state.email)}" placeholder="email@example.com" />`;
}

function renderStep2() {
  const banner = state.checkIn && state.checkOut && state.checkOut > state.checkIn ? `
    <div class="res-banner ${state.availableCount > 0 ? 'res-banner--ok' : 'res-banner--warn'}">
      ${state.loadingRooms ? 'Checking room availability…'
    : state.availableCount > 0
      ? `<strong>${state.availableCount} room(s)</strong> can fit ${state.guestCount} guest(s) on these dates.`
      : `<strong>No rooms available</strong> for ${state.guestCount} guest(s) on these dates. Try different dates or fewer guests.`}
    </div>` : '';
  return `
    <p class="res-lead">Pick the stay dates and how many people will stay.</p>
    ${(() => {
      const hint = fiscalBounds ? formatBookingWindowHint(fiscalBounds) : '';
      return hint ? `<p class="res-hint">${escapeHtml(hint)}</p>` : '';
    })()}
    <div class="res-row">
      <div><label class="res-label">Check-in</label><input id="wiz-check-in" class="res-input" type="date" value="${escapeHtml(state.checkIn)}" /></div>
      <div><label class="res-label">Check-out</label><input id="wiz-check-out" class="res-input" type="date" value="${escapeHtml(state.checkOut)}" /></div>
    </div>
    <label class="res-label">Number of guests</label>
    <input id="wiz-guests" class="res-input res-input--short" type="number" min="1" max="20" value="${state.guestCount}" />
    <p class="res-hint">Room options on the next step will update based on this number. Dorm bookings require at least ${DORM_MIN_GUEST_COUNT} guests (per-person pricing).</p>
    ${banner}`;
}

function renderRoomRow(room, { recommended = false } = {}) {
  const bookable = isRoomBookable(room.availability_status);
  const visible = isRoomListVisible(room.availability_status);
  const sel = String(room.id) === String(state.roomId);
  const av = availLabel(room.availability_status);
  const topPick = recommended && room.recommendation_rank === 1;
  const capMin = room.dorm_booking_minimum || room.capacity_min || effectiveCapacityMin(room);
  const capLabel = room.room_type === 'Dorm'
    ? `Min ${room.dorm_booking_minimum || DORM_MIN_GUEST_COUNT} pax to book · up to ${room.capacity_max} guests`
    : `Fits ${room.capacity_min}–${room.capacity_max}`;
  const priceDetail = dormPriceLabel(room, state.guestCount, room.nights);
  return `
    <button type="button" class="res-room-row${sel ? ' is-selected' : ''}${bookable ? '' : visible ? ' is-dorm-min' : ' is-disabled'}${recommended ? ' is-recommended' : ''}"
      data-room-id="${room.id}" ${visible ? '' : 'disabled tabindex="-1"'}>
      <div class="res-room-row-main">
        <div class="res-room-row-id">
          <span class="material-symbols-outlined res-room-icon">meeting_room</span>
          <div>
            <strong class="res-room-row-num">Room ${escapeHtml(room.room_number)}</strong>
            <span class="res-room-meta">${escapeHtml(room.room_type_label || room.room_type)}</span>
            ${topPick ? '<span class="res-rec-badge">Top pick</span>' : ''}
            ${recommended && !topPick ? '<span class="res-rec-badge res-rec-badge--alt">Suggested</span>' : ''}
          </div>
        </div>
        <span class="res-pill ${av.cls}">${av.text}</span>
        <span class="res-room-row-cap">${capLabel}</span>
        ${bookable && room.estimated_total != null ? `<span class="res-room-row-price">${formatMoney(room.estimated_total)}</span>` : ''}
        ${!bookable && visible && room.estimated_total != null ? `<span class="res-room-row-price res-room-row-price--hint">${formatMoney(room.estimated_total)}</span>` : ''}
      </div>
      ${priceDetail ? `<p class="res-hint res-room-row-pricing">${escapeHtml(priceDetail)}</p>` : ''}
      ${room.availability_status === 'dorm_min_guests' ? `<p class="res-room-warn">Minimum ${room.dorm_booking_minimum || DORM_MIN_GUEST_COUNT} guests required to book this dorm.</p>` : ''}
      ${recommended ? `<p class="res-rec-reason">${escapeHtml(recommendationReason(room, state.guestCount))}</p>` : ''}
      ${!bookable && room.availability_status === 'booked' ? '<p class="res-room-warn">Already booked on these dates.</p>' : ''}
    </button>`;
}

function getFilteredAvailableRooms() {
  return filterRoomsList(state.availableRooms, {
    search: state.roomSearch,
    includeStatuses: ['available', 'dorm_min_guests'],
  });
}

function renderStep3() {
  const originalRoom = state.originalRoomId
    ? state.availableRooms.find((r) => String(r.id) === String(state.originalRoomId))
    : null;
  const requestedUnavailable = originalRoom && originalRoom.availability_status === 'booked';
  const recommended = recommendRooms(state.availableRooms, state.guestCount, 3);
  const filtered = getFilteredAvailableRooms();

  const conflictBanner = (requestedUnavailable || ((state.modifyRequest || state.guestModify) && state.originalRoomLabel)) ? `
    <div class="res-banner res-banner--warn">
      ${requestedUnavailable
    ? state.guestModify
      ? `<strong>Room unavailable:</strong> <strong>${escapeHtml(state.originalRoomLabel || 'your room')}</strong> is already booked on these dates. Choose another room${state.guestWasApproved ? ' and explain the change on the last step' : ''}.`
      : `<strong>Room conflict:</strong> The guest requested <strong>${escapeHtml(state.originalRoomLabel || 'this room')}</strong>, but it is already booked on these dates. Choose another room and explain the change on the last step.`
    : state.guestModify
      ? `You originally selected <strong>${escapeHtml(state.originalRoomLabel || 'a room')}</strong>. You can change the room or dates before submitting.`
      : state.modifyRequest
        ? `Guest originally requested <strong>${escapeHtml(state.originalRoomLabel || 'a room')}</strong>. You can change the room, dates, or details before approving.`
        : ''}
    </div>` : '';

  const lead = state.guestModify
    ? 'Search and pick a room. Tap suggested rooms if you want recommendations.'
    : 'Search and pick a room. Use <strong>Show suggested rooms</strong> if you want help finding a good fit.';

  const recToggle = recommended.length ? `
    <button type="button" id="wiz-toggle-rec" class="res-btn res-btn--secondary res-rec-toggle">
      <span class="material-symbols-outlined">auto_awesome</span>
      ${state.showRecommendations ? 'Hide suggested rooms' : `Show ${recommended.length} suggested room${recommended.length === 1 ? '' : 's'}`}
    </button>` : '';

  const recBlock = state.showRecommendations && recommended.length ? `
    <div class="res-rec-section">
      <h3 class="res-rec-head"><span class="material-symbols-outlined">star</span> Suggested for ${state.guestCount} guest(s)</h3>
      <div class="res-room-list">${recommended.map((r) => renderRoomRow(r, { recommended: true })).join('')}</div>
    </div>` : '';

  const listBlock = filtered.length ? `
    <h3 class="res-subhead res-subhead--spaced">Available rooms (${filtered.length})</h3>
    <div class="res-room-list">${filtered.map((r) => renderRoomRow(r)).join('')}</div>`
    : (!state.loadingRooms
      ? '<div class="res-empty-box"><span class="material-symbols-outlined">search_off</span><p>No rooms match your search. Clear filters or change dates.</p></div>'
      : '');

  return `
    <p class="res-lead">${lead}</p>
    ${conflictBanner}
    ${state.loadingRooms ? '<p class="res-hint">Loading rooms…</p>' : ''}
    <div class="res-room-toolbar">
      <input id="wiz-room-search" type="search" class="res-input" placeholder="Search room number or type…" value="${escapeHtml(state.roomSearch)}" />
      ${recToggle}
    </div>
    ${recBlock}
    ${listBlock}`;
}

function renderMealRow(type, qty) {
  return renderAdminMealRow(type, qty, state.mealRates[type], { idPrefix: 'wiz' });
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
  return `
    <p class="res-lead">Add meals if needed. Set a different quantity for each meal.</p>
    <div class="res-meals-box">
      ${renderMealRow('Breakfast', state.meals.Breakfast)}
      ${renderMealRow('Lunch', state.meals.Lunch)}
      ${renderMealRow('Dinner', state.meals.Dinner)}
      ${renderMealRow('Snack', state.meals.Snack)}
      <p class="res-meal-total">Meals subtotal: <strong data-meals-total>${formatMoney(calcMealsSubtotal(state.meals, state.mealRates))}</strong></p>
    </div>
    <label class="res-label" for="wiz-meal-allergens">Meal allergens &amp; dietary notes (optional)</label>
    <textarea id="wiz-meal-allergens" class="res-input" rows="2" placeholder="e.g. nut allergy, gluten-free, vegetarian…">${escapeHtml(state.mealAllergenNotes || '')}</textarea>
    <h3 class="res-subhead">Additional fees (optional)</h3>
    <p class="res-hint">${state.guestModify
    ? 'Choose a category, then add catalog fees. Custom charges must be arranged with housing.'
    : 'Choose a category to browse options, or add a custom fee below.'}</p>
    ${feePickerBlock}`;
}

function renderStep5() {
  const r = state.selectedRoom;
  const grand = calcGrandTotal(state.roomTotal, state.meals, state.fees, state.mealRates);
  const mealLines = ['Breakfast', 'Lunch', 'Dinner', 'Snack'].filter((t) => state.meals[t] > 0)
    .map((t) => `${t} × ${state.meals[t]} = ${formatMoney(state.meals[t] * state.mealRates[t])}`).join('<br>');
  const modifyBlock = state.guestModify
    ? (state.guestWasApproved ? `
    <div class="res-banner res-banner--warn">
      This reservation was already approved. Submitting changes sends it back to housing for review.
    </div>
    <label class="res-label" for="wiz-guest-message">Message to housing (required)</label>
    <textarea id="wiz-guest-message" class="res-input" rows="3" placeholder="e.g. We need to arrive one day later and would like a room on the ground floor if possible.">${escapeHtml(state.guestMessage)}</textarea>
  ` : `
    <div class="res-banner res-banner--ok">You can update your pending request. Housing will review any changes.</div>
  `)
    : state.modifyRequest ? `
    <div class="res-banner res-banner--warn">
      You are approving this request with changes. The guest will receive an email explaining what changed.
    </div>
    <label class="res-label" for="wiz-guest-message">Message to guest (required)</label>
    <textarea id="wiz-guest-message" class="res-input" rows="3" placeholder="e.g. Your requested room was already booked, so we assigned Room 102 in the same building instead.">${escapeHtml(state.guestMessage)}</textarea>
  ` : (state.fromRequestId ? `
    <div class="res-banner res-banner--ok">The guest will receive a confirmation email when you save.</div>
  ` : '');

  return `
    <p class="res-lead">Please review everything before saving.</p>
    ${modifyBlock}
    ${state.guestModify
    ? `<div class="res-review"><h4>Guest</h4>${renderGuestContactCard({ compact: true })}</div>`
    : `<div class="res-review"><h4>Guest</h4><p>${escapeHtml(state.guestName)} · ${escapeHtml(state.contactPhone || '—')} · ${escapeHtml(state.email || '—')}</p></div>`}
    <div class="res-review"><h4>Stay</h4><p>${formatDateLong(state.checkIn)} to ${formatDateLong(state.checkOut)} · ${state.guestCount} guest(s)</p></div>
    <div class="res-review"><h4>Room</h4><p>${r ? `Room ${escapeHtml(r.room_number)} · ${escapeHtml(r.room_type_label || r.room_type)} — ${formatMoney(state.roomTotal)}${dormPriceLabel(r, state.guestCount, r.nights) ? `<br><span class="res-hint">${escapeHtml(dormPriceLabel(r, state.guestCount, r.nights))}</span>` : ''}` : '—'}</p></div>
    ${mealLines ? `<div class="res-review"><h4>Meals</h4><p>${mealLines}</p></div>` : ''}
    ${state.fees.length ? `<div class="res-review"><h4>Extra fees</h4><p>${state.fees.map((f) => `${escapeHtml(f.fee_name)}: ${formatMoney(f.amount)}`).join('<br>')}</p></div>` : ''}
    <label class="res-label">Notes (optional)</label>
    <textarea id="wiz-notes" class="res-input" rows="2">${escapeHtml(state.notes)}</textarea>
    ${!state.guestModify ? renderPricingCategoryField({
    id: 'wiz-pricing-category',
    value: state.pricingCategory,
    compact: true,
    hint: 'Assign the rate tier for this stay. Totals update when you change this.',
  }) : ''}
    <p class="res-grand-total">${state.guestModify || state.fromRequestId ? 'Estimated total' : 'Grand total'}: ${formatMoney(grand)}</p>`;
}

function renderBody() {
  const mount = $('reservation-wizard-body');
  if (!mount) return;
  const fns = { 1: renderStep1, 2: renderStep2, 3: renderStep3, 4: renderStep4, 5: renderStep5 };
  mount.classList.remove('res-wizard-body--enter');
  mount.innerHTML = fns[state.step]?.() || '';
  requestAnimationFrame(() => mount.classList.add('res-wizard-body--enter'));

  $('reservation-wizard-title').textContent = state.guestModify
    ? 'Modify Reservation'
    : state.mode === 'edit'
      ? 'Edit Reservation'
      : state.modifyRequest
        ? 'Modify & Approve Request'
        : state.fromRequestId
          ? 'Approve Guest Request'
          : 'Create Reservation';
  $('reservation-wizard-subtitle').textContent = WIZARD_STEPS[state.step - 1]?.short || '';
  setBtnVisible($('reservation-wizard-back'), state.step > 1);
  setBtnVisible($('reservation-wizard-next'), state.step < 5);
  setBtnVisible($('reservation-wizard-confirm'), state.step >= 5);
  $('reservation-wizard-next').disabled = state.saving;
  $('reservation-wizard-confirm').disabled = state.saving;
  $('reservation-wizard-next').textContent = state.saving ? 'Please wait…' : 'Next step';
  $('reservation-wizard-confirm').textContent = state.saving
    ? 'Saving…'
    : (state.guestModify ? 'Submit changes' : 'Save reservation');

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
  if (!state.guestModify && $('wiz-pricing-category')) {
    state.pricingCategory = readPricingCategory($('reservation-wizard-body'), state.pricingCategory);
  }
}

async function reloadPricingForCategory(category) {
  state.pricingCategory = normalizePricingCategory(category);
  state.mealRates = await getMealRates(state.pricingCategory);
  if (state.checkIn && state.checkOut && state.checkOut > state.checkIn) {
    await fetchRooms();
  } else {
    renderBody();
  }
}

async function fetchRooms() {
  if (!state.checkIn || !state.checkOut || state.checkOut <= state.checkIn) return;
  state.loadingRooms = true;
  state.error = null;
  renderBody();
  try {
    const data = await getRoomAvailability({
      check_in: state.checkIn,
      check_out: state.checkOut,
      guest_count: state.guestCount,
      exclude_booking_id: state.bookingId || state.fromRequestId || undefined,
      pricing_category: state.guestModify ? undefined : state.pricingCategory,
    });
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
    state.error = err.message;
  } finally {
    state.loadingRooms = false;
    renderSteps();
    renderBody();
  }
}

function bindEvents() {
  $('wiz-user')?.addEventListener('change', (e) => {
    const opt = e.target.selectedOptions[0];
    if (!opt?.value) return;
    state.userId = opt.value;
    state.guestName = opt.dataset.name || state.guestName;
    state.email = opt.dataset.email || state.email;
    renderBody();
  });

  const onStayChange = () => {
    readFields();
    state.roomId = '';
    state.selectedRoom = null;
    fetchRooms();
  };
  const debouncedStayChange = debounce(onStayChange, 400);
  $('wiz-check-in')?.addEventListener('change', onStayChange);
  $('wiz-check-out')?.addEventListener('change', onStayChange);
  $('wiz-guests')?.addEventListener('change', onStayChange);
  $('wiz-guests')?.addEventListener('input', debouncedStayChange);

  $('wiz-room-search')?.addEventListener('input', (e) => {
    state.roomSearch = e.target.value;
    renderBody();
  });
  $('wiz-toggle-rec')?.addEventListener('click', () => {
    state.showRecommendations = !state.showRecommendations;
    renderBody();
  });

  $('reservation-wizard-body')?.querySelectorAll('[data-room-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const room = state.availableRooms.find((r) => String(r.id) === String(btn.getAttribute('data-room-id'))) || null;
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
      state.roomId = btn.getAttribute('data-room-id');
      state.selectedRoom = room;
      state.roomTotal = room.estimated_total || 0;
      state.error = null;
      renderBody();
    });
  });

  const bodyEl = $('reservation-wizard-body');
  ['Breakfast', 'Lunch', 'Dinner', 'Snack'].forEach((type) => {
    bodyEl?.querySelector(`[data-meal-qty="${type}"]`)?.addEventListener('input', (e) => {
      state.meals[type] = clampMealQty(e.target.value);
      syncAdminMealSubtotals(bodyEl, state.meals, state.mealRates);
    });
    bodyEl?.querySelector(`[data-meal-qty="${type}"]`)?.addEventListener('blur', (e) => {
      state.meals[type] = clampMealQty(e.target.value);
      e.target.value = state.meals[type];
      syncAdminMealSubtotals(bodyEl, state.meals, state.mealRates);
    });
  });

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
    bindPricingCategoryField(bodyEl, (cat) => reloadPricingForCategory(cat));
  }
}

function validate() {
  readFields();
  state.error = null;
  if (state.step === 1 && !state.guestModify && !state.guestName) { state.error = 'Please enter the guest name.'; return false; }
  if (state.step === 2) {
    if (!state.checkIn || !state.checkOut) { state.error = 'Please select check-in and check-out dates.'; return false; }
    if (state.checkOut <= state.checkIn) { state.error = 'Check-out must be after check-in.'; return false; }
  }
  if (state.step === 3 && !state.roomId) { state.error = 'Please select an available room.'; return false; }
  if (state.step === 3 && state.selectedRoom?.room_type === 'Dorm' && state.guestCount < DORM_MIN_GUEST_COUNT) {
    state.error = dormMinGuestsNotice(state.guestCount);
    return false;
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
  if (!validate()) { renderBody(); return; }
  if (state.step === 2) await fetchRooms();
  if (state.step < 5) state.step++;
  renderSteps();
  renderBody();
}

function goBack() {
  readFields();
  if (state.step > 1) state.step--;
  state.error = null;
  renderSteps();
  renderBody();
}

async function confirmSave() {
  readFields();
  if (state.modifyRequest && !state.guestModify && !state.guestMessage?.trim()) {
    state.error = 'Please enter a message explaining the change for the guest.';
    renderBody();
    return;
  }
  if (state.guestModify && state.guestWasApproved && !state.guestMessage?.trim()) {
    state.error = 'Please enter a message explaining what you want changed.';
    renderBody();
    return;
  }
  if (!state.roomId) { state.error = 'Please select a room.'; renderBody(); return; }
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
    email: state.guestModify ? undefined : (state.email || undefined),
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
    pricing_category: state.guestModify ? undefined : normalizePricingCategory(state.pricingCategory),
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
  $('reservation-wizard-overlay')?.classList.add('hidden');
  $('reservation-wizard-modal')?.classList.add('hidden');
  document.body.classList.remove('guest-wizard-open');
  const groupOpen = !$('group-wizard-modal')?.classList.contains('hidden');
  if (!groupOpen) document.body.style.overflow = '';
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
  if (!guestModify) {
    const prefillCategory = prefill?.pricingCategory || prefill?.pricing_category;
    if (prefillCategory) state.pricingCategory = normalizePricingCategory(prefillCategory);
  }

  try {
    const loaders = [
      guestModify ? getUsers().catch(() => []) : getUsers(),
      getMealRates(guestModify ? 'Guest' : state.pricingCategory),
      loadFiscalYearBounds(),
      getFacilitiesOverview().catch(() => ({ services: [] })),
    ];
    const [usersResult, mealRatesResult, fiscalResult, catalogResult] = await Promise.all(loaders);
    users = usersResult;
    state.mealRates = mealRatesResult;
    fiscalBounds = fiscalResult;
    quickFees = servicesToQuickFees(catalogResult.services || []);
    feeGroups = buildFeeGroups(catalogResult.services || []);
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
    if (!guestModify && booking.pricing_category) {
      state.pricingCategory = normalizePricingCategory(booking.pricing_category);
      state.mealRates = await getMealRates(state.pricingCategory);
    }
    if (guestModify) applyLoggedInGuestContact(state);
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
  }

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
}
