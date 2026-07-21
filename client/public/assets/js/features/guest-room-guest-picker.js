/**
 * Per-room guest count picker with live occupancy-based pricing (group stays).
 */

import { getRoomStayEstimate } from '/assets/js/services/api.js';
import { escapeHtml } from '/assets/js/features/reservation-shared.js';

const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

let modalEl = null;
let activeSession = null;

function ensureModal() {
  if (modalEl) return modalEl;

  modalEl = document.createElement('div');
  modalEl.id = 'room-guest-picker-modal';
  modalEl.className = 'room-guest-picker-modal';
  modalEl.hidden = true;
  modalEl.setAttribute('aria-hidden', 'true');
  document.body.appendChild(modalEl);

  modalEl.addEventListener('click', (e) => {
    if (!activeSession) return;
    if (e.target.closest('[data-rgp-cancel]')) {
      activeSession.finish(null);
      return;
    }
    if (e.target.closest('[data-rgp-confirm]')) {
      if (activeSession.estimate && !activeSession.loading) {
        activeSession.finish({
          guestCount: activeSession.guestCount,
          estimate: activeSession.estimate,
        });
      }
      return;
    }
    if (e.target.closest('[data-rgp-minus]')) {
      if (activeSession.guestCount > activeSession.minGuests) {
        activeSession.guestCount -= 1;
        void activeSession.fetchEstimate();
      }
      return;
    }
    if (e.target.closest('[data-rgp-plus]')) {
      if (activeSession.guestCount < activeSession.maxGuests) {
        activeSession.guestCount += 1;
        void activeSession.fetchEstimate();
      }
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !activeSession || modalEl.hidden) return;
    activeSession.finish(null);
  });

  return modalEl;
}

function renderSession(session) {
  const {
    roomLabel,
    guestCount,
    minGuests,
    maxGuests,
    isDorm,
    estimate,
    loading,
    error,
    confirmLabel,
  } = session;

  const priceBlock = loading
    ? '<p class="room-guest-picker__loading">Updating price…</p>'
    : error
      ? `<p class="room-guest-picker__error" role="alert">${escapeHtml(error)}</p>`
      : estimate
        ? `<div class="room-guest-picker__price">
            <p class="room-guest-picker__total">${peso(estimate.estimated_total)} <span>estimated</span></p>
            ${estimate.price_per_night != null
    ? `<p class="room-guest-picker__per-night">${peso(estimate.price_per_night)} / night · ${estimate.nights} night${estimate.nights === 1 ? '' : 's'}</p>`
    : ''}
          </div>`
        : '';

  modalEl.innerHTML = `
    <button type="button" class="room-guest-picker__backdrop" data-rgp-cancel aria-label="Close"></button>
    <div class="room-guest-picker__panel" role="dialog" aria-modal="true" aria-labelledby="rgp-title">
      <header class="room-guest-picker__head">
        <h2 id="rgp-title" class="room-guest-picker__title">Guests for this room</h2>
        <p class="room-guest-picker__sub">${escapeHtml(roomLabel)}</p>
        <button type="button" class="room-guest-picker__close" data-rgp-cancel aria-label="Close">
          <span class="material-symbols-outlined">close</span>
        </button>
      </header>
      <div class="room-guest-picker__body">
        <p class="room-guest-picker__label">How many guests will stay in this room?</p>
        <p class="room-guest-picker__range">${isDorm ? `Dorm minimum ${minGuests} · ` : ''}${minGuests}–${maxGuests} guests</p>
        <div class="room-guest-picker__qty">
          <button type="button" data-rgp-minus aria-label="Fewer guests" ${guestCount <= minGuests ? 'disabled' : ''}>−</button>
          <span aria-live="polite">${guestCount}</span>
          <button type="button" data-rgp-plus aria-label="More guests" ${guestCount >= maxGuests ? 'disabled' : ''}>+</button>
        </div>
        ${priceBlock}
      </div>
      <footer class="room-guest-picker__foot">
        <button type="button" class="room-guest-picker__ghost" data-rgp-cancel>Cancel</button>
        <button type="button" class="room-guest-picker__cta" data-rgp-confirm ${loading || error || !estimate ? 'disabled' : ''}>${escapeHtml(confirmLabel)}</button>
      </footer>
    </div>`;
}

/**
 * Ask how many guests stay in one room; returns { guestCount, estimate } or null if cancelled.
 */
export function openRoomGuestPicker({
  roomLabel,
  roomType = '',
  roomId,
  checkIn,
  checkOut,
  minGuests = 1,
  maxGuests = 99,
  defaultGuestCount = 1,
  isDorm = false,
  confirmLabel = 'Add to request',
}) {
  return new Promise((resolve) => {
    const modal = ensureModal();
    let settled = false;

    const session = {
      roomLabel,
      roomType,
      guestCount: Math.min(maxGuests, Math.max(minGuests, defaultGuestCount)),
      minGuests,
      maxGuests,
      isDorm,
      estimate: null,
      loading: false,
      error: '',
      confirmLabel,
      finish(result) {
        if (settled) return;
        settled = true;
        activeSession = null;
        modal.hidden = true;
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('room-guest-picker-open');
        resolve(result);
      },
      async fetchEstimate() {
        session.loading = true;
        session.error = '';
        renderSession(session);
        try {
          session.estimate = await getRoomStayEstimate({
            room_id: roomId,
            check_in: checkIn,
            check_out: checkOut,
            guest_count: session.guestCount,
          });
        } catch (err) {
          session.estimate = null;
          session.error = err.message || 'Could not get price for this room.';
        }
        session.loading = false;
        renderSession(session);
      },
    };

    activeSession = session;
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('room-guest-picker-open');
    void session.fetchEstimate();
  });
}
