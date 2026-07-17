/**
 * Shared guest room booking modal — used on Browse and My Stays.
 */
import { createBooking, getRoomAvailability } from '/assets/js/services/api.js';
import {
  loadFiscalYearBounds,
  applyBookingDateBounds,
  formatBookingWindowHint,
  DORM_MIN_GUEST_COUNT,
  dormPriceLabel,
  isRoomBookable,
  isRoomListVisible,
  dormMinGuestsNotice,
} from '/assets/js/features/reservation-shared.js';
import { buildRoomPreviewUrl } from '/assets/js/features/guest-booking-flow.js';
import { createGuestBookingExtras } from '/assets/js/features/guest-booking-extras.js';
import { roomPreviewImage } from '/assets/js/features/facility-display.js';

function openModal(overlay) {
  overlay.classList.remove('is-hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal(overlay) {
  overlay.classList.add('is-hidden');
  if (!document.body.classList.contains('browse-preview-open')) {
    document.body.style.overflow = '';
  }
}

function resetCloseButton(closeBtn) {
  if (!closeBtn) return;
  const icon = closeBtn.querySelector('.material-symbols-outlined');
  if (icon) icon.textContent = 'close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.removeAttribute('title');
}

function setBackButton(closeBtn) {
  if (!closeBtn) return;
  const icon = closeBtn.querySelector('.material-symbols-outlined');
  if (icon) icon.textContent = 'arrow_back';
  closeBtn.setAttribute('aria-label', 'Back to room details');
  closeBtn.title = 'Back to room details';
}

/**
 * @param {object} options
 * @param {boolean} [options.readOnly]
 * @param {string[]} [options.blockedBuildings]
 * @param {() => Promise<void>|void} [options.onBookingCreated]
 * @param {(ctx: { roomId: string|number, checkIn: string, checkOut: string, guests: string }) => void} [options.onBrowseReturn]
 */
export async function initGuestRoomBookingModal({
  readOnly = false,
  blockedBuildings = [],
  onBookingCreated,
  onBrowseReturn,
} = {}) {
  const modal = document.getElementById('booking-modal-overlay');
  if (!modal) {
    console.warn('[browse] booking-modal-overlay not found — room booking modal disabled');
    return {
      openSearchBooking() {},
      openConfirmBooking() {},
      closeBookingModal() {},
    };
  }
  if (modal.parentElement !== document.body) {
    document.body.appendChild(modal);
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const peso = (n) => `\u20B1${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
  const fmtDate = (d) => {
    if (!d) return '—';
    const raw = String(d).slice(0, 10);
    const dt = new Date(`${raw}T00:00:00`);
    return Number.isNaN(dt.getTime()) ? raw : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  const isBlockedBuilding = (name) => blockedBuildings.includes(String(name || '').trim());

  let fiscalBounds = null;
  try {
    fiscalBounds = await loadFiscalYearBounds();
  } catch (err) {
    console.warn('Booking rules unavailable', err);
  }

  const form = document.getElementById('booking-form');
  const roomInput = document.getElementById('booking-room');
  const submitBtn = document.getElementById('booking-submit-btn');
  const confirmPanel = document.getElementById('booking-confirm-panel');
  const searchPanel = document.getElementById('booking-search-panel');
  const formFields = document.getElementById('booking-form-fields');
  const successPanel = document.getElementById('booking-success-panel');
  const closeBtn = document.getElementById('booking-modal-close');

  let browseReturnTo = null;
  let availableRooms = [];
  let selectedRoom = null;
  let lastRoomSearch = null;
  let bookingMode = 'search';
  let savedTrip = null;

  const bookingExtras = createGuestBookingExtras({
    panelEl: document.getElementById('booking-extras-panel'),
    mealsMount: document.getElementById('booking-meals-grid'),
    feeChipsMount: document.getElementById('booking-fee-chips'),
    feeSubmenuMount: document.getElementById('booking-fee-submenu'),
    selectedFeesMount: document.getElementById('booking-selected-fees'),
    onChange: () => updateBookingTotals(),
  });
  await bookingExtras.init();

  function readRoomSearchSnapshot() {
    return {
      checkIn: document.getElementById('booking-check-in')?.value || '',
      checkOut: document.getElementById('booking-check-out')?.value || '',
      guests: String(Number(document.getElementById('booking-guests')?.value) || 1),
    };
  }

  function roomSearchMatchesSelection() {
    if (!lastRoomSearch || !selectedRoom) return false;
    const current = readRoomSearchSnapshot();
    return current.checkIn === lastRoomSearch.checkIn
      && current.checkOut === lastRoomSearch.checkOut
      && current.guests === lastRoomSearch.guests;
  }

  function invalidateRoomSelection(message) {
    if (!selectedRoom && !roomInput.value) return;
    selectedRoom = null;
    roomInput.value = '';
    submitBtn.disabled = true;
    document.getElementById('booking-summary')?.classList.add('hidden');
    bookingExtras.reset();
    if (message) {
      const errorEl = document.getElementById('booking-form-error');
      errorEl.textContent = message;
      errorEl.classList.remove('hidden');
    }
  }

  function onBookingCriteriaChange() {
    if (!lastRoomSearch) return;
    if (roomSearchMatchesSelection()) return;
    invalidateRoomSelection('Your dates or guest count changed — search again and re-select a room.');
  }

  function updateBookingTotals() {
    const summary = document.getElementById('booking-summary');
    if (!selectedRoom) {
      summary.classList.add('hidden');
      bookingExtras.setRoomSelected(false);
      return;
    }

    bookingExtras.setRoomSelected(true);
    const roomTotal = Number(selectedRoom.estimated_total) || 0;
    const mealsTotal = bookingExtras.mealsSubtotal();
    const feesTotal = bookingExtras.feesSubtotal();
    const grand = bookingExtras.grandTotal(roomTotal);

    document.getElementById('booking-line-room').textContent = peso(roomTotal);
    document.getElementById('booking-line-meals-wrap').classList.toggle('hidden', mealsTotal <= 0);
    document.getElementById('booking-line-meals').textContent = peso(mealsTotal);
    document.getElementById('booking-line-fees-wrap').classList.toggle('hidden', feesTotal <= 0);
    document.getElementById('booking-line-fees').textContent = peso(feesTotal);
    document.getElementById('booking-summary-total').textContent = peso(grand);
    document.getElementById('booking-summary-meta').textContent =
      `${selectedRoom.building_name} ${selectedRoom.room_number} · ${selectedRoom.nights} night(s) · ${document.getElementById('booking-guests').value} guest(s) · estimate only`;

    summary.classList.remove('hidden');

    const previewWrap = document.getElementById('booking-selected-room-wrap');
    if (selectedRoom) {
      const extrasNote = bookingExtras.hasExtras()
        ? `<p class="text-body-sm text-on-surface-variant mt-3 pt-3 border-t border-outline-variant/60">Includes ${peso(mealsTotal + feesTotal)} in meals & extras · <strong class="text-primary">${peso(grand)}</strong> estimated total</p>`
        : '';
      renderSelectedRoomCard(selectedRoom, bookingMode === 'confirm' ? extrasNote : '');
      previewWrap?.classList.remove('hidden');
    } else {
      previewWrap?.classList.add('hidden');
    }
  }

  function setModalCopy({ title, subtitle }) {
    document.getElementById('booking-modal-title').textContent = title;
    document.getElementById('booking-modal-subtitle').textContent = subtitle;
  }

  function resetBookingResults() {
    availableRooms = [];
    selectedRoom = null;
    lastRoomSearch = null;
    roomInput.value = '';
    submitBtn.disabled = true;
    document.getElementById('room-results-wrap').classList.add('hidden');
    document.getElementById('booking-summary').classList.add('hidden');
    document.getElementById('booking-selected-room-wrap')?.classList.add('hidden');
    const previewMount = document.getElementById('booking-selected-room');
    if (previewMount) previewMount.innerHTML = '';
    bookingExtras.reset();
  }

  function setBookingMode(mode) {
    bookingMode = mode;
    const isConfirm = mode === 'confirm';
    confirmPanel.classList.toggle('hidden', !isConfirm);
    searchPanel.classList.toggle('hidden', isConfirm);
    if (isConfirm) {
      setModalCopy({
        title: 'Confirm your reservation',
        subtitle: 'Review your room and dates, then submit your request.',
      });
    } else {
      setModalCopy({
        title: 'Book a room',
        subtitle: 'Choose your dates and pick an available room.',
      });
    }
  }

  function updateConfirmSummary() {
    document.getElementById('confirm-check-in').textContent =
      fmtDate(document.getElementById('booking-check-in').value);
    document.getElementById('confirm-check-out').textContent =
      fmtDate(document.getElementById('booking-check-out').value);
    document.getElementById('confirm-guests').textContent =
      document.getElementById('booking-guests').value || '1';
  }

  function renderSelectedRoomCard(room, extrasNote = '') {
    const mount = document.getElementById('booking-selected-room');
    if (!room) {
      mount.innerHTML = '<p class="text-body-sm text-error">This room is no longer available for the selected dates.</p>';
      return;
    }
    const img = roomPreviewImage({
      roomNumber: room.room_number ?? room.roomNumber,
      roomType: room.room_type_label || room.room_type || room.roomType,
    });
    mount.innerHTML = `
      <div class="flex flex-col sm:flex-row gap-4">
        <div class="shrink-0 w-full sm:w-36 h-28 rounded-xl overflow-hidden bg-surface-container border border-outline-variant/60">
          <img src="${img}" alt="Room ${room.room_number} preview" class="w-full h-full object-cover" loading="lazy" />
        </div>
        <div class="flex flex-1 items-start justify-between gap-4 min-w-0">
          <div>
            <p class="text-label-sm text-primary font-semibold mb-0.5">${room.building_name}</p>
            <h4 class="font-headline-sm text-headline-sm text-on-surface">Room ${room.room_number}</h4>
            <p class="text-body-sm text-on-surface-variant mt-1">${room.room_type} · up to ${room.capacity_max} guests</p>
          </div>
          <div class="text-right shrink-0">
            <p class="font-bold text-primary text-headline-sm">${room.estimated_total != null ? peso(room.estimated_total) : '—'}</p>
            <p class="text-[11px] text-on-surface-variant uppercase">${room.nights} night(s) · room only</p>
          </div>
        </div>
      </div>${extrasNote}`;
  }

  function selectRoom(room) {
    const errorEl = document.getElementById('booking-form-error');
    if (room && !isRoomBookable(room.availability_status)) {
      selectedRoom = null;
      roomInput.value = '';
      submitBtn.disabled = true;
      errorEl.textContent = dormMinGuestsNotice(Number(document.getElementById('booking-guests').value) || 1)
        || 'This room cannot be booked for the current guest count.';
      errorEl.classList.remove('hidden');
      document.getElementById('booking-summary')?.classList.add('hidden');
      bookingExtras.reset();
      return;
    }
    errorEl.classList.add('hidden');
    selectedRoom = room;
    roomInput.value = room?.id ?? '';
    submitBtn.disabled = !room;
    updateBookingTotals();
  }

  function hideSuccessPanel() {
    successPanel.classList.add('hidden');
    formFields.classList.remove('hidden');
  }

  function finishClose() {
    closeModal(modal);
    form.reset();
    resetBookingResults();
    hideSuccessPanel();
    setBookingMode('search');
    savedTrip = null;
    browseReturnTo = null;
    resetCloseButton(closeBtn);
    document.getElementById('booking-form-error').classList.add('hidden');
    document.getElementById('booking-notes').value = '';
    bookingExtras.reset();
  }

  function closeBookingModal() {
    if (browseReturnTo) {
      const ctx = { ...browseReturnTo };
      browseReturnTo = null;
      resetCloseButton(closeBtn);
      finishClose();
      if (onBrowseReturn) {
        onBrowseReturn(ctx);
        return;
      }
      window.location.href = buildRoomPreviewUrl(ctx);
      return;
    }
    finishClose();
  }

  function applyFiscalDateLimits() {
    const checkInEl = document.getElementById('booking-check-in');
    const checkOutEl = document.getElementById('booking-check-out');
    const hintEl = document.getElementById('booking-window-hint');
    if (fiscalBounds) {
      applyBookingDateBounds(checkInEl, checkOutEl, fiscalBounds);
      if (hintEl) {
        const hint = formatBookingWindowHint(fiscalBounds);
        hintEl.textContent = hint;
        hintEl.classList.toggle('hidden', !hint);
      }
    } else {
      if (checkInEl) checkInEl.min = todayStr;
      if (checkOutEl) checkOutEl.min = todayStr;
      hintEl?.classList.add('hidden');
    }
  }

  function prefillTrip({ checkIn = '', checkOut = '', guests = '' } = {}) {
    if (checkIn) document.getElementById('booking-check-in').value = checkIn;
    if (checkOut) document.getElementById('booking-check-out').value = checkOut;
    if (guests) document.getElementById('booking-guests').value = guests;
    updateConfirmSummary();
  }

  function openSearchBooking(prefill = {}) {
    hideSuccessPanel();
    if (!prefill.checkIn && !prefill.checkOut) form.reset();
    resetBookingResults();
    document.getElementById('booking-form-error').classList.add('hidden');
    applyFiscalDateLimits();
    prefillTrip(prefill);
    setBookingMode('search');
    openModal(modal);
    if (prefill.checkIn && prefill.checkOut) {
      findRooms();
    }
  }

  async function openConfirmBooking({ roomId, checkIn, checkOut, guests }) {
    hideSuccessPanel();
    resetBookingResults();
    document.getElementById('booking-form-error').classList.add('hidden');
    applyFiscalDateLimits();
    prefillTrip({ checkIn, checkOut, guests: guests || '1' });
    setBookingMode('confirm');
    openModal(modal);
    submitBtn.disabled = true;

    browseReturnTo = { roomId, checkIn, checkOut, guests: guests || '1' };
    setBackButton(closeBtn);

    const previewWrap = document.getElementById('booking-selected-room-wrap');
    const previewMount = document.getElementById('booking-selected-room');
    previewWrap?.classList.remove('hidden');
    if (previewMount) {
      previewMount.innerHTML = `
        <div class="flex items-center gap-3 text-on-surface-variant text-body-sm">
          <span class="material-symbols-outlined animate-spin">progress_activity</span>
          Loading room details…
        </div>`;
    }

    const errorEl = document.getElementById('booking-form-error');
    try {
      const data = await getRoomAvailability({
        check_in: checkIn,
        check_out: checkOut,
        guest_count: Number(guests) || 1,
      });
      availableRooms = data.rooms || [];
      const room = availableRooms.find(
        (r) => String(r.id) === String(roomId) && r.availability_status === 'available' && !isBlockedBuilding(r.building_name),
      );
      if (!room) {
        errorEl.textContent = 'That room is no longer available for these dates. Pick another room or adjust your dates.';
        errorEl.classList.remove('hidden');
        setBookingMode('search');
        await findRooms(roomId);
        return;
      }
      selectRoom(room);
      lastRoomSearch = readRoomSearchSnapshot();
    } catch (err) {
      errorEl.textContent = err.message || 'Could not verify room availability';
      errorEl.classList.remove('hidden');
      setBookingMode('search');
    }
  }

  function renderRoomResults(preferredRoomId = '') {
    const wrap = document.getElementById('room-results-wrap');
    const list = document.getElementById('room-results');
    const countEl = document.getElementById('room-results-count');
    wrap.classList.remove('hidden');

    const bookable = availableRooms
      .filter((r) => isRoomListVisible(r.availability_status) && !isBlockedBuilding(r.building_name));

    countEl.textContent = `${bookable.length} shown`;

    if (!bookable.length) {
      list.innerHTML = '<p class="text-body-sm text-on-surface-variant py-4 text-center">No rooms available for these dates. Try different dates or guest count.</p>';
      return;
    }

    list.innerHTML = bookable.map((r) => {
      const guests = Number(document.getElementById('booking-guests').value) || 1;
      const perPerson = dormPriceLabel(r, guests, r.nights);
      const dormMin = r.availability_status === 'dorm_min_guests';
      const capLabel = r.room_type === 'Dorm'
        ? `Min ${r.dorm_booking_minimum || DORM_MIN_GUEST_COUNT} pax to book · up to ${r.capacity_max} guests`
        : `${r.capacity_min}–${r.capacity_max} guests`;
      const img = roomPreviewImage({
        roomNumber: r.room_number ?? r.roomNumber,
        roomType: r.room_type_label || r.room_type,
      });
      return `
        <button type="button" class="room-option w-full text-left p-3 rounded-xl border ${dormMin ? 'border-amber-300 bg-amber-50/40' : 'border-outline-variant hover:border-primary/50 bg-white'} flex items-center gap-3 ${String(r.id) === String(preferredRoomId) ? 'selected' : ''}" data-room-id="${r.id}">
          <div class="shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-surface-container border border-outline-variant/60">
            <img src="${img}" alt="Room ${r.room_number} preview" class="w-full h-full object-cover" loading="lazy" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="font-label-md font-bold text-body-sm">${r.building_name} ${r.room_number}</p>
            <p class="text-[11px] text-on-surface-variant">${r.room_type_label || r.room_type} · ${capLabel}</p>
            ${perPerson ? `<p class="text-[11px] text-on-surface-variant mt-0.5">${perPerson}</p>` : ''}
            ${dormMin ? `<p class="text-[11px] text-amber-800 mt-1 font-medium">Minimum ${r.dorm_booking_minimum || DORM_MIN_GUEST_COUNT} guests required to book.</p>` : ''}
          </div>
          <div class="text-right shrink-0">
            <p class="font-bold text-primary text-body-sm">${r.estimated_total != null ? peso(r.estimated_total) : '—'}</p>
            <p class="text-[10px] text-on-surface-variant uppercase">${r.nights} night(s)</p>
          </div>
        </button>`;
    }).join('');

    list.querySelectorAll('.room-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.roomId;
        const room = bookable.find((r) => String(r.id) === String(id));
        list.querySelectorAll('.room-option').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectRoom(room);
      });
    });

    if (preferredRoomId) {
      const preferred = bookable.find((r) => String(r.id) === String(preferredRoomId));
      if (preferred) selectRoom(preferred);
    }
  }

  async function findRooms(preferredRoomId = '') {
    const checkIn = document.getElementById('booking-check-in').value;
    const checkOut = document.getElementById('booking-check-out').value;
    const guests = Number(document.getElementById('booking-guests').value) || 1;
    const errorEl = document.getElementById('booking-form-error');
    errorEl.classList.add('hidden');
    updateConfirmSummary();

    if (!checkIn || !checkOut) {
      errorEl.textContent = 'Please choose check-in and check-out dates first.';
      errorEl.classList.remove('hidden');
      return;
    }
    if (new Date(checkOut) <= new Date(checkIn)) {
      errorEl.textContent = 'Check-out must be after check-in.';
      errorEl.classList.remove('hidden');
      return;
    }

    const btn = document.getElementById('find-rooms-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined text-[20px] animate-spin">progress_activity</span> Searching…';
    resetBookingResults();
    try {
      const data = await getRoomAvailability({ check_in: checkIn, check_out: checkOut, guest_count: guests });
      availableRooms = data.rooms || [];
      lastRoomSearch = readRoomSearchSnapshot();
      renderRoomResults(preferredRoomId);
    } catch (err) {
      errorEl.textContent = err.message || 'Could not load availability';
      errorEl.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-symbols-outlined text-[20px]">search</span> Find available rooms';
    }
  }

  function showBookingSuccess(room) {
    const checkIn = document.getElementById('booking-check-in').value;
    const checkOut = document.getElementById('booking-check-out').value;
    const guests = document.getElementById('booking-guests').value || '1';
    savedTrip = { checkIn, checkOut, guests };
    const label = room
      ? `${room.building_name} Room ${room.room_number}`
      : 'Your room';
    document.getElementById('booking-success-msg').textContent =
      `${label} for ${fmtDate(checkIn)} \u2192 ${fmtDate(checkOut)} is pending approval.`;
    formFields.classList.add('hidden');
    successPanel.classList.remove('hidden');
    browseReturnTo = null;
    resetCloseButton(closeBtn);
    setModalCopy({
      title: 'Request submitted',
      subtitle: 'Housing will review your request and notify you by email.',
    });
  }

  document.getElementById('find-rooms-btn')?.addEventListener('click', () => findRooms());
  ['booking-check-in', 'booking-check-out'].forEach((id) => {
    const el = document.getElementById(id);
    el?.addEventListener('change', onBookingCriteriaChange);
  });
  // Guests: change only — avoids mid-typing remounts when entering multi-digit counts (e.g. 25).
  document.getElementById('booking-guests')?.addEventListener('change', onBookingCriteriaChange);
  document.getElementById('booking-change-selection')?.addEventListener('click', () => {
    setBookingMode('search');
    findRooms(selectedRoom?.id || roomInput.value);
  });
  document.getElementById('booking-success-done')?.addEventListener('click', closeBookingModal);
  closeBtn?.addEventListener('click', closeBookingModal);
  document.getElementById('booking-cancel-btn')?.addEventListener('click', closeBookingModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeBookingModal(); });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('booking-form-error');
    if (readOnly) {
      errorEl.textContent = 'Your account cannot create reservations online. Please contact housing staff.';
      errorEl.classList.remove('hidden');
      return;
    }
    if (!roomInput.value) return;
    errorEl.classList.add('hidden');
    const checkIn = document.getElementById('booking-check-in').value;
    const checkOut = document.getElementById('booking-check-out').value;
    const guestCount = Number(document.getElementById('booking-guests').value) || 1;
    if (!checkIn || !checkOut) {
      errorEl.textContent = 'Please choose check-in and check-out dates.';
      errorEl.classList.remove('hidden');
      return;
    }
    if (new Date(checkOut) <= new Date(checkIn)) {
      errorEl.textContent = 'Check-out must be after check-in.';
      errorEl.classList.remove('hidden');
      return;
    }
    if (checkIn < todayStr) {
      errorEl.textContent = 'Check-in cannot be in the past.';
      errorEl.classList.remove('hidden');
      return;
    }
    if (selectedRoom?.room_type === 'Dorm' && guestCount < DORM_MIN_GUEST_COUNT) {
      errorEl.textContent = dormMinGuestsNotice(guestCount);
      errorEl.classList.remove('hidden');
      return;
    }
    if (!roomSearchMatchesSelection()) {
      errorEl.textContent = 'Your dates or guest count changed — search again and re-select a room.';
      errorEl.classList.remove('hidden');
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';
    const bookedRoom = selectedRoom;
    const { meals, fees, meal_allergen_notes } = bookingExtras.getPayload();
    try {
      const verify = await getRoomAvailability({
        check_in: checkIn,
        check_out: checkOut,
        guest_count: guestCount,
      });
      const stillAvailable = (verify.rooms || []).find(
        (r) => String(r.id) === String(roomInput.value) && r.availability_status === 'available',
      );
      if (!stillAvailable) {
        errorEl.textContent = 'That room is no longer available for these dates. Search again or pick another room.';
        errorEl.classList.remove('hidden');
        availableRooms = verify.rooms || [];
        lastRoomSearch = readRoomSearchSnapshot();
        invalidateRoomSelection();
        setBookingMode('search');
        renderRoomResults();
        return;
      }
      await createBooking({
        room_id: Number(roomInput.value),
        check_in: checkIn,
        check_out: checkOut,
        guest_count: guestCount,
        notes: document.getElementById('booking-notes').value.trim() || null,
        meals,
        fees,
        meal_allergen_notes,
      });
      if (onBookingCreated) await onBookingCreated();
      showBookingSuccess(bookedRoom);
    } catch (err) {
      errorEl.textContent = err.message || 'Booking failed';
      errorEl.classList.remove('hidden');
    } finally {
      submitBtn.disabled = !roomInput.value;
      submitBtn.textContent = 'Submit Request';
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!modal.classList.contains('is-hidden')) closeBookingModal();
  });

  return {
    openSearchBooking,
    openConfirmBooking,
    closeBookingModal,
  };
}
