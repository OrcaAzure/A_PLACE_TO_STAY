/**
 * Multi-room group reservation wizard — admin create/edit/approve + guest flow support.
 */

import {
  createGroup, updateGroup, getGroupById, getMealRates, getUsers, suggestGroupRooms, getFacilitiesOverview,
} from '/assets/js/services/api.js';
import {
  GROUP_WIZARD_STEPS, escapeHtml, formatDateLong, formatMoney,
  emptyGroupWizardState, mealsFromBooking, calcMealsSubtotal, calcFeesSubtotal, calcGroupGrandTotal,
  assignedGuestTotal, debounce, servicesToQuickFees, applyLoggedInGroupContact, sanitizeGuestModifyFees,
  loadFiscalYearBounds, applyBookingDateBounds, formatBookingWindowHint,
  renderAdminMealRow, readMealsFromInputs, syncAdminMealSubtotals, clampMealQty,
} from '/assets/js/features/reservation-shared.js';
import { buildFeeGroups, renderWizardFeePicker, handleWizardFeePickerClick } from '/assets/js/features/booking-fee-picker.js';

let initialized = false;
let isOpen = false;
let state = emptyGroupWizardState();
let users = [];
let fiscalBounds = null;
let feeGroups = [];
let quickFees = [];
let feePickerClickBound = false;

function $(id) { return document.getElementById(id); }

function setBtnVisible(el, visible) {
  if (!el) return;
  el.classList.toggle('hidden', !visible);
  el.hidden = !visible;
}

function renderGroupContactCard({ lead, compact } = {}) {
  const phone = state.contactPhone?.trim() || 'No phone on file';
  const email = state.email?.trim() || 'No email on file';
  const card = `
    <div class="guest-wizard-contact${compact ? ' guest-wizard-contact--compact' : ''}">
      <div class="guest-wizard-contact__avatar" aria-hidden="true">${escapeHtml(nameInitials(state.contactName || state.groupName))}</div>
      <div>
        <p class="guest-wizard-contact__name">${escapeHtml(state.groupName || 'Group')}</p>
        <p class="guest-wizard-contact__meta">${escapeHtml(state.contactName || 'Contact')} · ${escapeHtml(phone)}<br>${escapeHtml(email)}</p>
      </div>
    </div>`;
  if (compact) return card;
  return `${lead ? `<p class="res-lead">${lead}</p>` : ''}${card}`;
}

function renderSteps() {
  const el = $('group-wizard-steps');
  if (!el) return;
  el.innerHTML = GROUP_WIZARD_STEPS.map((s) => {
    const done = s.id < state.step;
    const active = s.id === state.step;
    return `<div class="res-step${active ? ' is-active' : ''}${done ? ' is-done' : ''}">
      <span class="res-step-num">${s.id}</span><span class="res-step-label">${s.label}</span></div>`;
  }).join('');
}

function nameInitials(name) {
  const parts = String(name || 'G').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'G';
  return parts.slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

function renderStep1() {
  if (state.guestModify) {
    return renderGroupContactCard({ lead: 'Your group contact details.' });
  }
  const opts = users.map((u) =>
    `<option value="${u.id}" data-name="${escapeHtml(u.full_name)}" data-email="${escapeHtml(u.email)}"${String(u.id) === String(state.userId) ? ' selected' : ''}>${escapeHtml(u.full_name)}</option>`
  ).join('');
  return `
    <p class="res-lead">Enter the group or organization name and a contact person.</p>
    <label class="res-label">Group / organization name</label>
    <input id="gw-group-name" class="res-input" type="text" value="${escapeHtml(state.groupName)}" placeholder="e.g. Youth Camp 2026" />
    <label class="res-label">Link to guest account (optional)</label>
    <select id="gw-user" class="res-input"><option value="">— Type contact below —</option>${opts}</select>
    <label class="res-label">Contact person</label>
    <input id="gw-contact" class="res-input" type="text" value="${escapeHtml(state.contactName)}" placeholder="Full name" />
    <label class="res-label">Contact number</label>
    <input id="gw-phone" class="res-input" type="tel" value="${escapeHtml(state.contactPhone)}" placeholder="09XX XXX XXXX" />
    <label class="res-label">Email</label>
    <input id="gw-email" class="res-input" type="email" value="${escapeHtml(state.email)}" placeholder="email@example.com" />`;
}

function renderStep2() {
  const banner = state.checkIn && state.checkOut && state.checkOut > state.checkIn ? `
    <div class="res-banner ${state.suggestion ? 'res-banner--ok' : 'res-banner--warn'}">
      ${state.loadingRooms ? 'Checking available rooms…'
    : state.suggestion
      ? `Good news: <strong>${state.suggestion.length} room(s)</strong> can fit all <strong>${state.totalGuests} guests</strong>. On the next step, click the big blue <strong>"Auto-pick rooms"</strong> button.`
      : state.availableCount > 0
        ? `<strong>${state.availableCount} room(s)</strong> are free on these dates. You will choose rooms on the next step.`
        : `<strong>No rooms available</strong> on these dates.`}
    </div>` : '';
  return `
    <p class="res-lead">When is the group staying, and how many people total?</p>
    ${(() => {
      const hint = fiscalBounds ? formatBookingWindowHint(fiscalBounds) : '';
      return hint ? `<p class="res-hint">${escapeHtml(hint)}</p>` : '';
    })()}
    <div class="res-row">
      <div><label class="res-label">Check-in</label><input id="gw-check-in" class="res-input" type="date" value="${escapeHtml(state.checkIn)}" /></div>
      <div><label class="res-label">Check-out</label><input id="gw-check-out" class="res-input" type="date" value="${escapeHtml(state.checkOut)}" /></div>
    </div>
    <div class="res-row">
      <div><label class="res-label">Total guests</label><input id="gw-total-guests" class="res-input" type="number" min="1" max="100" value="${state.totalGuests}" /></div>
      <div><label class="res-label">Rooms needed (estimate)</label><input id="gw-rooms-req" class="res-input" type="number" min="1" max="30" value="${state.roomsRequested || ''}" placeholder="Optional" /></div>
    </div>
    ${banner}`;
}

function getFilteredRooms() {
  const q = state.roomSearch.trim().toLowerCase();
  return state.availableRooms
    .filter((r) => r.availability_status === 'available')
    .filter((r) => {
      if (!q) return true;
      return [r.room_number, r.room_type].join(' ').toLowerCase().includes(q);
    })
    .sort((a, b) => String(a.room_number).localeCompare(String(b.room_number), undefined, { numeric: true }));
}

function renderSelectedSummary() {
  const assigned = assignedGuestTotal(state.selectedRooms);
  const remaining = state.totalGuests - assigned;
  const ok = assigned === state.totalGuests;
  const chips = state.selectedRooms.map((sel) => {
    const room = state.availableRooms.find((r) => String(r.id) === String(sel.room_id));
    if (!room) return '';
    return `<span class="res-selected-chip">
      Room ${escapeHtml(room.room_number)} · ${sel.guest_count} guest(s)
      <button type="button" class="res-chip-remove" data-remove-room="${room.id}" aria-label="Remove">×</button>
    </span>`;
  }).join('');

  return `
    <div class="res-selected-panel ${ok ? 'res-selected-panel--ok' : 'res-selected-panel--warn'}">
      <div class="res-selected-panel-head">
        <strong>${state.selectedRooms.length} room(s) selected</strong>
        <span>Guests assigned: <strong>${assigned}</strong> of <strong>${state.totalGuests}</strong>
        ${!ok && remaining > 0 ? ` · <em>${remaining} more needed</em>` : ''}
        ${!ok && remaining < 0 ? ` · <em>${Math.abs(remaining)} too many</em>` : ''}
        </span>
      </div>
      ${chips ? `<div class="res-selected-chips">${chips}</div>` : '<p class="res-hint">No rooms selected yet. Tap a room below or use Auto-pick.</p>'}
    </div>`;
}

function renderGroupRoomRow(room) {
  const sel = state.selectedRooms.find((r) => String(r.room_id) === String(room.id));
  const guests = sel?.guest_count ?? room.capacity_min;
  const selected = Boolean(sel);

  return `
    <div class="res-room-row${selected ? ' is-selected' : ''}">
      <div class="res-room-row-main">
        <div class="res-room-row-id">
          <span class="material-symbols-outlined res-room-icon">meeting_room</span>
          <div>
            <strong class="res-room-row-num">Room ${escapeHtml(room.room_number)}</strong>
            <span class="res-room-meta">${escapeHtml(room.room_type_label || room.room_type)}</span>
          </div>
        </div>
        <div class="res-room-row-cap">Fits ${room.capacity_min}–${room.capacity_max} guests</div>
        ${room.estimated_total != null ? `<div class="res-room-row-price">${formatMoney(room.estimated_total)}</div>` : ''}
        <button type="button" class="res-btn ${selected ? 'res-btn--ghost' : 'res-btn--primary'} res-btn-sm" data-room-toggle="${room.id}">
          ${selected ? 'Remove' : 'Add Room'}
        </button>
      </div>
      ${selected ? `
        <div class="res-room-row-guests">
          <span class="res-label">Guests in this room:</span>
          <div class="res-qty">
            <button type="button" data-room-guest-minus="${room.id}" aria-label="Fewer guests">−</button>
            <span>${guests}</span>
            <button type="button" data-room-guest-plus="${room.id}" aria-label="More guests">+</button>
          </div>
        </div>` : ''}
    </div>`;
}

function renderStep3() {
  const eligible = getFilteredRooms();

  return `
    <p class="res-lead">Tap <strong>Add Room</strong> for each room you need. Use the +/− buttons to set guests per room.</p>
    ${renderSelectedSummary()}
    <div class="res-group-toolbar">
      <button type="button" id="gw-use-suggested" class="res-btn res-btn--primary" ${state.suggestion ? '' : 'disabled'}>
        <span class="material-symbols-outlined">auto_awesome</span> Auto-pick rooms
      </button>
      <input id="gw-room-search" type="search" class="res-input" placeholder="Search room number or type…" value="${escapeHtml(state.roomSearch)}" />
    </div>
    ${state.loadingRooms ? '<p class="res-hint">Loading rooms…</p>' : ''}
    <div class="res-room-list">
      ${eligible.length ? eligible.map(renderGroupRoomRow).join('')
        : '<div class="res-empty-box"><p>No rooms match your search. Try clearing filters or go back to change dates.</p></div>'}
    </div>`;
}

function renderMealRow(type, qty) {
  return renderAdminMealRow(type, qty, state.mealRates[type], { idPrefix: 'gw' });
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
    customNameInputId: 'gw-fee-name',
    customAmtInputId: 'gw-fee-amt',
    customAddBtnId: 'gw-add-fee',
  });
  return `
    <p class="res-lead">Meals and fees apply to the whole group.</p>
    <div class="res-meals-box">
      ${renderMealRow('Breakfast', state.meals.Breakfast)}
      ${renderMealRow('Lunch', state.meals.Lunch)}
      ${renderMealRow('Dinner', state.meals.Dinner)}
      ${renderMealRow('Snack', state.meals.Snack)}
      <p class="res-meal-total">Meals subtotal: <strong data-meals-total>${formatMoney(calcMealsSubtotal(state.meals, state.mealRates))}</strong></p>
    </div>
    <label class="res-label" for="gw-meal-allergens">Meal allergens &amp; dietary notes (optional)</label>
    <textarea id="gw-meal-allergens" class="res-input" rows="2" placeholder="e.g. nut allergy, gluten-free, vegetarian…">${escapeHtml(state.mealAllergenNotes || '')}</textarea>
    <h3 class="res-subhead">Additional fees (optional)</h3>
    <p class="res-hint">${state.guestModify
    ? 'Choose a category, then add catalog fees. Custom charges must be arranged with housing.'
    : 'Choose a category to browse options, or add a custom fee below.'}</p>
    ${feePickerBlock}`;
}

function renderStep5() {
  const roomLines = state.selectedRooms.map((sel) => {
    const room = state.availableRooms.find((r) => String(r.id) === String(sel.room_id));
    return room ? `Room ${escapeHtml(room.room_number)} (${sel.guest_count} guest(s))` : '';
  }).filter(Boolean).join('<br>');
  const grand = calcGroupGrandTotal(state);
  const modifyBlock = state.guestModify
    ? (state.guestWasApproved ? `
    <div class="res-banner res-banner--warn">This group reservation was already approved. Submitting changes sends it back to housing for review.</div>
    <label class="res-label" for="gw-guest-message">Message to housing (required)</label>
    <textarea id="gw-guest-message" class="res-input" rows="3" placeholder="e.g. Two more guests are joining — we need an extra room if possible.">${escapeHtml(state.guestMessage)}</textarea>
  ` : `<div class="res-banner res-banner--ok">You can update your pending group request. Housing will review any changes.</div>`)
    : state.modifyRequest ? `
    <div class="res-banner res-banner--warn">You are approving this group request with changes. The guest will receive an email with your message.</div>
    <label class="res-label" for="gw-guest-message">Message to guest (required)</label>
    <textarea id="gw-guest-message" class="res-input" rows="3" placeholder="e.g. We could not assign all requested rooms, so we placed your group in nearby rooms instead.">${escapeHtml(state.guestMessage)}</textarea>
  ` : (state.fromRequestId ? `<div class="res-banner res-banner--ok">The contact person will receive a confirmation email when you save.</div>` : '');

  return `
    <p class="res-lead">Review the group reservation before saving.</p>
    ${modifyBlock}
    <div class="res-review"><h4>Group</h4>${state.guestModify
    ? renderGroupContactCard({ compact: true })
    : `<p><strong>${escapeHtml(state.groupName)}</strong><br>${escapeHtml(state.contactName)} · ${escapeHtml(state.contactPhone || '—')}</p>`}</div>
    <div class="res-review"><h4>Stay</h4><p>${formatDateLong(state.checkIn)} to ${formatDateLong(state.checkOut)} · ${state.totalGuests} guest(s) · ${state.selectedRooms.length} room(s)</p></div>
    <div class="res-review"><h4>Rooms</h4><p>${roomLines || '—'}</p></div>
    <label class="res-label">Notes (optional)</label>
    <textarea id="gw-notes" class="res-input" rows="2">${escapeHtml(state.notes)}</textarea>
    <p class="res-grand-total">Estimated grand total: ${formatMoney(grand)}</p>`;
}

function renderBody() {
  const mount = $('group-wizard-body');
  if (!mount) return;
  const fns = { 1: renderStep1, 2: renderStep2, 3: renderStep3, 4: renderStep4, 5: renderStep5 };
  mount.classList.remove('res-wizard-body--enter');
  mount.innerHTML = fns[state.step]?.() || '';
  requestAnimationFrame(() => mount.classList.add('res-wizard-body--enter'));

  $('group-wizard-title').textContent = state.guestModify
    ? 'Modify Group Reservation'
    : state.mode === 'edit'
      ? 'Edit Group Reservation'
      : state.modifyRequest
        ? 'Modify & Approve Group Request'
        : state.fromRequestId
          ? 'Approve Group Request'
          : 'Create Group Reservation';
  $('group-wizard-subtitle').textContent = GROUP_WIZARD_STEPS[state.step - 1]?.short || '';
  setBtnVisible($('group-wizard-back'), state.step > 1);
  setBtnVisible($('group-wizard-next'), state.step < 5);
  setBtnVisible($('group-wizard-confirm'), state.step >= 5);
  $('group-wizard-next').disabled = state.saving;
  $('group-wizard-confirm').disabled = state.saving;
  $('group-wizard-confirm').textContent = state.saving
    ? 'Saving…'
    : (state.guestModify ? 'Submit changes' : 'Save group');
  $('group-wizard-next').textContent = state.saving ? 'Please wait…' : 'Next step';

  const err = $('group-wizard-error');
  if (state.error) { err.textContent = state.error; err.classList.remove('hidden'); }
  else err?.classList.add('hidden');

  bindEvents();
  if (state.step === 2) {
    applyBookingDateBounds($('gw-check-in'), $('gw-check-out'), fiscalBounds);
  }
}

/** Read every step's fields from state + any visible DOM inputs. */
function readAllFields() {
  state.groupName = $('gw-group-name')?.value?.trim() || state.groupName;
  state.contactName = $('gw-contact')?.value?.trim() || state.contactName;
  state.contactPhone = $('gw-phone')?.value?.trim() || state.contactPhone;
  state.email = $('gw-email')?.value?.trim() || state.email;
  state.userId = $('gw-user')?.value ?? state.userId;
  state.checkIn = $('gw-check-in')?.value || state.checkIn;
  state.checkOut = $('gw-check-out')?.value || state.checkOut;
  if ($('gw-total-guests')) {
    state.totalGuests = Math.max(1, Number($('gw-total-guests').value) || state.totalGuests);
  }
  const rr = $('gw-rooms-req')?.value;
  if ($('gw-rooms-req')) state.roomsRequested = rr ? Math.max(1, Number(rr)) : null;
  state.notes = $('gw-notes')?.value?.trim() ?? state.notes;
  state.guestMessage = $('gw-guest-message')?.value?.trim() ?? state.guestMessage;
  if ($('gw-meal-allergens')) state.mealAllergenNotes = $('gw-meal-allergens').value?.trim() || '';
  if ($('gw-room-search')) state.roomSearch = $('gw-room-search').value;
  const mealRoot = $('group-wizard-body');
  if (mealRoot?.querySelector('[data-meal-qty]')) {
    state.meals = readMealsFromInputs(mealRoot, state.meals);
  }
}

function readStepFields() {
  if (state.step === 1) {
    state.groupName = $('gw-group-name')?.value?.trim() || '';
    state.contactName = $('gw-contact')?.value?.trim() || '';
    state.contactPhone = $('gw-phone')?.value?.trim() || '';
    state.email = $('gw-email')?.value?.trim() || '';
    state.userId = $('gw-user')?.value || '';
  }
  if (state.step === 2) {
    state.checkIn = $('gw-check-in')?.value || '';
    state.checkOut = $('gw-check-out')?.value || '';
    state.totalGuests = Math.max(1, Number($('gw-total-guests')?.value) || 1);
    const rr = $('gw-rooms-req')?.value;
    state.roomsRequested = rr ? Math.max(1, Number(rr)) : null;
  }
  if (state.step === 5) {
    state.notes = $('gw-notes')?.value?.trim() || '';
    state.guestMessage = $('gw-guest-message')?.value?.trim() || state.guestMessage;
  }
}

async function fetchRooms() {
  readAllFields();
  if (!state.checkIn || !state.checkOut || state.checkOut <= state.checkIn) return;
  state.loadingRooms = true;
  state.error = null;
  renderBody();
  try {
    const data = await suggestGroupRooms({
      check_in: state.checkIn,
      check_out: state.checkOut,
      total_guests: state.totalGuests,
      exclude_group_id: state.groupId || state.fromRequestId || undefined,
    });
    state.availableRooms = data.rooms || [];
    state.availableCount = data.available_count ?? 0;
    state.suggestion = data.suggestion || null;
    state.selectedRooms = state.selectedRooms.filter((sel) => {
      const room = state.availableRooms.find((r) => String(r.id) === String(sel.room_id));
      return room?.availability_status === 'available';
    });
  } catch (err) {
    state.error = err.message;
  } finally {
    state.loadingRooms = false;
    renderSteps();
    renderBody();
  }
}

function toggleRoom(roomId) {
  const room = state.availableRooms.find((r) => String(r.id) === String(roomId));
  if (!room || room.availability_status !== 'available') return;
  const idx = state.selectedRooms.findIndex((r) => String(r.room_id) === String(roomId));
  if (idx >= 0) {
    state.selectedRooms.splice(idx, 1);
  } else {
    state.selectedRooms.push({ room_id: Number(roomId), guest_count: room.capacity_min });
  }
  state.error = null;
  renderBody();
}

function adjustRoomGuests(roomId, delta) {
  const room = state.availableRooms.find((r) => String(r.id) === String(roomId));
  const sel = state.selectedRooms.find((r) => String(r.room_id) === String(roomId));
  if (!sel || !room) return;
  sel.guest_count = Math.min(room.capacity_max, Math.max(room.capacity_min, sel.guest_count + delta));
  renderBody();
}

function applySuggestion() {
  if (!state.suggestion?.length) return;
  state.selectedRooms = state.suggestion.map((s) => ({
    room_id: s.room_id,
    guest_count: s.guest_count,
  }));
  state.error = null;
  renderBody();
}

function bindEvents() {
  $('gw-user')?.addEventListener('change', (e) => {
    const opt = e.target.selectedOptions[0];
    if (!opt?.value) return;
    state.userId = opt.value;
    state.contactName = opt.dataset.name || state.contactName;
    state.email = opt.dataset.email || state.email;
    renderBody();
  });

  const onStayChange = () => { readStepFields(); state.selectedRooms = []; fetchRooms(); };
  const debouncedStay = debounce(onStayChange, 400);
  $('gw-check-in')?.addEventListener('change', onStayChange);
  $('gw-check-out')?.addEventListener('change', onStayChange);
  $('gw-total-guests')?.addEventListener('change', onStayChange);
  $('gw-total-guests')?.addEventListener('input', debouncedStay);

  $('gw-use-suggested')?.addEventListener('click', applySuggestion);

  const debouncedSearch = debounce(() => {
    state.roomSearch = $('gw-room-search')?.value || '';
    renderBody();
  }, 200);
  $('gw-room-search')?.addEventListener('input', debouncedSearch);

  $('group-wizard-body')?.querySelectorAll('[data-room-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => toggleRoom(btn.getAttribute('data-room-toggle')));
  });
  $('group-wizard-body')?.querySelectorAll('[data-remove-room]').forEach((btn) => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); toggleRoom(btn.getAttribute('data-remove-room')); });
  });
  $('group-wizard-body')?.querySelectorAll('[data-room-guest-plus]').forEach((btn) => {
    btn.addEventListener('click', () => adjustRoomGuests(btn.getAttribute('data-room-guest-plus'), 1));
  });
  $('group-wizard-body')?.querySelectorAll('[data-room-guest-minus]').forEach((btn) => {
    btn.addEventListener('click', () => adjustRoomGuests(btn.getAttribute('data-room-guest-minus'), -1));
  });

  const bodyEl = $('group-wizard-body');
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
    $('group-wizard-body')?.addEventListener('click', (e) => {
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

  $('gw-add-fee')?.addEventListener('click', () => {
    if (state.guestModify) return;
    const name = $('gw-fee-name')?.value?.trim();
    const amount = Number($('gw-fee-amt')?.value);
    if (!name || !amount) { state.error = 'Enter a fee name and amount.'; renderBody(); return; }
    state.fees.push({ fee_name: name, amount });
    renderBody();
  });
}

function validate() {
  readStepFields();
  state.error = null;
  if (state.step === 1 && !state.guestModify) {
    if (!state.groupName) { state.error = 'Please enter the group name.'; return false; }
    if (!state.contactName) { state.error = 'Please enter a contact person.'; return false; }
  }
  if (state.step === 2) {
    if (!state.checkIn || !state.checkOut) { state.error = 'Please select dates.'; return false; }
    if (state.checkOut <= state.checkIn) { state.error = 'Check-out must be after check-in.'; return false; }
  }
  if (state.step === 3) {
    if (!state.selectedRooms.length) { state.error = 'Please add at least one room.'; return false; }
    const assigned = assignedGuestTotal(state.selectedRooms);
    if (assigned !== state.totalGuests) {
      state.error = `Guest counts must add up to ${state.totalGuests} (currently ${assigned}). Adjust the +/− buttons on each room.`;
      return false;
    }
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
  readStepFields();
  if (state.step > 1) state.step--;
  state.error = null;
  renderSteps();
  renderBody();
}

async function confirmSave() {
  readAllFields();
  state.error = null;
  if (!state.groupName) { state.error = 'Please enter the group name.'; renderBody(); return; }
  if (!state.contactName) { state.error = 'Please enter a contact person.'; renderBody(); return; }
  if (!state.checkIn || !state.checkOut) { state.error = 'Please set check-in and check-out dates.'; renderBody(); return; }
  if (!state.selectedRooms.length) { state.error = 'Please add at least one room.'; renderBody(); return; }
  const assigned = assignedGuestTotal(state.selectedRooms);
  if (assigned !== state.totalGuests) {
    state.error = `Guest counts must add up to ${state.totalGuests} (currently ${assigned}).`;
    renderBody();
    return;
  }
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
  state.saving = true;
  renderBody();

  let modLine = '';
  if (!state.guestModify && state.modifyRequest && state.guestMessage?.trim()) {
    modLine = `[Modified by admin] ${state.guestMessage.trim()}`;
  }
  const combinedNotes = state.guestModify
    ? (state.notes || undefined)
    : [state.notes, modLine].filter(Boolean).join('\n') || undefined;

  const payload = {
    group_name: state.groupName,
    contact_name: state.contactName,
    contact_phone: state.contactPhone || undefined,
    contact_email: state.email || undefined,
    user_id: state.guestModify ? undefined : (state.userId ? Number(state.userId) : undefined),
    check_in: state.checkIn,
    check_out: state.checkOut,
    total_guests: state.totalGuests,
    rooms_requested: state.roomsRequested || undefined,
    notes: combinedNotes,
    status: state.guestModify ? 'Pending' : 'Approved',
    rooms: state.selectedRooms,
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
    if (state.groupId) {
      await updateGroup(state.groupId, payload);
    } else if (state.fromRequestId) {
      await updateGroup(state.fromRequestId, payload);
    } else {
      await createGroup(payload);
    }
    window.dispatchEvent(new CustomEvent('booking:updated'));
    closeGroupWizard();
  } catch (err) {
    state.error = err.message || 'Could not save group reservation.';
    state.saving = false;
    renderBody();
  }
}

function showModal() {
  $('group-wizard-overlay')?.classList.remove('hidden');
  $('group-wizard-modal')?.classList.remove('hidden');
  document.body.classList.add('guest-wizard-open');
  document.body.style.overflow = 'hidden';
}

function hideModal() {
  $('group-wizard-overlay')?.classList.add('hidden');
  $('group-wizard-modal')?.classList.add('hidden');
  document.body.classList.remove('guest-wizard-open');
  const roomOpen = !$('reservation-wizard-modal')?.classList.contains('hidden');
  if (!roomOpen) document.body.style.overflow = '';
}

export function isGroupWizardOpen() { return isOpen; }

export async function openGroupWizard(options = {}) {
  const {
    mode = 'create',
    groupId = null,
    fromRequestId = null,
    modifyRequest = false,
    guestModify = false,
    guestWasApproved = false,
    prefill = null,
  } = options;

  try {
  state = emptyGroupWizardState();
  state.mode = mode;
  state.fromRequestId = fromRequestId;
  state.modifyRequest = modifyRequest;
  state.guestModify = guestModify;
  state.guestWasApproved = guestWasApproved;
  state.groupId = groupId;

  try {
    const loaders = [
      guestModify ? getUsers().catch(() => []) : getUsers(),
      getMealRates(),
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

  if (groupId) {
    const group = await getGroupById(groupId);
    state.groupId = group.id;
    state.groupName = group.group_name || '';
    state.contactName = group.contact_name || '';
    state.contactPhone = group.contact_phone || '';
    state.email = group.contact_email || group.requester_email || '';
    state.userId = group.user_id;
    state.checkIn = String(group.check_in).slice(0, 10);
    state.checkOut = String(group.check_out).slice(0, 10);
    state.totalGuests = group.total_guests || 1;
    state.roomsRequested = group.rooms_requested;
    state.notes = group.notes || '';
    state.meals = mealsFromBooking(group.meals || []);
    state.mealAllergenNotes = group.meal_allergen_notes || '';
    state.fees = (group.fees || []).map((f) => ({ fee_name: f.fee_name, amount: f.amount }));
    state.originalFees = state.fees.map((f) => ({ ...f }));
    state.selectedRooms = (group.bookings || []).map((b) => ({
      room_id: b.room_id,
      guest_count: b.guest_count,
    }));
    if (guestModify) applyLoggedInGroupContact(state);
  }

  if (prefill) {
    Object.assign(state, {
      groupName: prefill.groupName || prefill.group_name || state.groupName,
      contactName: prefill.contactName || prefill.contact_name || state.contactName,
      contactPhone: prefill.contactPhone || prefill.contact_phone || state.contactPhone,
      email: prefill.email || prefill.contact_email || state.email,
      checkIn: prefill.checkIn || prefill.check_in || state.checkIn,
      checkOut: prefill.checkOut || prefill.check_out || state.checkOut,
      totalGuests: prefill.totalGuests || prefill.total_guests || state.totalGuests,
      roomsRequested: prefill.roomsRequested || prefill.rooms_requested || state.roomsRequested,
      notes: prefill.notes || state.notes,
      userId: prefill.userId || prefill.user_id || state.userId,
    });
    if (prefill.meals) {
      state.meals = Array.isArray(prefill.meals) ? mealsFromBooking(prefill.meals) : { ...state.meals, ...prefill.meals };
    }
    if (prefill.mealAllergenNotes != null) state.mealAllergenNotes = prefill.mealAllergenNotes;
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
    console.error('[group-wizard]', err);
    state = emptyGroupWizardState();
    state.error = err.message || 'Could not open this group reservation. Please try again.';
    isOpen = true;
    showModal();
    renderSteps();
    renderBody();
  }
}

export function closeGroupWizard() {
  isOpen = false;
  hideModal();
  state = emptyGroupWizardState();
}

export function initGroupWizard() {
  if (initialized) return;
  initialized = true;
  $('group-wizard-close')?.addEventListener('click', closeGroupWizard);
  $('group-wizard-overlay')?.addEventListener('click', closeGroupWizard);
  $('group-wizard-back')?.addEventListener('click', goBack);
  $('group-wizard-next')?.addEventListener('click', goNext);
  $('group-wizard-confirm')?.addEventListener('click', confirmSave);
  window.addEventListener('group-wizard:open', (e) => openGroupWizard(e.detail || {}));

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !isOpen) return;
    closeGroupWizard();
  });
}
