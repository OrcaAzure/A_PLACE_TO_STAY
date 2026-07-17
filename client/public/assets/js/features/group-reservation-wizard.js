/**
 * Multi-room group reservation wizard — admin create/edit/approve + guest flow support.
 */

import {
  createGroup, updateGroup, getGroupById, getMealRates, getUsers, suggestGroupRooms, getFacilitiesOverview,
} from '/assets/js/services/api.js';
import {
  GROUP_WIZARD_STEPS, escapeHtml, formatDateLong, formatMoney,
  emptyGroupWizardState, mealsFromBooking, calcGroupGrandTotal,
  assignedGuestTotal, debounce, servicesToQuickFees, applyLoggedInGroupContact, sanitizeGuestModifyFees,
  filterRoomsList, collectWizardRoomTypes,
  loadFiscalYearBounds, applyBookingDateBounds, formatBookingWindowHint,
  readMealsFromInputs, clampMealQty, mealTypesOrdered, ensureMealsShape, isValidEmail,
  guestModifyMinStep, renderGuestModifyProgress, renderGuestModifyReviewSummary, renderGuestModifyReviewCallout,
} from '/assets/js/features/reservation-shared.js';
import {
  renderWizardMealGrid,
  renderGuestModifyMealList,
  syncWizardMealCards,
  renderWizardGroupRoomCard,
  renderGuestModifyGroupRoomRow,
  renderWizardRoomTypeFilter,
  bindWizardRoomTypeFilter,
  closeAllWizardRoomTypePanels,
  renderWizardConfirmCard,
  renderWizardPriceSummary,
} from '/assets/js/features/wizard-visuals.js';
import { buildFeeGroups, getGuestSelfBookFeeCatalog, renderWizardFeePicker, handleWizardFeePickerClick } from '/assets/js/features/booking-fee-picker.js';

let initialized = false;
let isOpen = false;
let state = emptyGroupWizardState();
let users = [];
let fiscalBounds = null;
let feeGroups = [];
let quickFees = [];
let feePickerClickBound = false;
let mealDelegationBound = false;

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

function applyGuestModifyChrome() {
  const modal = $('group-wizard-modal')?.querySelector('.res-modal');
  const headerWrap = modal?.querySelector('.res-modal-header > div:first-child');
  const subtitle = $('group-wizard-subtitle');
  if (!state.guestModify) {
    subtitle?.classList.remove('hidden');
    headerWrap?.querySelector('.guest-modify-status')?.remove();
    return;
  }
  $('group-wizard-title').textContent = 'Modify group stay';
  if (subtitle) {
    subtitle.textContent = '';
    subtitle.classList.add('hidden');
  }
  let status = headerWrap?.querySelector('.guest-modify-status');
  if (!status) {
    status = document.createElement('span');
    $('group-wizard-title')?.insertAdjacentElement('afterend', status);
  }
  if (status) {
    status.textContent = state.guestWasApproved ? 'Approved' : 'Pending';
    status.className = `guest-modify-status guest-modify-status--${state.guestWasApproved ? 'approved' : 'pending'}`;
  }
}

function renderSteps() {
  const el = $('group-wizard-steps');
  if (!el) return;
  const modal = $('group-wizard-modal')?.querySelector('.res-modal');
  if (state.guestModify) {
    modal?.classList.add('res-modal--guest-modify');
    el.className = 'res-steps res-steps--guest-modify';
    el.innerHTML = renderGuestModifyProgress(state.step, { group: true });
    applyGuestModifyChrome();
    return;
  }
  modal?.classList.remove('res-modal--guest-modify');
  el.className = 'res-steps';
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

function applyGroupRecordToState(group) {
  if (!group) return;
  state.groupId = group.id;
  state.groupName = group.group_name || '';
  state.contactName = group.contact_name || '';
  state.contactPhone = group.contact_phone || '';
  state.email = group.contact_email || group.requester_email || '';
  state.userId = group.user_id;
  state.checkIn = String(group.check_in || '').slice(0, 10);
  state.checkOut = String(group.check_out || '').slice(0, 10);
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
    <label class="res-label" for="gw-contact">Contact person</label>
    <input id="gw-contact" class="res-input" type="text" value="${escapeHtml(state.contactName)}" placeholder="Full name" />
    <label class="res-label" for="gw-email">Email <span class="res-label-required">(required)</span></label>
    <input id="gw-email" class="res-input" type="email" value="${escapeHtml(state.email)}" placeholder="email@example.com" autocomplete="email" required />
    <label class="res-label" for="gw-phone">Contact number <span class="res-label-optional">(optional)</span></label>
    <input id="gw-phone" class="res-input" type="tel" value="${escapeHtml(state.contactPhone)}" placeholder="09XX XXX XXXX" autocomplete="tel" />`;
}

function renderStep2() {
  const showAvailBanner = state.guestModify
    ? (state.checkIn && state.checkOut && state.checkOut > state.checkIn && !state.loadingRooms && state.availableCount === 0)
    : (state.checkIn && state.checkOut && state.checkOut > state.checkIn);
  const banner = showAvailBanner ? `
    <div class="res-banner ${state.guestModify || state.availableCount > 0 ? 'res-banner--ok' : 'res-banner--warn'}">
      ${state.loadingRooms ? 'Checking available rooms…'
    : state.availableCount > 0
      ? (state.guestModify ? '' : state.suggestion
        ? `Good news: <strong>${state.suggestion.length} room(s)</strong> can fit all <strong>${state.totalGuests} guests</strong>. On the next step, click the big blue <strong>"Auto-pick rooms"</strong> button.`
        : `<strong>${state.availableCount} room(s)</strong> are free on these dates. You will choose rooms on the next step.`)
      : `<strong>No rooms available</strong> on these dates.`}
    </div>` : '';
  if (state.guestModify) {
    return `
      <div class="guest-modify-panel">
        <div class="res-row">
          <div><label class="res-label">Check-in</label><input id="gw-check-in" class="res-input" type="date" value="${escapeHtml(state.checkIn)}" /></div>
          <div><label class="res-label">Check-out</label><input id="gw-check-out" class="res-input" type="date" value="${escapeHtml(state.checkOut)}" /></div>
        </div>
        <label class="res-label">Total guests</label>
        <input id="gw-total-guests" class="res-input res-input--short" type="number" min="1" max="500" value="${state.totalGuests}" inputmode="numeric" />
        ${banner}
      </div>`;
  }
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
      <div><label class="res-label">Total guests</label><input id="gw-total-guests" class="res-input" type="number" min="1" max="500" value="${state.totalGuests}" inputmode="numeric" /></div>
      <div><label class="res-label">Rooms needed (estimate)</label><input id="gw-rooms-req" class="res-input" type="number" min="1" max="30" value="${state.roomsRequested || ''}" placeholder="Optional" /></div>
    </div>
    ${banner}`;
}

function getFilteredRooms() {
  return filterRoomsList(state.availableRooms, {
    search: state.roomSearch,
    roomType: state.roomTypeFilter,
    includeStatuses: ['available'],
  }).sort((a, b) => String(a.room_number).localeCompare(String(b.room_number), undefined, { numeric: true }));
}

function renderGroupRoomFilters() {
  const types = collectWizardRoomTypes(state.availableRooms);
  const filterHtml = types.length
    ? renderWizardRoomTypeFilter(types, state.roomTypeFilter, { idPrefix: 'gw' })
    : `<p class="res-hint wiz-room-type-hint">Room types appear after availability loads.</p>`;
  const autoPickRow = state.guestModify ? '' : `
      <div class="wiz-group-auto-pick-row">
        <button type="button" id="gw-use-suggested" class="res-btn res-btn--primary" ${state.suggestion ? '' : 'disabled'}>
          <span class="material-symbols-outlined">auto_awesome</span> Auto-pick rooms
        </button>
      </div>`;
  return `
    <div class="wiz-room-filters wiz-room-filters--group">
      ${autoPickRow}
      <div class="wiz-room-toolbar">
        <input id="gw-room-search" type="search" class="res-input" placeholder="Search room number or type…" value="${escapeHtml(state.roomSearch)}" />
        ${filterHtml}
      </div>
    </div>`;
}

function renderSelectedSummary() {
  const assigned = assignedGuestTotal(state.selectedRooms);
  const remaining = state.totalGuests - assigned;
  const ok = assigned === state.totalGuests;
  if (state.guestModify) {
    return `
      <div class="guest-modify-assignment ${ok ? 'is-ok' : ''}">
        <span>${state.selectedRooms.length} room${state.selectedRooms.length === 1 ? '' : 's'}</span>
        <span>${assigned} / ${state.totalGuests} guests${!ok && remaining > 0 ? ` · ${remaining} more needed` : ''}</span>
      </div>`;
  }
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
      ${chips ? `<div class="res-selected-chips">${chips}</div>` : `<p class="res-hint">${state.guestModify ? 'No rooms selected yet. Tap an available room below to add it.' : 'No rooms selected yet. Tap a room below or use Auto-pick.'}</p>`}
    </div>`;
}

function renderGroupRoomRow(room) {
  const sel = state.selectedRooms.find((r) => String(r.room_id) === String(room.id));
  if (state.guestModify) {
    return renderGuestModifyGroupRoomRow(room, {
      selected: Boolean(sel),
      guestCount: sel?.guest_count ?? room.capacity_min,
    });
  }
  return renderWizardGroupRoomCard(room, {
    selected: Boolean(sel),
    guestCount: sel?.guest_count ?? room.capacity_min,
  });
}

function renderStep3() {
  const eligible = getFilteredRooms();
  const modifyBanner = state.modifyRequest && !state.guestModify
    ? `<div class="res-banner res-banner--warn">Review or change room assignments below, then continue to meals and confirm.</div>`
    : '';

  if (state.guestModify) {
    return `
      ${modifyBanner}
      ${renderSelectedSummary()}
      ${state.loadingRooms ? '<p class="res-hint">Loading rooms…</p>' : ''}
      <input id="gw-room-search" type="search" class="res-input guest-modify-search" placeholder="Search rooms…" value="${escapeHtml(state.roomSearch)}" />
      <div class="guest-modify-group-rooms">
        ${eligible.length ? eligible.map(renderGroupRoomRow).join('')
          : '<div class="res-empty-box"><p>No rooms available. Try different dates.</p></div>'}
      </div>`;
  }

  return `
    ${modifyBanner}
    <p class="res-lead">Tap <strong>Add room</strong> for each room you need. Use the +/− buttons to set guests per room.</p>
    ${renderSelectedSummary()}
    ${renderGroupRoomFilters()}
    ${state.loadingRooms ? '<p class="res-hint">Loading rooms…</p>' : ''}
    <div class="wiz-group-room-list">
      ${eligible.length ? eligible.map(renderGroupRoomRow).join('')
        : '<div class="res-empty-box"><p>No rooms match your search. Try clearing filters or go back to change dates.</p></div>'}
    </div>`;
}

function bindMealDelegation() {
  if (mealDelegationBound) return;
  const root = $('group-wizard-body');
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
    customNameInputId: 'gw-fee-name',
    customAmtInputId: 'gw-fee-amt',
    customAddBtnId: 'gw-add-fee',
  });
  if (state.guestModify) {
    return `
      <div class="guest-modify-extras">
        <section class="guest-modify-extras__section">
          <h3 class="guest-modify-section-title">Meals</h3>
          ${renderGuestModifyMealList(state.meals, state.mealRates)}
        </section>
        <section class="guest-modify-extras__section">
          <label class="guest-modify-field-label" for="gw-meal-allergens">Dietary notes <span class="guest-modify-optional">optional</span></label>
          <textarea id="gw-meal-allergens" class="res-input guest-modify-textarea" rows="2" placeholder="Allergies or dietary needs…">${escapeHtml(state.mealAllergenNotes || '')}</textarea>
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
    <p class="res-lead">Meals and fees apply to the whole group.</p>
    <div class="wiz-extras-block">
      <p class="guest-extras-block__label">Meals</p>
      ${renderWizardMealGrid(state.meals, state.mealRates, { idPrefix: 'gw' })}
    </div>
    <label class="res-label" for="gw-meal-allergens">Meal allergens &amp; dietary notes (optional)</label>
    <textarea id="gw-meal-allergens" class="res-input" rows="2" placeholder="e.g. nut allergy, gluten-free, vegetarian…">${escapeHtml(state.mealAllergenNotes || '')}</textarea>
    <div class="wiz-extras-block">
      <p class="guest-extras-block__label">Additional fees (optional)</p>
      <p class="res-hint">Choose a category to browse options, or add a custom fee below.</p>
      ${feePickerBlock}
    </div>`;
}

function renderStep5() {
  const roomLines = state.selectedRooms.map((sel) => {
    const room = state.availableRooms.find((r) => String(r.id) === String(sel.room_id));
    return room ? `Room ${escapeHtml(room.room_number)} · ${sel.guest_count} guest(s)` : '';
  }).filter(Boolean).join('<br>');
  const grand = calcGroupGrandTotal(state);
  const roomTotal = state.selectedRooms.reduce((sum, sel) => {
    const room = state.availableRooms.find((r) => String(r.id) === String(sel.room_id));
    if (!room) return sum;
    const guests = sel.guest_count || 1;
    const est = room.estimated_total || 0;
    const refGuests = Math.max(room.capacity_min, Math.min(guests, room.capacity_max));
    return sum + (est / (refGuests || 1)) * guests;
  }, 0);
  const summaryLines = [{ label: 'Rooms', value: roomTotal }];
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
      group: true,
      textareaId: 'gw-guest-message',
      message: state.guestMessage,
    })
    : state.modifyRequest ? `
    <div class="res-banner res-banner--warn">You are approving this group request with changes. The guest will receive an email with your message.</div>
    <label class="res-label" for="gw-guest-message">Message to guest (required)</label>
    <textarea id="gw-guest-message" class="res-input" rows="3" placeholder="e.g. We could not assign all requested rooms, so we placed your group in nearby rooms instead.">${escapeHtml(state.guestMessage)}</textarea>
  ` : (state.fromRequestId ? `<div class="res-banner res-banner--ok">The contact person will receive a confirmation email when you save.</div>` : '');

  if (state.guestModify) {
    const roomSummary = state.selectedRooms.map((sel) => {
      const room = state.availableRooms.find((r) => String(r.id) === String(sel.room_id));
      return room ? `Room ${room.room_number} (${sel.guest_count} guests)` : '';
    }).filter(Boolean).join(', ');
    const reviewRows = [
      { label: 'Stay', value: `${formatDateLong(state.checkIn)} – ${formatDateLong(state.checkOut)} · ${state.totalGuests} guests` },
      { label: 'Rooms', value: roomSummary || '—' },
    ];
    mealTypesOrdered(state.mealRates).forEach((t) => {
      if (state.meals[t] > 0) {
        reviewRows.push({ label: t, value: state.meals[t] * (Number(state.mealRates[t]) || 0) });
      }
    });
    state.fees.forEach((f) => {
      reviewRows.push({ label: f.fee_name, value: f.amount });
    });
    return `
      ${renderGuestModifyReviewCallout({
      approved: state.guestWasApproved,
      group: true,
      textareaId: 'gw-guest-message',
      message: state.guestMessage,
    })}
      ${renderGuestModifyReviewSummary(reviewRows, { grandLabel: 'Estimated total', grandTotal: grand })}
      <label class="res-label" for="gw-notes">Notes <span class="guest-modify-optional">optional</span></label>
      <textarea id="gw-notes" class="res-input" rows="2" placeholder="Anything else for housing…">${escapeHtml(state.notes)}</textarea>`;
  }

  return `
    <p class="res-lead">Review the group reservation before saving.</p>
    ${modifyBlock}
    <div class="wiz-confirm-grid">
      ${renderWizardConfirmCard('Group', state.guestModify
    ? renderGroupContactCard({ compact: true })
    : `<p><strong>${escapeHtml(state.groupName)}</strong><br>${escapeHtml(state.contactName)}<br>${escapeHtml(state.contactPhone || '—')}<br>${escapeHtml(state.email || '—')}</p>`)}
      ${renderWizardConfirmCard('Stay', `<p>${formatDateLong(state.checkIn)} → ${formatDateLong(state.checkOut)}<br>${state.totalGuests} guest(s) · ${state.selectedRooms.length} room(s)</p>`)}
      ${renderWizardConfirmCard('Rooms', `<p>${roomLines || '—'}</p>`)}
    </div>
    ${renderWizardPriceSummary({
    lines: summaryLines,
    grandLabel: state.guestModify || state.fromRequestId ? 'Estimated grand total' : 'Grand total',
    grandTotal: grand,
  })}
    <label class="res-label">Notes (optional)</label>
    <textarea id="gw-notes" class="res-input" rows="2">${escapeHtml(state.notes)}</textarea>`;
}

function renderBody() {
  const mount = $('group-wizard-body');
  if (!mount) return;
  closeAllWizardRoomTypePanels();
  const fns = { 1: renderStep1, 2: renderStep2, 3: renderStep3, 4: renderStep4, 5: renderStep5 };
  mount.classList.remove('res-wizard-body--enter');
  const stepHtml = fns[state.step]?.() || '';
  mount.innerHTML = stepHtml;
  requestAnimationFrame(() => mount.classList.add('res-wizard-body--enter'));

  if (!state.guestModify) {
  $('group-wizard-title').textContent = state.mode === 'edit'
      ? 'Edit Group Reservation'
      : state.modifyRequest
        ? 'Modify & Approve Group Request'
        : state.fromRequestId
          ? 'Approve Group Request'
          : 'Create Group Reservation';
  $('group-wizard-subtitle').textContent = GROUP_WIZARD_STEPS[state.step - 1]?.short || '';
  } else {
    applyGuestModifyChrome();
  }
  setBtnVisible($('group-wizard-back'), state.step > (state.guestModify ? guestModifyMinStep() : 1));
  setBtnVisible($('group-wizard-next'), state.step < 5);
  setBtnVisible($('group-wizard-confirm'), state.step >= 5);
  $('group-wizard-next').disabled = state.saving;
  $('group-wizard-confirm').disabled = state.saving;
  $('group-wizard-confirm').textContent = state.saving
    ? 'Saving…'
    : (state.guestModify
      ? 'Submit'
      : (state.modifyRequest || state.fromRequestId ? 'Save & approve' : 'Save group'));
  $('group-wizard-next').textContent = state.saving ? 'Please wait…' : (state.guestModify ? 'Continue' : 'Next step');

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

let fetchRoomsToken = 0;

async function fetchRooms() {
  readAllFields();
  if (!state.checkIn || !state.checkOut || state.checkOut <= state.checkIn) return;
  const token = ++fetchRoomsToken;
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
    if (token !== fetchRoomsToken) return;
    state.availableRooms = data.rooms || [];
    state.availableCount = data.available_count ?? 0;
    state.suggestion = state.guestModify ? null : (data.suggestion || null);
    state.selectedRooms = state.selectedRooms.filter((sel) => {
      const room = state.availableRooms.find((r) => String(r.id) === String(sel.room_id));
      return room?.availability_status === 'available';
    });
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

  const onStayChange = () => {
    readStepFields();
    if (!state.guestModify) state.selectedRooms = [];
    fetchRooms();
  };
  $('gw-check-in')?.addEventListener('change', onStayChange);
  $('gw-check-out')?.addEventListener('change', onStayChange);
  // Use change (not input) so multi-digit guest counts like 25 are not remounted mid-typing.
  $('gw-total-guests')?.addEventListener('change', onStayChange);

  $('gw-use-suggested')?.addEventListener('click', applySuggestion);

  const debouncedSearch = debounce(() => {
    state.roomSearch = $('gw-room-search')?.value || '';
    renderBody();
  }, 200);
  $('gw-room-search')?.addEventListener('input', debouncedSearch);
  bindWizardRoomTypeFilter($('group-wizard-body'), {
    idPrefix: 'gw',
    onChange: (value) => {
      state.roomTypeFilter = value;
      renderBody();
    },
  });

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

  if (!state.guestModify && state.step === 5) {
  }
}

function showWizardError(message) {
  state.error = message;
  renderBody();
  $('group-wizard-error')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function validate() {
  readStepFields();
  state.error = null;
  if (state.step === 1 && !state.guestModify) {
    if (!state.groupName) { state.error = 'Please enter the group name.'; return false; }
    if (!state.contactName) { state.error = 'Please enter a contact person.'; return false; }
    if (!isValidEmail(state.email)) {
      state.error = 'Please enter a valid email address for the contact person.';
      return false;
    }
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
    const stale = state.selectedRooms.some((sel) => {
      const room = state.availableRooms.find((r) => String(r.id) === String(sel.room_id));
      return !room || room.availability_status !== 'available';
    });
    if (stale) {
      state.error = 'One or more selected rooms are no longer available. Choose different rooms or change your dates.';
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
  if (!validate()) {
    renderBody();
    $('group-wizard-error')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }
  if (state.step === 2) await fetchRooms();
  if (state.step < 5) state.step++;
  renderSteps();
  renderBody();
}

function goBack() {
  readStepFields();
  const minStep = state.guestModify ? guestModifyMinStep() : 1;
  if (state.step > minStep) state.step--;
  state.error = null;
  renderSteps();
  renderBody();
}

async function confirmSave() {
  readAllFields();
  state.error = null;
  if (!state.guestModify && !isValidEmail(state.email)) {
    state.step = 1;
    showWizardError('Please enter a valid email address for the contact person.');
    return;
  }
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
  const staleRooms = state.selectedRooms.some((sel) => {
    const room = state.availableRooms.find((r) => String(r.id) === String(sel.room_id));
    return !room || room.availability_status !== 'available';
  });
  if (staleRooms) {
    state.error = 'One or more selected rooms are no longer available. Please update your room choices or dates.';
    state.step = 3;
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
    contact_email: state.email,
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
  $('group-wizard-modal')?.querySelector('.res-modal')?.classList.remove('res-modal--guest-modify');
  document.body.classList.remove('guest-wizard-open');
  const roomOpen = !$('reservation-wizard-modal')?.classList.contains('hidden');
  const venueOpen = !$('venue-wizard-modal')?.classList.contains('hidden');
  if (!roomOpen && !venueOpen) document.body.style.overflow = '';
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

  if (groupId) {
    const group = await getGroupById(groupId);
    applyGroupRecordToState(group);
    if (guestModify) applyLoggedInGroupContact(state);
  } else if (fromRequestId) {
    const group = await getGroupById(fromRequestId);
    applyGroupRecordToState(group);
    state.groupId = null;
    state.fromRequestId = fromRequestId;
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
    if (prefill.fees?.length) {
      state.fees = prefill.fees.map((f) => ({ fee_name: f.fee_name, amount: f.amount }));
      state.originalFees = state.fees.map((f) => ({ ...f }));
    }
    if (prefill.selectedRooms?.length) {
      state.selectedRooms = prefill.selectedRooms.map((row) => ({
        room_id: Number(row.room_id),
        guest_count: Math.max(1, Number(row.guest_count) || 1),
      }));
    }
  }

  if (guestModify && state.checkIn && state.checkOut && state.checkOut > state.checkIn) {
    state.step = 2;
  } else if (modifyRequest && state.selectedRooms.length && state.checkIn && state.checkOut) {
    state.step = 3;
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
  bindMealDelegation();

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !isOpen) return;
    closeGroupWizard();
  });
}
