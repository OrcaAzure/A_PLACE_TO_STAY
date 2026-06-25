/**
 * Step-by-step reservation wizard — create & edit (boomer-friendly).
 */

import {
  createBooking, updateBooking, getMealRates, getRoomAvailability, getUsers, getBookingById, getFacilitiesOverview,
} from '/assets/js/services/api.js';
import {
  WIZARD_STEPS, QUICK_FEES, escapeHtml, formatDateLong, formatMoney,
  emptyWizardState, mealsFromBooking, calcGrandTotal, calcMealsSubtotal, calcFeesSubtotal, availLabel, debounce,
  loadFiscalYearBounds, applyBookingDateBounds, formatFiscalYearHint,
  recommendRooms, recommendationReason, servicesToQuickFees, filterRoomsList,
} from '/assets/js/features/reservation-shared.js';

let initialized = false;
let isOpen = false;
let state = emptyWizardState();
let users = [];
let fiscalBounds = null;
let quickFees = QUICK_FEES;

function $(id) { return document.getElementById(id); }

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
    ${fiscalBounds ? `<p class="res-hint">${escapeHtml(formatFiscalYearHint(fiscalBounds))}</p>` : ''}
    <div class="res-row">
      <div><label class="res-label">Check-in</label><input id="wiz-check-in" class="res-input" type="date" value="${escapeHtml(state.checkIn)}" /></div>
      <div><label class="res-label">Check-out</label><input id="wiz-check-out" class="res-input" type="date" value="${escapeHtml(state.checkOut)}" /></div>
    </div>
    <label class="res-label">Number of guests</label>
    <input id="wiz-guests" class="res-input res-input--short" type="number" min="1" max="20" value="${state.guestCount}" />
    <p class="res-hint">Room options on the next step will update based on this number.</p>
    ${banner}`;
}

function renderRoomRow(room, { recommended = false } = {}) {
  const ok = room.availability_status === 'available';
  const sel = String(room.id) === String(state.roomId);
  const av = availLabel(room.availability_status);
  const topPick = recommended && room.recommendation_rank === 1;
  return `
    <button type="button" class="res-room-row${sel ? ' is-selected' : ''}${ok ? '' : ' is-disabled'}${recommended ? ' is-recommended' : ''}"
      data-room-id="${room.id}" ${ok ? '' : 'disabled tabindex="-1"'}>
      <div class="res-room-row-main">
        <div class="res-room-row-id">
          <span class="material-symbols-outlined res-room-icon">meeting_room</span>
          <div>
            <strong class="res-room-row-num">Room ${escapeHtml(room.room_number)}</strong>
            <span class="res-room-meta">${escapeHtml(room.building_name)} · ${escapeHtml(room.room_type)}</span>
            ${topPick ? '<span class="res-rec-badge">Top pick</span>' : ''}
            ${recommended && !topPick ? '<span class="res-rec-badge res-rec-badge--alt">Suggested</span>' : ''}
          </div>
        </div>
        <span class="res-pill ${av.cls}">${av.text}</span>
        <span class="res-room-row-cap">Fits ${room.capacity_min}–${room.capacity_max}</span>
        ${ok && room.estimated_total != null ? `<span class="res-room-row-price">${formatMoney(room.estimated_total)}</span>` : ''}
      </div>
      ${recommended ? `<p class="res-rec-reason">${escapeHtml(recommendationReason(room, state.guestCount))}</p>` : ''}
      ${!ok && room.availability_status === 'booked' ? '<p class="res-room-warn">Already booked on these dates.</p>' : ''}
    </button>`;
}

function getFilteredAvailableRooms() {
  return filterRoomsList(state.availableRooms, {
    search: state.roomSearch,
    building: state.buildingFilter,
    status: 'available',
  });
}

function renderStep3() {
  const originalRoom = state.originalRoomId
    ? state.availableRooms.find((r) => String(r.id) === String(state.originalRoomId))
    : null;
  const requestedUnavailable = originalRoom && originalRoom.availability_status === 'booked';
  const recommended = recommendRooms(state.availableRooms, state.guestCount, 3);
  const filtered = getFilteredAvailableRooms();
  const buildings = [...new Set(state.availableRooms
    .filter((r) => r.availability_status === 'available')
    .map((r) => r.building_name).filter(Boolean))].sort();
  const buildingOpts = buildings.map((b) =>
    `<option value="${escapeHtml(b)}"${state.buildingFilter === b ? ' selected' : ''}>${escapeHtml(b)}</option>`
  ).join('');

  const conflictBanner = (requestedUnavailable || (state.modifyRequest && state.originalRoomLabel)) ? `
    <div class="res-banner res-banner--warn">
      ${requestedUnavailable
    ? `<strong>Room conflict:</strong> The guest requested <strong>${escapeHtml(state.originalRoomLabel || 'this room')}</strong>, but it is already booked on these dates. Choose another room and explain the change on the last step.`
    : state.modifyRequest
      ? `Guest originally requested <strong>${escapeHtml(state.originalRoomLabel || 'a room')}</strong>. You can change the room, dates, or details before approving.`
      : ''}
    </div>` : '';

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
    <p class="res-lead">Search and pick a room. Use <strong>Show suggested rooms</strong> if you want help finding a good fit.</p>
    ${conflictBanner}
    ${state.loadingRooms ? '<p class="res-hint">Loading rooms…</p>' : ''}
    <div class="res-room-toolbar">
      <input id="wiz-room-search" type="search" class="res-input" placeholder="Search building, room number, or type…" value="${escapeHtml(state.roomSearch)}" />
      <select id="wiz-building-filter" class="res-input res-input--select">
        <option value="">All buildings</option>
        ${buildingOpts}
      </select>
      ${recToggle}
    </div>
    ${recBlock}
    ${listBlock}`;
}

function renderMealRow(type, qty) {
  const price = state.mealRates[type];
  return `
    <div class="res-meal-row">
      <div>
        <strong>${type}</strong>
        <span class="res-meal-price">${formatMoney(price)} each</span>
      </div>
      <div class="res-qty">
        <button type="button" data-meal-minus="${type}" aria-label="Less ${type}">−</button>
        <span>${qty}</span>
        <button type="button" data-meal-plus="${type}" aria-label="More ${type}">+</button>
      </div>
      <span class="res-meal-sub">${formatMoney(price * qty)}</span>
    </div>`;
}

function renderStep4() {
  const feeRows = state.fees.map((f, i) => `
    <tr><td>${escapeHtml(f.fee_name)}</td><td>${formatMoney(f.amount)}</td>
    <td><button type="button" class="res-btn-sm res-btn-sm--danger" data-fee-rm="${i}">Remove</button></td></tr>`).join('');
  const quickBtns = quickFees.map((f) =>
    `<button type="button" class="res-quick-fee" data-quick-fee="${escapeHtml(f.name)}" data-quick-amt="${f.amount}">${escapeHtml(f.name)} (${formatMoney(f.amount)})</button>`
  ).join('');
  return `
    <p class="res-lead">Add meals if needed. Set a different quantity for each meal.</p>
    <div class="res-meals-box">
      ${renderMealRow('Breakfast', state.meals.Breakfast)}
      ${renderMealRow('Lunch', state.meals.Lunch)}
      ${renderMealRow('Dinner', state.meals.Dinner)}
      ${renderMealRow('Snack', state.meals.Snack)}
      <p class="res-meal-total">Meals subtotal: <strong>${formatMoney(calcMealsSubtotal(state.meals, state.mealRates))}</strong></p>
    </div>
    <h3 class="res-subhead">Additional fees (optional)</h3>
    <p class="res-hint">Tap a common fee or add your own.</p>
    <div class="res-quick-fees">${quickBtns}</div>
    <div class="res-row">
      <div><label class="res-label">Fee name</label><input id="wiz-fee-name" class="res-input" placeholder="e.g. Extra mattress" /></div>
      <div><label class="res-label">Amount (₱)</label><input id="wiz-fee-amt" class="res-input" type="number" min="0" step="1" placeholder="0" /></div>
    </div>
    <button type="button" id="wiz-add-fee" class="res-btn res-btn--secondary">Add Custom Fee</button>
    ${state.fees.length ? `<table class="res-fee-table"><thead><tr><th>Fee</th><th>Amount</th><th></th></tr></thead><tbody>${feeRows}</tbody></table>
      <p class="res-meal-total">Fees subtotal: <strong>${formatMoney(calcFeesSubtotal(state.fees))}</strong></p>` : ''}`;
}

function renderStep5() {
  const r = state.selectedRoom;
  const grand = calcGrandTotal(state.roomTotal, state.meals, state.fees, state.mealRates);
  const mealLines = ['Breakfast', 'Lunch', 'Dinner', 'Snack'].filter((t) => state.meals[t] > 0)
    .map((t) => `${t} × ${state.meals[t]} = ${formatMoney(state.meals[t] * state.mealRates[t])}`).join('<br>');
  const modifyBlock = state.modifyRequest ? `
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
    <div class="res-review"><h4>Guest</h4><p>${escapeHtml(state.guestName)} · ${escapeHtml(state.contactPhone || '—')} · ${escapeHtml(state.email || '—')}</p></div>
    <div class="res-review"><h4>Stay</h4><p>${formatDateLong(state.checkIn)} to ${formatDateLong(state.checkOut)} · ${state.guestCount} guest(s)</p></div>
    <div class="res-review"><h4>Room</h4><p>${r ? `Room ${escapeHtml(r.room_number)} (${escapeHtml(r.building_name)}) — ${formatMoney(state.roomTotal)}` : '—'}</p></div>
    ${mealLines ? `<div class="res-review"><h4>Meals</h4><p>${mealLines}</p></div>` : ''}
    ${state.fees.length ? `<div class="res-review"><h4>Extra fees</h4><p>${state.fees.map((f) => `${escapeHtml(f.fee_name)}: ${formatMoney(f.amount)}`).join('<br>')}</p></div>` : ''}
    <label class="res-label">Notes (optional)</label>
    <textarea id="wiz-notes" class="res-input" rows="2">${escapeHtml(state.notes)}</textarea>
    <p class="res-grand-total">Grand total: ${formatMoney(grand)}</p>`;
}

function renderBody() {
  const mount = $('reservation-wizard-body');
  if (!mount) return;
  const fns = { 1: renderStep1, 2: renderStep2, 3: renderStep3, 4: renderStep4, 5: renderStep5 };
  mount.innerHTML = fns[state.step]?.() || '';

  $('reservation-wizard-title').textContent = state.mode === 'edit'
    ? 'Edit Reservation'
    : state.modifyRequest
      ? 'Modify & Approve Request'
      : state.fromRequestId
        ? 'Approve Guest Request'
        : 'Create Reservation';
  $('reservation-wizard-subtitle').textContent = WIZARD_STEPS[state.step - 1]?.short || '';
  $('reservation-wizard-back').classList.toggle('hidden', state.step <= 1);
  $('reservation-wizard-next').classList.toggle('hidden', state.step >= 5);
  $('reservation-wizard-confirm').classList.toggle('hidden', state.step < 5);
  $('reservation-wizard-next').disabled = state.saving;
  $('reservation-wizard-confirm').disabled = state.saving;

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
  $('wiz-building-filter')?.addEventListener('change', (e) => {
    state.buildingFilter = e.target.value;
    renderBody();
  });
  $('wiz-toggle-rec')?.addEventListener('click', () => {
    state.showRecommendations = !state.showRecommendations;
    renderBody();
  });

  $('reservation-wizard-body')?.querySelectorAll('[data-room-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.roomId = btn.getAttribute('data-room-id');
      state.selectedRoom = state.availableRooms.find((r) => String(r.id) === String(state.roomId)) || null;
      state.roomTotal = state.selectedRoom?.estimated_total || 0;
      state.error = null;
      renderBody();
    });
  });

  const bodyEl = $('reservation-wizard-body');
  ['Breakfast', 'Lunch', 'Dinner', 'Snack'].forEach((type) => {
    bodyEl?.querySelector(`[data-meal-plus="${type}"]`)?.addEventListener('click', () => { state.meals[type]++; renderBody(); });
    bodyEl?.querySelector(`[data-meal-minus="${type}"]`)?.addEventListener('click', () => { state.meals[type] = Math.max(0, state.meals[type] - 1); renderBody(); });
  });

  $('reservation-wizard-body')?.querySelectorAll('[data-quick-fee]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.fees.push({ fee_name: btn.getAttribute('data-quick-fee'), amount: Number(btn.getAttribute('data-quick-amt')) });
      renderBody();
    });
  });

  $('wiz-add-fee')?.addEventListener('click', () => {
    const name = $('wiz-fee-name')?.value?.trim();
    const amount = Number($('wiz-fee-amt')?.value);
    if (!name || !amount) { state.error = 'Enter a fee name and amount.'; renderBody(); return; }
    state.fees.push({ fee_name: name, amount });
    state.error = null;
    renderBody();
  });

  $('reservation-wizard-body')?.querySelectorAll('[data-fee-rm]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.fees.splice(Number(btn.getAttribute('data-fee-rm')), 1);
      renderBody();
    });
  });
}

function validate() {
  readFields();
  state.error = null;
  if (state.step === 1 && !state.guestName) { state.error = 'Please enter the guest name.'; return false; }
  if (state.step === 2) {
    if (!state.checkIn || !state.checkOut) { state.error = 'Please select check-in and check-out dates.'; return false; }
    if (state.checkOut <= state.checkIn) { state.error = 'Check-out must be after check-in.'; return false; }
  }
  if (state.step === 3 && !state.roomId) { state.error = 'Please select an available room.'; return false; }
  if (state.step === 5 && state.modifyRequest && !state.guestMessage?.trim()) {
    state.error = 'Please enter a message explaining the change for the guest.';
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
  if (state.modifyRequest && !state.guestMessage?.trim()) {
    state.error = 'Please enter a message explaining the change for the guest.';
    renderBody();
    return;
  }
  if (!state.roomId) { state.error = 'Please select a room.'; renderBody(); return; }
  state.saving = true;
  state.error = null;
  renderBody();

  const noteText = state.notes || '';
  const modLine = state.modifyRequest && state.guestMessage?.trim()
    ? `[Modified by admin] ${state.guestMessage.trim()}`
    : '';
  const combinedNotes = [noteText, modLine].filter(Boolean).join('\n') || undefined;

  const payload = {
    user_id: state.userId ? Number(state.userId) : undefined,
    guest_name: state.guestName,
    email: state.email || undefined,
    room_id: Number(state.roomId),
    check_in: state.checkIn,
    check_out: state.checkOut,
    guest_count: state.guestCount,
    contact_phone: state.contactPhone || undefined,
    notes: combinedNotes,
    status: 'Approved',
    meals: state.meals,
    fees: state.fees,
    notify_guest: Boolean(state.fromRequestId || state.modifyRequest),
    notify_modification: Boolean(state.modifyRequest),
    modification_message: state.modifyRequest ? state.guestMessage?.trim() : undefined,
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
  document.body.style.overflow = 'hidden';
}

function hideModal() {
  $('reservation-wizard-overlay')?.classList.add('hidden');
  $('reservation-wizard-modal')?.classList.add('hidden');
  document.body.style.overflow = '';
}

export function isReservationWizardOpen() { return isOpen; }

export async function openReservationWizard(options = {}) {
  const {
    mode = 'create',
    bookingId = null,
    fromRequestId = null,
    modifyRequest = false,
    prefill = null,
    originalRequest = null,
  } = options;
  state = emptyWizardState();
  state.mode = mode;
  state.fromRequestId = fromRequestId;
  state.modifyRequest = modifyRequest;

  try {
    const [usersResult, mealRatesResult, fiscalResult, catalogResult] = await Promise.all([
      getUsers(),
      getMealRates(),
      loadFiscalYearBounds(),
      getFacilitiesOverview().catch(() => ({ services: [] })),
    ]);
    users = usersResult;
    state.mealRates = mealRatesResult;
    fiscalBounds = fiscalResult;
    quickFees = servicesToQuickFees(catalogResult.services || []);
  } catch {
    users = [];
    quickFees = QUICK_FEES;
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
    state.fees = (booking.fees || []).map((f) => ({ fee_name: f.fee_name, amount: f.amount }));
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

  isOpen = true;
  showModal();
  renderSteps();
  renderBody();

  if (state.checkIn && state.checkOut && state.checkOut > state.checkIn) {
    await fetchRooms();
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

  window.addEventListener('reservation-wizard:open', (e) => openReservationWizard(e.detail || {}));
}
