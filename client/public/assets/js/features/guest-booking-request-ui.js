/**
 * Booking request drawer + review/submit modal (guest browse).
 */

import { submitBookingRequest, getProfile, getRoomStayEstimate } from '/assets/js/services/api.js';
import { createGuestBookingExtras } from '/assets/js/features/guest-booking-extras.js';
import {
  loadBookingRequest,
  clearBookingRequest,
  removeBookingRequestItem,
  updateBookingRequestItem,
  bookingRequestCount,
  estimatedRequestTotal,
  roomItems,
  venueItems,
  sharedStayDates,
  getBookingRequestExtras,
  saveBookingRequestExtras,
  groupGuestAssignmentStatus,
  roomGuestLimits,
} from '/assets/js/features/guest-booking-request-store.js';
import {
  escapeHtml,
  formatMoney,
  mealTypesOrdered,
  formatFeeLineLabel,
  aggregateFeeLines,
} from '/assets/js/features/reservation-shared.js';

const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

function formatStayRange(checkIn, checkOut) {
  if (!checkIn || !checkOut) return '—';
  const start = new Date(`${checkIn}T12:00:00`);
  const end = new Date(`${checkOut}T12:00:00`);
  const opts = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString('en-PH', opts)} – ${end.toLocaleDateString('en-PH', { ...opts, year: 'numeric' })}`;
}

let bookingExtras = null;
let extrasReady = false;
let profileCache = null;
let guestCountUpdateToken = 0;

async function updateRoomGuestCount(itemId, guestCount) {
  const state = loadBookingRequest();
  const row = state.items.find((r) => r.id === itemId && r.kind === 'room');
  if (!row) return;

  const priceEl = document.querySelector(`[data-br-item-price="${itemId}"]`);
  if (priceEl) priceEl.textContent = 'Updating…';

  const token = ++guestCountUpdateToken;
  try {
    const estimate = await getRoomStayEstimate({
      room_id: row.roomId,
      check_in: row.checkIn,
      check_out: row.checkOut,
      guest_count: guestCount,
    });
    if (token !== guestCountUpdateToken) return;
    updateBookingRequestItem(itemId, {
      guestCount,
      estimatedTotal: estimate.estimated_total,
      pricePerNight: estimate.price_per_night,
      occupancyItem: estimate.occupancy_item,
    });
  } catch (err) {
    if (token !== guestCountUpdateToken) return;
    showBookingRequestToast(err.message || 'Could not update guest count.', { error: true });
    paintBookingRequestChrome();
  }
}

function renderItem(row, state) {
  if (row.kind === 'room') {
    const { min: minGuests, max: maxGuests } = roomGuestLimits(row, state);
    const guestCount = Math.max(1, Number(row.guestCount) || 1);

    return `
      <article class="br-drawer__item" data-br-item="${escapeHtml(row.id)}">
        <div class="br-drawer__item-main">
          <p class="br-drawer__item-type">Room</p>
          <h4 class="br-drawer__item-title">${escapeHtml(row.building)} · Room ${escapeHtml(row.roomNumber)}</h4>
          <p class="br-drawer__item-meta">${escapeHtml(row.roomType)} · ${formatStayRange(row.checkIn, row.checkOut)}</p>
          <div class="br-room-guests">
            <span class="br-room-guests__label">Guests in this room</span>
            <div class="br-room-guests__qty">
              <button type="button" data-br-guest-minus="${escapeHtml(row.id)}" aria-label="Fewer guests" ${guestCount <= minGuests ? 'disabled' : ''}>−</button>
              <span data-br-guest-count="${escapeHtml(row.id)}">${guestCount}</span>
              <button type="button" data-br-guest-plus="${escapeHtml(row.id)}" aria-label="More guests" ${guestCount >= maxGuests ? 'disabled' : ''}>+</button>
            </div>
          </div>
          ${row.estimatedTotal != null ? `<p class="br-drawer__item-price" data-br-item-price="${escapeHtml(row.id)}">${peso(row.estimatedTotal)} est.</p>` : `<p class="br-drawer__item-price" data-br-item-price="${escapeHtml(row.id)}">—</p>`}
        </div>
        <button type="button" class="br-drawer__remove" data-br-remove="${escapeHtml(row.id)}" aria-label="Remove item">
          <span class="material-symbols-outlined">close</span>
        </button>
      </article>`;
  }

  return `
    <article class="br-drawer__item" data-br-item="${escapeHtml(row.id)}">
      <div class="br-drawer__item-main">
        <p class="br-drawer__item-type">Venue</p>
        <h4 class="br-drawer__item-title">${escapeHtml(row.venueName)}</h4>
        <p class="br-drawer__item-meta">${escapeHtml(row.category || 'Venue')}${row.item ? ` · ${escapeHtml(row.item)}` : ''}</p>
        <p class="br-drawer__item-meta">${escapeHtml(row.eventDate)} · ${escapeHtml(row.startTime)}–${escapeHtml(row.endTime)}</p>
        ${row.estimatedTotal != null ? `<p class="br-drawer__item-price">${peso(row.estimatedTotal)} est.</p>` : ''}
      </div>
      <button type="button" class="br-drawer__remove" data-br-remove="${escapeHtml(row.id)}" aria-label="Remove item">
        <span class="material-symbols-outlined">close</span>
      </button>
    </article>`;
}

function renderReviewItem(row) {
  if (row.kind === 'room') {
    return `
      <article class="br-review-card">
        <p class="br-review-card__type">Room</p>
        <h3 class="br-review-card__title">${escapeHtml(row.building)} · Room ${escapeHtml(row.roomNumber)}</h3>
        <p class="br-review-card__meta">${escapeHtml(row.roomType)} · ${row.guestCount} guest${row.guestCount === 1 ? '' : 's'} · ${formatStayRange(row.checkIn, row.checkOut)}</p>
        ${row.estimatedTotal != null ? `<p class="br-review-card__price">${peso(row.estimatedTotal)} estimated</p>` : ''}
      </article>`;
  }
  return `
    <article class="br-review-card">
      <p class="br-review-card__type">Venue</p>
      <h3 class="br-review-card__title">${escapeHtml(row.venueName)}</h3>
      <p class="br-review-card__meta">${escapeHtml(row.category || 'Venue')}${row.item ? ` · ${escapeHtml(row.item)}` : ''}</p>
      <p class="br-review-card__meta">${escapeHtml(row.eventDate)} · ${escapeHtml(row.startTime)}–${escapeHtml(row.endTime)} · ${row.guestCount} guest${row.guestCount === 1 ? '' : 's'}</p>
      ${row.estimatedTotal != null ? `<p class="br-review-card__price">${peso(row.estimatedTotal)} estimated</p>` : ''}
    </article>`;
}

function renderDrawerContent(state) {
  const count = bookingRequestCount(state);
  const total = estimatedRequestTotal(state);
  const rooms = roomItems(state);
  const venues = venueItems(state);
  const guestStatus = groupGuestAssignmentStatus(state);

  if (!count) {
    return `
      <div class="br-drawer__empty">
        <span class="material-symbols-outlined br-drawer__empty-icon">playlist_add</span>
        <p class="br-drawer__empty-title">No items yet</p>
        <p class="br-drawer__empty-text">Browse lodging and venues, then use <strong>Add to booking request</strong> to collect everything before you submit once.</p>
      </div>`;
  }

  let guestSummary = '';
  if (rooms.length > 1 && guestStatus.groupTotal != null) {
    const suffix = guestStatus.matches
      ? ''
      : guestStatus.remaining > 0
        ? ` — assign ${guestStatus.remaining} more`
        : ` — ${Math.abs(guestStatus.remaining)} too many`;
    guestSummary = `<p class="br-drawer__summary-meta${guestStatus.matches ? '' : ' br-drawer__summary-meta--warn'}">${guestStatus.assigned} of ${guestStatus.groupTotal} guests assigned across rooms${suffix}</p>`;
  }

  return `
    <div class="br-drawer__summary">
      <p><strong>${count}</strong> item${count === 1 ? '' : 's'} · ${rooms.length} room${rooms.length === 1 ? '' : 's'}${venues.length ? ` · ${venues.length} venue${venues.length === 1 ? '' : 's'}` : ''}</p>
      ${guestSummary}
      ${total > 0 ? `<p class="br-drawer__summary-total">Estimated total: <strong>${peso(total)}</strong></p>` : ''}
    </div>
    <div class="br-drawer__list">${state.items.map((row) => renderItem(row, state)).join('')}</div>`;
}

function canSubmitBookingRequest(state = loadBookingRequest()) {
  if (bookingRequestCount(state) < 1) return false;
  return groupGuestAssignmentStatus(state).matches;
}

function ensureChrome() {
  if (document.getElementById('br-chrome')) return;

  const chrome = document.createElement('div');
  chrome.id = 'br-chrome';
  chrome.className = 'br-chrome';
  chrome.innerHTML = `
    <button type="button" id="br-open-btn" class="br-chrome__btn" aria-expanded="false" aria-controls="br-drawer">
      <span class="material-symbols-outlined">playlist_add_check</span>
      <span class="br-chrome__label">Booking request</span>
      <span id="br-badge" class="br-chrome__badge hidden">0</span>
    </button>
  `;
  document.body.appendChild(chrome);

  const drawer = document.createElement('div');
  drawer.id = 'br-drawer';
  drawer.className = 'br-drawer';
  drawer.hidden = true;
  drawer.setAttribute('aria-hidden', 'true');
  drawer.innerHTML = `
    <button type="button" class="br-drawer__backdrop" data-br-close aria-label="Close booking request"></button>
    <aside class="br-drawer__panel" role="dialog" aria-modal="true" aria-labelledby="br-drawer-title">
      <header class="br-drawer__head">
        <div>
          <p class="br-drawer__eyebrow">Draft</p>
          <h2 id="br-drawer-title" class="br-drawer__title">Your booking request</h2>
        </div>
        <button type="button" class="br-drawer__close" data-br-close aria-label="Close">
          <span class="material-symbols-outlined">close</span>
        </button>
      </header>
      <div id="br-drawer-body" class="br-drawer__body"></div>
      <footer class="br-drawer__foot">
        <button type="button" id="br-review-btn" class="br-drawer__cta">Review &amp; submit</button>
        <button type="button" class="br-drawer__ghost" data-br-close>Keep browsing</button>
      </footer>
    </aside>
  `;
  document.body.appendChild(drawer);

  const reviewModal = document.createElement('div');
  reviewModal.id = 'br-review-modal';
  reviewModal.className = 'br-review-modal';
  reviewModal.hidden = true;
  reviewModal.setAttribute('aria-hidden', 'true');
  reviewModal.innerHTML = `
    <button type="button" class="br-review-modal__backdrop" data-br-review-close aria-label="Close review"></button>
    <div class="br-review-modal__panel" role="dialog" aria-modal="true" aria-labelledby="br-review-title">
      <header class="br-review-modal__head">
        <button type="button" class="br-review-modal__back" data-br-review-back aria-label="Back to list">
          <span class="material-symbols-outlined">arrow_back</span>
          <span>Back</span>
        </button>
        <button type="button" class="br-review-modal__close" data-br-review-close aria-label="Close">
          <span class="material-symbols-outlined">close</span>
        </button>
      </header>
      <div class="br-review-modal__scroll nice-scroll">
        <div class="br-review-modal__intro">
          <p class="br-drawer__eyebrow">Final step</p>
          <h2 id="br-review-title" class="br-review-modal__title">Review &amp; submit</h2>
          <p class="br-review-modal__lead">Confirm your items, add meals or extras for room stays, then send one request to housing staff.</p>
        </div>
        <div id="br-review-success" class="br-review-modal__success hidden" role="status"></div>
        <div id="br-review-error" class="br-review-modal__error hidden" role="alert"></div>
        <div id="br-review-form-wrap">
          <div id="br-review-list" class="br-review-modal__items"></div>
          <form id="br-submit-form" class="br-review-modal__form">
            <div id="br-group-name-wrap" class="br-review-field hidden">
              <label class="br-review-label" for="br-group-name">Group / organization name</label>
              <input id="br-group-name" type="text" class="br-review-input" placeholder="e.g. Mission Team Alpha" />
              <p class="br-review-hint">As organizer, you are booking rooms, meals, and extras for the whole group and the full stay.</p>
            </div>
            <div class="br-review-field">
              <label class="br-review-label" for="br-contact-name">Contact name <span class="text-error">*</span></label>
              <input id="br-contact-name" type="text" required class="br-review-input" />
            </div>
            <div class="br-review-field">
              <label class="br-review-label" for="br-contact-phone">Contact phone</label>
              <input id="br-contact-phone" type="tel" class="br-review-input" placeholder="09XX XXX XXXX" />
            </div>
            <section id="br-extras-panel" class="guest-booking-extras hidden">
              <div class="guest-booking-extras__head">
                <div>
                  <h4 class="guest-booking-extras__title">Meals &amp; extras</h4>
                  <p class="guest-booking-extras__sub" data-guest-extras-sub>Optional meals and extras for your stay. Meal quantities cover all guests for the nights you need them.</p>
                </div>
              </div>
              <div class="guest-extras-block">
                <p class="guest-extras-block__label">Meals</p>
                <p class="br-review-hint" data-guest-meals-hint>Set how many of each meal you need for the stay (not just one night).</p>
                <div id="br-meals-grid" class="guest-meals-grid"></div>
                <label class="guest-extras-block__label mt-3" for="br-meal-allergens">Meal allergens &amp; dietary notes</label>
                <textarea id="br-meal-allergens" rows="2" class="br-review-input" placeholder="e.g. nut allergy, gluten-free…"></textarea>
              </div>
              <div class="guest-extras-block" data-guest-extras-services>
                <p class="guest-extras-block__label">Extra services</p>
                <p class="br-review-hint">Tap to add. Same extras combine as quantities (for example, 2× Extra bed).</p>
                <div id="br-selected-fees" class="guest-added-extras hidden"></div>
                <div id="br-fee-chips" class="guest-service-grid"></div>
                <div id="br-fee-submenu" class="guest-service-drawer hidden" aria-live="polite"></div>
              </div>
            </section>
            <div id="br-arrival-wrap" class="br-review-field hidden">
              <label class="br-review-label" for="br-arrival-time" id="br-arrival-label">Expected arrival <span class="text-error">*</span></label>
              <input id="br-arrival-time" type="time" class="br-review-input" />
              <p class="br-review-hint" id="br-arrival-hint">Tell housing when you expect to arrive on check-in day.</p>
            </div>
            <div class="br-review-field">
              <label class="br-review-label" for="br-notes">Notes for housing staff</label>
              <textarea id="br-notes" rows="2" class="br-review-input" placeholder="Special requests for housing (optional)…"></textarea>
            </div>
            <div id="br-review-breakdown" class="br-review-breakdown" aria-live="polite"></div>
            <div class="br-review-total-row">
              <span>Estimated total</span>
              <span id="br-review-total">—</span>
            </div>
            <p class="br-review-modal__fine">Final pricing is confirmed after admin review.</p>
          </form>
        </div>
      </div>
      <footer class="br-review-modal__foot">
        <button type="submit" form="br-submit-form" id="br-submit-btn" class="br-drawer__cta">Submit booking request</button>
      </footer>
    </div>
  `;
  document.body.appendChild(reviewModal);

  document.getElementById('br-open-btn')?.addEventListener('click', () => toggleDrawer(true));

  drawer.addEventListener('click', (e) => {
    if (e.target.closest('[data-br-close]')) {
      toggleDrawer(false);
      return;
    }
    const minusBtn = e.target.closest('[data-br-guest-minus]');
    const plusBtn = e.target.closest('[data-br-guest-plus]');
    if (minusBtn || plusBtn) {
      const itemId = minusBtn?.dataset.brGuestMinus || plusBtn?.dataset.brGuestPlus;
      const state = loadBookingRequest();
      const row = state.items.find((r) => r.id === itemId && r.kind === 'room');
      if (!row) return;
      const { min: minGuests, max: maxGuests } = roomGuestLimits(row, state);
      const current = Math.max(1, Number(row.guestCount) || 1);
      const next = Math.min(maxGuests, Math.max(minGuests, current + (minusBtn ? -1 : 1)));
      if (next === current) return;
      void updateRoomGuestCount(itemId, next);
      return;
    }
    const removeBtn = e.target.closest('[data-br-remove]');
    if (removeBtn) {
      removeBookingRequestItem(removeBtn.dataset.brRemove);
      paintBookingRequestChrome();
    }
  });

  document.getElementById('br-review-btn')?.addEventListener('click', () => {
    if (bookingRequestCount() < 1) return;
    const state = loadBookingRequest();
    const guestStatus = groupGuestAssignmentStatus(state);
    if (!guestStatus.matches) {
      showBookingRequestToast(
        guestStatus.remaining > 0
          ? `Assign all ${guestStatus.groupTotal} guests across your rooms before submitting (${guestStatus.remaining} still unassigned).`
          : `Your rooms total ${guestStatus.assigned} guests, but you searched for ${guestStatus.groupTotal}. Adjust the counts so they match.`,
        { error: true },
      );
      return;
    }
    openReviewModal();
  });

  reviewModal.addEventListener('click', (e) => {
    if (e.target.closest('[data-br-review-close]')) {
      closeReviewModal();
      return;
    }
    if (e.target.closest('[data-br-review-back]')) {
      closeReviewModal();
      toggleDrawer(true);
    }
  });

  document.getElementById('br-submit-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    void submitBookingRequestForm();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const modal = document.getElementById('br-review-modal');
    if (modal && !modal.hidden) {
      closeReviewModal();
      return;
    }
    if (!drawer.hidden) toggleDrawer(false);
  });

  bookingExtras = createGuestBookingExtras({
    panelEl: document.getElementById('br-extras-panel'),
    mealsMount: document.getElementById('br-meals-grid'),
    feeChipsMount: document.getElementById('br-fee-chips'),
    feeSubmenuMount: document.getElementById('br-fee-submenu'),
    selectedFeesMount: document.getElementById('br-selected-fees'),
    allergenInputId: 'br-meal-allergens',
    onChange: () => {
      if (!bookingExtras) return;
      const payload = bookingExtras.getPayload();
      saveBookingRequestExtras({
        meals: payload.meals,
        fees: payload.fees,
        meal_allergen_notes: payload.meal_allergen_notes || '',
      });
      paintReviewTotals();
      paintBookingRequestChrome();
    },
  });
  void bookingExtras.init().then(() => {
    extrasReady = true;
  });
}

async function ensureProfile() {
  if (!profileCache) {
    const data = await getProfile();
    profileCache = data.user || data;
  }
  return profileCache;
}

function paintReviewTotals() {
  const totalEl = document.getElementById('br-review-total');
  const breakdownEl = document.getElementById('br-review-breakdown');
  if (!totalEl) return;

  const rooms = roomItems();
  const venues = venueItems();
  const lodging = rooms.reduce((s, r) => s + Number(r.estimatedTotal || 0), 0);
  const venueTotal = venues.reduce((s, v) => s + Number(v.estimatedTotal || 0), 0);
  const mealsSub = rooms.length && bookingExtras ? bookingExtras.mealsSubtotal() : 0;
  const feesSub = rooms.length && bookingExtras ? bookingExtras.feesSubtotal() : 0;
  const total = lodging + venueTotal + mealsSub + feesSub;
  totalEl.textContent = total > 0 ? peso(total) : '—';

  if (!breakdownEl) return;
  const lines = [];
  if (lodging > 0) {
    lines.push({
      label: rooms.length > 1 ? `Room stays (${rooms.length})` : 'Room stay',
      amount: lodging,
    });
  }
  if (venueTotal > 0) {
    lines.push({
      label: venues.length > 1 ? `Venue bookings (${venues.length})` : 'Venue booking',
      amount: venueTotal,
    });
  }
  if (rooms.length && bookingExtras) {
    const payload = bookingExtras.getPayload();
    mealTypesOrdered(payload.meals || {}).forEach((type) => {
      const qty = Number(payload.meals?.[type] || 0);
      if (qty > 0) lines.push({ label: `${type} × ${qty}`, amount: null, detail: true });
    });
    if (mealsSub > 0) lines.push({ label: 'Meals subtotal', amount: mealsSub });
    aggregateFeeLines(payload.fees || []).forEach((f) => {
      const qty = Math.max(1, Number(f.quantity) || 1);
      lines.push({
        label: formatFeeLineLabel(f),
        amount: Number(f.amount) * qty,
      });
    });
  }
  if (!lines.length) {
    breakdownEl.innerHTML = '';
    return;
  }
  breakdownEl.innerHTML = `
    <p class="br-review-breakdown__title">Summary breakdown</p>
    <ul class="br-review-breakdown__list">
      ${lines.map((line) => `
        <li class="br-review-breakdown__row${line.detail ? ' br-review-breakdown__row--detail' : ''}">
          <span>${escapeHtml(line.label)}</span>
          <span>${line.amount == null ? '' : formatMoney(line.amount)}</span>
        </li>`).join('')}
    </ul>`;
}

function paintReviewModal() {
  const state = loadBookingRequest();
  const rooms = roomItems(state);
  const listEl = document.getElementById('br-review-list');
  const groupWrap = document.getElementById('br-group-name-wrap');
  const extrasPanel = document.getElementById('br-extras-panel');
  const arrivalWrap = document.getElementById('br-arrival-wrap');
  const arrivalInput = document.getElementById('br-arrival-time');
  const arrivalLabel = document.getElementById('br-arrival-label');
  const arrivalHint = document.getElementById('br-arrival-hint');
  const submitBtn = document.getElementById('br-submit-btn');
  const isGroup = rooms.length > 1;
  const arrivalDate = rooms[0]?.checkIn
    ? new Date(`${rooms[0].checkIn}T12:00:00`).toLocaleDateString('en-PH', {
      month: 'long', day: 'numeric', year: 'numeric',
    })
    : '';

  if (listEl) listEl.innerHTML = state.items.map(renderReviewItem).join('');
  if (groupWrap) groupWrap.classList.toggle('hidden', !isGroup);
  if (extrasPanel) extrasPanel.classList.toggle('hidden', rooms.length < 1);
  if (arrivalWrap) {
    arrivalWrap.classList.toggle('hidden', rooms.length < 1);
    if (arrivalInput) arrivalInput.required = rooms.length > 0;
  }
  if (arrivalLabel) {
    arrivalLabel.innerHTML = isGroup
      ? `Earliest arrival${arrivalDate ? ` — ${escapeHtml(arrivalDate)}` : ''} <span class="text-error">*</span>`
      : `Expected arrival${arrivalDate ? ` — ${escapeHtml(arrivalDate)}` : ''} <span class="text-error">*</span>`;
  }
  if (arrivalHint) {
    arrivalHint.textContent = isGroup
      ? 'If members arrive at different times, enter the earliest arrival on check-in day.'
      : 'Tell housing when you expect to arrive on check-in day.';
  }
  if (submitBtn) submitBtn.disabled = state.items.length < 1;

  if (bookingExtras) {
    bookingExtras.setRoomSelected(rooms.length > 0);
    bookingExtras.setGroupMode?.(isGroup);
    if (rooms.length > 0) {
      bookingExtras.applyState(getBookingRequestExtras(state));
    }
  }
  paintReviewTotals();
}

async function openReviewModal() {
  ensureChrome();
  const modal = document.getElementById('br-review-modal');
  if (!modal) return;

  if (!extrasReady && bookingExtras) await bookingExtras.init();

  const profile = await ensureProfile();
  const contactName = document.getElementById('br-contact-name');
  const contactPhone = document.getElementById('br-contact-phone');
  if (contactName && profile?.full_name && !contactName.value) contactName.value = profile.full_name;
  if (contactPhone && profile?.contact_phone && !contactPhone.value) contactPhone.value = profile.contact_phone;

  document.getElementById('br-review-success')?.classList.add('hidden');
  document.getElementById('br-review-error')?.classList.add('hidden');
  document.getElementById('br-review-form-wrap')?.classList.remove('hidden');
  document.querySelector('#br-review-modal .br-review-modal__foot')?.classList.remove('hidden');
  document.getElementById('br-submit-btn').textContent = 'Submit booking request';
  document.getElementById('br-submit-btn').disabled = bookingRequestCount() < 1;

  paintReviewModal();
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('br-review-open');
  toggleDrawer(false);
}

function closeReviewModal() {
  const modal = document.getElementById('br-review-modal');
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('br-review-open');
}

async function submitBookingRequestForm() {
  const errorEl = document.getElementById('br-review-error');
  const successEl = document.getElementById('br-review-success');
  const submitBtn = document.getElementById('br-submit-btn');
  const formWrap = document.getElementById('br-review-form-wrap');

  errorEl?.classList.add('hidden');
  successEl?.classList.add('hidden');

  const state = loadBookingRequest();
  if (!state.items.length) {
    errorEl.textContent = 'Add at least one room or venue before submitting.';
    errorEl?.classList.remove('hidden');
    return;
  }

  const rooms = roomItems(state);
  const venues = venueItems(state);
  const guestStatus = groupGuestAssignmentStatus(state);
  if (!guestStatus.matches) {
    errorEl.textContent = guestStatus.remaining > 0
      ? `Assign all ${guestStatus.groupTotal} guests across your rooms before submitting (${guestStatus.remaining} still unassigned).`
      : `Your rooms total ${guestStatus.assigned} guests, but you searched for ${guestStatus.groupTotal}. Adjust the counts so they match.`;
    errorEl?.classList.remove('hidden');
    return;
  }
  const stay = sharedStayDates(state);
  const extrasPayload = rooms.length && bookingExtras ? bookingExtras.getPayload() : { meals: {}, fees: [], meal_allergen_notes: undefined };
  const arrivalTime = document.getElementById('br-arrival-time')?.value?.trim() || '';

  if (rooms.length && !arrivalTime) {
    errorEl.textContent = rooms.length > 1
      ? 'Enter the earliest arrival time for your group.'
      : 'Enter your expected arrival time.';
    errorEl?.classList.remove('hidden');
    document.getElementById('br-arrival-time')?.focus();
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting…';

  try {
    const result = await submitBookingRequest({
      contact_name: document.getElementById('br-contact-name')?.value?.trim(),
      contact_phone: document.getElementById('br-contact-phone')?.value?.trim() || undefined,
      group_name: document.getElementById('br-group-name')?.value?.trim() || undefined,
      check_in: stay?.checkIn,
      check_out: stay?.checkOut,
      notes: document.getElementById('br-notes')?.value?.trim() || undefined,
      expected_arrival_time: rooms.length ? arrivalTime : undefined,
      meals: extrasPayload.meals,
      fees: extrasPayload.fees,
      meal_allergen_notes: extrasPayload.meal_allergen_notes,
      rooms: rooms.map((row) => ({
        room_id: row.roomId,
        guest_count: row.guestCount,
      })),
      is_group_stay: rooms.length > 1,
      venues: venues.map((row) => ({
        facility_id: row.facilityId,
        event_date: row.eventDate,
        start_time: row.startTime,
        end_time: row.endTime,
        guest_count: row.guestCount,
        notes: row.notes || undefined,
      })),
    });

    clearBookingRequest();
    bookingExtras?.reset();
    paintBookingRequestChrome();

    if (successEl) {
      const ref = result.batch_ref ? ` Reference <strong>${escapeHtml(result.batch_ref)}</strong>.` : '';
      successEl.innerHTML = `
        <div class="guest-booking-success">
          <span class="material-symbols-outlined guest-booking-success__icon" aria-hidden="true">check_circle</span>
          <div class="guest-booking-success__copy">
            <h4 class="guest-booking-success__title">Request submitted</h4>
            <p class="guest-booking-success__msg">Your booking request has been sent and is pending approval.${ref}</p>
            <p class="guest-booking-success__hint">Housing will review your request and email you when it is confirmed.</p>
          </div>
          <div class="guest-booking-success__actions">
            <a href="/guest/reservations.html" class="guest-booking-success__primary">View Reservation History</a>
            <button type="button" class="guest-booking-success__secondary" data-br-review-close>Done</button>
          </div>
        </div>`;
      successEl.classList.remove('hidden');
    }
    formWrap?.classList.add('hidden');
    document.querySelector('#br-review-modal .br-review-modal__foot')?.classList.add('hidden');
    submitBtn.textContent = 'Submitted';
  } catch (err) {
    errorEl.textContent = err.message || 'Submission failed. Please try again.';
    errorEl?.classList.remove('hidden');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit booking request';
  }
}

export function paintBookingRequestChrome() {
  ensureChrome();
  const state = loadBookingRequest();
  const count = bookingRequestCount(state);
  const badge = document.getElementById('br-badge');
  const body = document.getElementById('br-drawer-body');
  const reviewBtn = document.getElementById('br-review-btn');

  if (badge) {
    badge.textContent = String(count);
    badge.classList.toggle('hidden', count < 1);
  }
  if (body) body.innerHTML = renderDrawerContent(state);
  if (reviewBtn) {
    const canSubmit = canSubmitBookingRequest(state);
    reviewBtn.classList.toggle('br-drawer__cta--disabled', count < 1 || !canSubmit);
    reviewBtn.disabled = count < 1 || !canSubmit;
  }
}

export function toggleDrawer(open) {
  const drawer = document.getElementById('br-drawer');
  const btn = document.getElementById('br-open-btn');
  if (!drawer) return;
  const show = open ?? drawer.hidden;
  drawer.hidden = !show;
  drawer.setAttribute('aria-hidden', show ? 'false' : 'true');
  document.body.classList.toggle('br-drawer-open', show);
  btn?.setAttribute('aria-expanded', show ? 'true' : 'false');
  if (show) paintBookingRequestChrome();
}

export function initBookingRequestChrome({ openOnAdd = false } = {}) {
  ensureChrome();
  paintBookingRequestChrome();
  window.addEventListener('aptspace:booking-request-changed', () => {
    paintBookingRequestChrome();
    if (!document.getElementById('br-review-modal')?.hidden) paintReviewModal();
  });
  return {
    openDrawer: () => toggleDrawer(true),
    openReview: () => openReviewModal(),
    notifyAdded() {
      paintBookingRequestChrome();
      if (openOnAdd) toggleDrawer(true);
    },
  };
}

export function showBookingRequestToast(message, { error = false } = {}) {
  let toast = document.getElementById('br-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'br-toast';
    toast.className = 'br-toast';
    toast.setAttribute('role', 'status');
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.toggle('br-toast--error', error);
  toast.classList.add('is-visible');
  window.clearTimeout(showBookingRequestToast._timer);
  showBookingRequestToast._timer = window.setTimeout(() => {
    toast.classList.remove('is-visible');
  }, 3200);
}
