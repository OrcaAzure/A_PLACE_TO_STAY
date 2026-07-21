import { requireAuth, applyRoleUI } from '/assets/js/services/auth.js';
  import { initAppLayout } from '/assets/js/layout/ui.js';
  import { initSplashIdle } from '/assets/js/layout/splash-idle.js';
  import { createBookingPoll } from '/assets/js/layout/booking-poll.js';
  import { jsonFingerprint } from '/assets/js/layout/silent-refresh.js';
  import { getRooms, getRoomAvailability, getRoomStayEstimate, normalizeRoom, getVenueFacilities, getVenueRateQuote, createFacilityBooking, checkVenueSlotAvailability } from '/assets/js/services/api.js';
  import {
    isAvailabilityBookable,
    isAvailabilityVisible,
    priceNoticeHtml,
    readBrowseQuery,
    isInternalGuest,
    resolveBrowseCategory,
    getBrowseCategoryMeta,
    categoryShowsRooms,
    canGuestAccessRoom,
    venueMatchesBrowseCategory,
    guestAccessNoticeHtml,
    parsePackageHours,
    formatVenueRateLabel,
    venueCapacityLabel,
    validateVenueCapacityClient,
    validateVenueDurationClient,
  } from '/assets/js/features/guest-booking-flow.js';
  import { initGuestRoomBookingModal } from '/assets/js/features/guest-room-booking-modal.js';
  import {
    getImagesByRoom,
    roomPreviewImage,
    venuePreviewImage,
    venueGalleryImages,
    roomTypeHighlights,
    registerRoomsUploadedImages,
    registerVenuesUploadedImages,
    registerVenueUploadedImages,
  } from '/assets/js/features/facility-display.js';
  import {
    addBookingRequestItem,
    sharedStayDates,
    assignedRoomGuests,
    loadBookingRequest,
    setGroupTotalGuests,
  } from '/assets/js/features/guest-booking-request-store.js';
  import {
    initBookingRequestChrome,
    showBookingRequestToast,
  } from '/assets/js/features/guest-booking-request-ui.js';
  import { openRoomGuestPicker } from '/assets/js/features/guest-room-guest-picker.js';
  import { DORM_MIN_GUEST_COUNT } from '/assets/js/features/reservation-shared.js';
  import {
    paintBrowseCategoryCards,
    buildBrowseCategoryCardsHtml,
  } from '/assets/js/features/guest-browse-categories.js';

async function bootGuestFacilitiesBrowse() {
function setMountHtml(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }

  await initSplashIdle({ portal: 'guest' });
  if (!(await requireAuth())) return;
  await initAppLayout({
    portal: 'guest',
    activePage: 'facilities',
  });

  const isInternal = isInternalGuest();
  // Paint categories immediately so a later boot error never leaves an empty mosaic.
  let selectedCategory = paintBrowseCategoryCards({
    selectedCategory: resolveBrowseCategory(readBrowseQuery().category),
    isInternal,
  });
  // Hide venue section for room categories right away (don't wait for full boot).
  document.getElementById('venues')?.classList.toggle('hidden', categoryShowsRooms(selectedCategory));
  document.getElementById('venues-mount')?.classList.toggle('hidden', categoryShowsRooms(selectedCategory));
  document.getElementById('browse-room-tools')?.classList.toggle('hidden', !categoryShowsRooms(selectedCategory));
  const activeCategoryLabel = document.getElementById('active-category-label');
  if (activeCategoryLabel) {
    activeCategoryLabel.textContent = `Selected · ${getBrowseCategoryMeta(selectedCategory, isInternal).label}`;
  }

  setMountHtml('browse-price-notice', priceNoticeHtml());
  setMountHtml('vbm-price-notice', priceNoticeHtml('mt-1'));
  setMountHtml('booking-price-notice', priceNoticeHtml());
  setMountHtml('guest-access-notice', guestAccessNoticeHtml(isInternal));

  const BLOCKED_BUILDINGS = [];
  const isBlocked = (n) => BLOCKED_BUILDINGS.includes(String(n || '').trim());

  const { readOnly } = applyRoleUI();

  let bookingRequestUi = { notifyAdded() {} };
  try {
    if (!readOnly) bookingRequestUi = initBookingRequestChrome({ openOnAdd: true });
  } catch (err) {
    console.error('[browse] Booking request chrome failed', err);
  }

  const roomBookingReady = initGuestRoomBookingModal({
    readOnly,
    blockedBuildings: BLOCKED_BUILDINGS,
    onBrowseReturn: ({ roomId }) => {
      if (roomId) openRoomPreview(roomId);
    },
  }).catch((err) => {
    console.error('[browse] Room booking modal failed to initialize', err);
    return {
      openSearchBooking() {},
      openConfirmBooking() {},
      closeBookingModal() {},
    };
  });

  const todayStr = new Date().toISOString().slice(0, 10);
  const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
  const fmtStayDate = (d) => {
    if (!d) return '—';
    const dt = new Date(`${d}T00:00:00`);
    return Number.isNaN(dt.getTime())
      ? d
      : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const roomResults = document.getElementById('browse-room-results');
  const refinePanel = document.getElementById('browse-refine-panel');
  const stayStatus = document.getElementById('browse-stay-status');
  const findRoomsBtn = document.getElementById('find-rooms');
  const findRoomsBtnText = findRoomsBtn?.querySelector('.browse-stay-submit-text');
  const checkInEl = document.getElementById('filter-check-in');
  const checkOutEl = document.getElementById('filter-check-out');
  const guestsEl = document.getElementById('filter-guests');
  const multiRoomEl = document.getElementById('filter-multi-room');
  const guestsLabelEl = document.querySelector('label[for="filter-guests"]');
  const stayPlannerDesc = document.querySelector('.browse-stay-planner-desc');

  const STAY_STORAGE_KEY = 'guest-browse-stay';
  let restoringStayCriteria = false;

  const TYPE_ICON = {
    'Dorm': 'bed',
    'Superior Guest Room': 'king_bed',
    'Standard Apartment': 'apartment',
    VIP: 'workspace_premium',
    'Deluxe 2 BR': 'meeting_room',
    'Deluxe 3 BR': 'meeting_room',
  };

  function isMultiRoomBrowse() {
    return Boolean(multiRoomEl?.checked);
  }

  function totalGroupGuests() {
    return Math.max(1, Number(guestsEl?.value || 1));
  }

  function remainingGroupGuests() {
    const assigned = assignedRoomGuests(loadBookingRequest());
    return Math.max(0, totalGroupGuests() - assigned);
  }

  function guestCountForRoom(room) {
    const total = totalGroupGuests();
    if (!isMultiRoomBrowse()) return total;

    const remaining = remainingGroupGuests();
    const cap = Number(room.capacityMax ?? room.capacity_max ?? 0) || 99;
    const min = Number(room.capacityMin ?? room.capacity_min ?? 1) || 1;
    const avail = availabilityForRoom(room.id);
    const isDorm = room.roomType === 'Dorm' || avail?.room_type === 'Dorm';
    const dormMin = Number(avail?.dorm_booking_minimum) || 5;

    if (remaining <= 0) {
      return null;
    }

    const allocation = Math.min(remaining, cap);
    if (isDorm && allocation < dormMin) {
      return null;
    }
    if (allocation < min) {
      return null;
    }
    return allocation;
  }

  function updateMultiRoomCopy() {
    const multi = isMultiRoomBrowse();
    if (guestsLabelEl) {
      guestsLabelEl.textContent = multi ? 'Total guests' : 'Guests';
    }
    if (stayPlannerDesc) {
      stayPlannerDesc.textContent = multi
        ? 'Enter your full group size, then add rooms one at a time until everyone has a bed.'
        : 'Please select your dates and guests below first.';
    }
  }

  function readStayFields() {
    return {
      checkIn: checkInEl?.value || '',
      checkOut: checkOutEl?.value || '',
      guests: guestsEl?.value || '1',
      multiRoom: isMultiRoomBrowse(),
    };
  }

  function writeStayFields({ checkIn, checkOut, guests, multiRoom } = {}) {
    if (checkIn != null && checkInEl) checkInEl.value = checkIn;
    if (checkOut != null && checkOutEl) checkOutEl.value = checkOut;
    if (guests != null && guestsEl) guestsEl.value = guests;
    if (multiRoom != null && multiRoomEl) multiRoomEl.checked = Boolean(multiRoom);
    updateMultiRoomCopy();
  }

  function persistStayCriteria() {
    if (restoringStayCriteria) return;
    const stay = readStayFields();
    try {
      sessionStorage.setItem(STAY_STORAGE_KEY, JSON.stringify(stay));
    } catch {
      /* ignore quota / private mode */
    }
  }

  function restoreStayCriteria() {
    try {
      const raw = sessionStorage.getItem(STAY_STORAGE_KEY);
      if (!raw) return false;
      const stay = JSON.parse(raw);
      restoringStayCriteria = true;
      writeStayFields(stay);
      ensureValidStayRange({ announce: false });
      return hasValidStayDates();
    } catch {
      return false;
    } finally {
      restoringStayCriteria = false;
    }
  }

  function syncSearchButtonLabel() {
    if (findRoomsBtnText) {
      findRoomsBtnText.textContent = isRoomBrowseUnlocked()
        ? 'Update available rooms'
        : 'See available rooms';
    }
  }

  function setStayStatus(message, tone = '') {
    if (!stayStatus) return;
    if (!message) {
      stayStatus.classList.add('hidden');
      stayStatus.textContent = '';
      stayStatus.className = 'browse-stay-status hidden';
      return;
    }
    stayStatus.textContent = message;
    stayStatus.className = `browse-stay-status browse-stay-status--${tone || 'neutral'}`;
    stayStatus.classList.remove('hidden');
  }

  let allRooms = [];
  let availability = null;
  let lastAvailabilityFingerprint = '';
  let lastSearchedStay = null;
  let filters = { building: '', type: '', search: '' };

  function hasValidStayDates() {
    const checkIn = checkInEl?.value;
    const checkOut = checkOutEl?.value;
    return Boolean(checkIn && checkOut && checkOut > checkIn);
  }

  /** Keep check-out after check-in. Returns true when dates were adjusted. */
  function ensureValidStayRange({ announce = false } = {}) {
    const checkIn = checkInEl?.value;
    const checkOut = checkOutEl?.value;
    if (!checkIn) {
      if (checkOutEl) checkOutEl.min = todayStr;
      return false;
    }
    if (checkOutEl) {
      const minOut = (() => {
        const next = new Date(`${checkIn}T00:00:00`);
        next.setDate(next.getDate() + 1);
        return next.toISOString().slice(0, 10);
      })();
      checkOutEl.min = minOut;
      if (!checkOut || checkOut <= checkIn) {
        checkOutEl.value = minOut;
        if (announce) {
          setAvailabilityFeedback('Check-out must be after check-in — updated to the next day.', true);
        }
        return true;
      }
    }
    return false;
  }

  function isRoomBrowseUnlocked() {
    return availability !== null;
  }

  function readStaySnapshot() {
    return {
      checkIn: checkInEl?.value || '',
      checkOut: checkOutEl?.value || '',
      guests: guestsEl?.value || '1',
      multiRoom: isMultiRoomBrowse(),
    };
  }

  function stayMatchesLastSearch() {
    if (!lastSearchedStay) return true;
    const current = readStaySnapshot();
    return current.checkIn === lastSearchedStay.checkIn
      && current.checkOut === lastSearchedStay.checkOut
      && String(current.guests) === String(lastSearchedStay.guests)
      && Boolean(current.multiRoom) === Boolean(lastSearchedStay.multiRoom);
  }

  function updateStayFormState() {
    if (findRoomsBtn) {
      findRoomsBtn.disabled = !hasValidStayDates();
      findRoomsBtn.classList.toggle('browse-stay-submit--stale', isRoomBrowseUnlocked() && !stayMatchesLastSearch());
      findRoomsBtn.title = hasValidStayDates()
        ? ''
        : 'Choose a check-out date after check-in to see available rooms';
    }
    syncSearchButtonLabel();
    document.getElementById('clear-stay-btn')?.classList.toggle(
      'hidden',
      !checkInEl?.value && !checkOutEl?.value,
    );
  }

  function onStayCriteriaChange() {
    persistStayCriteria();
    updateStayFormState();
    if (restoringStayCriteria) return;

    if (checkInEl?.value && checkOutEl?.value && checkOutEl.value <= checkInEl.value) {
      setAvailabilityFeedback('Check-out must be after check-in.', true);
      return;
    }

    if (!isRoomBrowseUnlocked()) {
      if (hasValidStayDates()) setAvailabilityFeedback('');
      return;
    }

    if (stayMatchesLastSearch()) {
      setAvailabilityFeedback('');
      return;
    }
    setAvailabilityFeedback('Stay details changed — click “Update available rooms” to refresh results.');
  }

  function updateRoomBrowseVisibility() {
    const showRooms = categoryShowsRooms(selectedCategory);
    const unlocked = isRoomBrowseUnlocked();

    roomResults?.classList.toggle('hidden', !showRooms || !unlocked);
    refinePanel?.classList.toggle('hidden', !showRooms || !unlocked);
  }

  function focusStayPlanner() {
    document.getElementById('browse-stay-planner')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    checkInEl?.focus();
  }

  function setAvailabilityFeedback(message, isError = false) {
    const note = document.getElementById('availability-note');
    const noteText = document.getElementById('availability-text');
    if (!note || !noteText) return;
    if (!message) {
      note.classList.add('hidden');
      note.classList.remove('is-error');
      noteText.textContent = '';
      return;
    }
    noteText.textContent = message;
    note.classList.toggle('is-error', isError);
    note.classList.remove('hidden');
  }

  function statusInfo(room) {
    if (availability) {
      const a = availabilityForRoom(room.id);
      const map = {
        available: { label: 'Available', cls: 'bg-emerald-500 text-white', bookable: true },
        dorm_min_guests: { label: 'Min 5 pax', cls: 'bg-amber-500 text-white', bookable: false },
        booked: { label: 'Booked', cls: 'bg-slate-600 text-white', bookable: false },
        occupied: { label: 'Occupied', cls: 'bg-slate-600 text-white', bookable: false },
        too_small: { label: 'Too Small', cls: 'bg-amber-500 text-white', bookable: false },
        dirty: { label: 'Being cleaned', cls: 'bg-orange-500 text-white', bookable: false },
        maintenance: { label: 'Out of order', cls: 'bg-red-500 text-white', bookable: false },
      };
      return map[a?.availability_status] || map.booked;
    }
    const map = {
      Available: { label: 'Available', cls: 'bg-emerald-500 text-white', bookable: true },
      Occupied: { label: 'Occupied', cls: 'bg-slate-600 text-white', bookable: false },
      Dirty: { label: 'Being cleaned', cls: 'bg-orange-500 text-white', bookable: false },
      Maintenance: { label: 'Out of order', cls: 'bg-red-500 text-white', bookable: false },
    };
    return map[room.status] || map.Occupied;
  }

  function categoryMeta(id) {
    return getBrowseCategoryMeta(id, isInternal);
  }

  function updateBrowseHeadings() {
    const meta = categoryMeta(selectedCategory);
    const subtitle = document.getElementById('browse-subtitle');
    const roomsHeading = document.getElementById('rooms');
    if (subtitle) {
      subtitle.textContent = categoryShowsRooms(selectedCategory)
        ? (isInternal
          ? 'Set your stay dates below, then browse open rooms across campus guest houses.'
          : 'Set your stay dates below, then browse open Global Missions Center rooms for your trip.')
        : `Browse ${meta.label.toLowerCase()} below — you'll set your date, time, and guest count when you reserve a space.`;
    }
    if (roomsHeading) {
      roomsHeading.textContent = 'Find your space';
    }
  }

  function renderCategoryCards() {
    const mount = document.getElementById('browse-category-cards');
    const label = document.getElementById('active-category-label');
    if (!mount) return;

    mount.innerHTML = buildBrowseCategoryCardsHtml(selectedCategory, isInternal);

    if (label) {
      label.textContent = `Selected · ${categoryMeta(selectedCategory).label}`;
    }
    updateBrowseHeadings();
    applyCategoryVisibility();
    updateRoomBrowseVisibility();
  }

  function setSelectedCategory(categoryId, { scroll = false } = {}) {
    selectedCategory = resolveBrowseCategory(categoryId);
    renderCategoryCards();
    render();
    renderVenues();
    if (scroll) {
      const anchor = categoryShowsRooms(selectedCategory)
        ? (document.getElementById('browse-stay-planner') || document.getElementById('browse-flow-anchor'))
        : document.getElementById('venues');
      anchor?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function applyCategoryVisibility() {
    const roomTools = document.getElementById('browse-room-tools');
    const venuesSection = document.getElementById('venues');
    const venuesBlock = document.getElementById('venues-mount');
    const showRooms = categoryShowsRooms(selectedCategory);
    roomTools?.classList.toggle('hidden', !showRooms);
    venuesSection?.classList.toggle('hidden', showRooms);
    venuesBlock?.classList.toggle('hidden', showRooms);
  }

  function roomFromAvailability(entry) {
    return {
      id: entry.id,
      building: entry.building_name,
      roomNumber: entry.room_number,
      roomType: entry.room_type,
      status: entry.status,
      capacityMin: entry.capacity_min,
      capacityMax: entry.capacity_max,
      description: entry.description || '',
      inclusions: entry.inclusions || entry.highlights || '',
      policies: entry.policies || '',
    };
  }

  function availabilityForRoom(roomId) {
    return availability?.get(String(roomId));
  }

  function roomsForFilters() {
    if (allRooms.length) return allRooms;
    if (!availability) return [];
    return [...availability.values()]
      .filter((a) => isAvailabilityVisible(a.availability_status))
      .map(roomFromAvailability)
      .filter((r) => canGuestAccessRoom(r, isInternal) && !isBlocked(r.building));
  }

  function applyFiltersToList(rooms) {
    const q = filters.search.trim().toLowerCase();
    return rooms.filter((r) => {
      if (filters.building && r.building !== filters.building) return false;
      if (filters.type && r.roomType !== filters.type) return false;
      if (q && !`${r.building} ${r.roomNumber} ${r.roomType}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function visibleRooms() {
    if (!isRoomBrowseUnlocked() || !availability) return [];
    if (!categoryShowsRooms(selectedCategory)) return [];

    const visible = [...availability.values()]
      .filter((a) => isAvailabilityVisible(a.availability_status))
      .filter((a) => !isBlocked(a.building_name))
      .map(roomFromAvailability)
      .filter((r) => canGuestAccessRoom(r, isInternal));

    return applyFiltersToList(visible);
  }

  function priceFor(room) {
    const a = availabilityForRoom(room.id);
    if (!a) return null;
    return { perNight: a.price_per_night, total: a.estimated_total, nights: a.nights };
  }

  function renderFilters() {
    const source = roomsForFilters();
    const buildings = [...new Set(source.map((r) => r.building))].sort();
    const types = [...new Set(
      source.map((r) => String(r.roomType || '').trim()).filter(Boolean),
    )].sort();

    if (filters.type && !types.includes(filters.type)) {
      filters.type = '';
    }
    const buildingWrap = document.getElementById('building-filter-wrap');
    const buildingSelect = document.getElementById('building-select');

    if (buildings.length <= 1) {
      filters.building = '';
      buildingWrap?.classList.add('hidden');
    } else if (buildingWrap && buildingSelect) {
      buildingWrap.classList.remove('hidden');
      buildingSelect.innerHTML =
        `<option value="">All buildings</option>${buildings.map((b) => `<option value="${b}" ${filters.building === b ? 'selected' : ''}>${b}</option>`).join('')}`;
    }

    const typeBtn = (active, label, value) =>
      `<button type="button" data-type="${value}" class="browse-type-opt ${active ? 'is-active' : ''}" aria-pressed="${active ? 'true' : 'false'}">${label}</button>`;

    const typeFilters = document.getElementById('type-filters');
    if (typeFilters) {
      typeFilters.innerHTML =
        typeBtn(filters.type === '', 'All types', '') +
        types.map((t) => typeBtn(filters.type === t, t, t)).join('');
    }
  }

  async function addRoomToBookingRequest(roomId) {
    const room = visibleRooms().find((r) => String(r.id) === String(roomId))
      || roomsForFilters().find((r) => String(r.id) === String(roomId));
    if (!room) return;

    if (!stayMatchesLastSearch()) {
      showBookingRequestToast('Set your stay dates first, then add rooms to your request.', { error: true });
      return;
    }

    const checkIn = checkInEl.value;
    const checkOut = checkOutEl.value;
    const shared = sharedStayDates();
    if (shared && (shared.checkIn !== checkIn || shared.checkOut !== checkOut)) {
      showBookingRequestToast('All rooms in one request must use the same check-in and check-out dates.', { error: true });
      return;
    }

    const avail = availabilityForRoom(room.id);
    const isDorm = room.roomType === 'Dorm' || avail?.room_type === 'Dorm';
    const physicalMin = Number(room.capacityMin ?? room.capacity_min ?? 1) || 1;
    const capacityMax = Number(room.capacityMax ?? room.capacity_max ?? 99) || 99;
    const dormMin = Number(avail?.dorm_booking_minimum) || DORM_MIN_GUEST_COUNT;
    const minGuests = isDorm ? Math.max(physicalMin, dormMin) : physicalMin;

    let guestCount;
    let estimatedTotal;
    let pricePerNight;
    let occupancyItem;

    if (isMultiRoomBrowse()) {
      if (remainingGroupGuests() <= 0) {
        showBookingRequestToast('All guests are already assigned to rooms in your request.', { error: true });
        return;
      }

      const defaultCount = guestCountForRoom(room);
      if (defaultCount == null) {
        showBookingRequestToast(
          isDorm
            ? `This dorm needs at least ${dormMin} guests per room. You have ${remainingGroupGuests()} guest${remainingGroupGuests() === 1 ? '' : 's'} left to assign.`
            : 'Not enough guests left to fill this room at its minimum capacity.',
          { error: true },
        );
        return;
      }

      const remaining = remainingGroupGuests();
      const pickerMax = remaining > 0 ? Math.min(capacityMax, remaining) : capacityMax;
      if (pickerMax < minGuests) {
        showBookingRequestToast(
          isDorm
            ? `This dorm needs at least ${dormMin} guests per room. You have ${remaining} guest${remaining === 1 ? '' : 's'} left to assign.`
            : 'Not enough guests left to fill this room at its minimum capacity.',
          { error: true },
        );
        return;
      }

      const picked = await openRoomGuestPicker({
        roomLabel: `${room.building} · Room ${room.roomNumber}`,
        roomType: room.roomType,
        roomId: room.id,
        checkIn,
        checkOut,
        minGuests,
        maxGuests: pickerMax,
        defaultGuestCount: Math.min(defaultCount, pickerMax),
        isDorm,
      });
      if (!picked) return;

      guestCount = picked.guestCount;
      estimatedTotal = picked.estimate.estimated_total;
      pricePerNight = picked.estimate.price_per_night;
      occupancyItem = picked.estimate.occupancy_item;
    } else {
      guestCount = totalGroupGuests();
      try {
        const estimate = await getRoomStayEstimate({
          room_id: room.id,
          check_in: checkIn,
          check_out: checkOut,
          guest_count: guestCount,
        });
        estimatedTotal = estimate.estimated_total;
        pricePerNight = estimate.price_per_night;
        occupancyItem = estimate.occupancy_item;
      } catch (err) {
        showBookingRequestToast(err.message || 'Could not add room.', { error: true });
        return;
      }
    }

    try {
      if (isMultiRoomBrowse()) {
        setGroupTotalGuests(totalGroupGuests());
      }
      addBookingRequestItem({
        kind: 'room',
        roomId: room.id,
        roomNumber: room.roomNumber,
        building: room.building,
        roomType: room.roomType,
        checkIn,
        checkOut,
        guestCount,
        estimatedTotal,
        pricePerNight,
        occupancyItem,
        capacityMin: physicalMin,
        capacityMax,
        isDorm,
        dormBookingMinimum: isDorm ? dormMin : null,
      });
      const assigned = assignedRoomGuests(loadBookingRequest());
      const total = totalGroupGuests();
      if (isMultiRoomBrowse()) {
        showBookingRequestToast(
          assigned >= total
            ? `Room added — all ${total} guests are covered.`
            : `Room added — ${assigned} of ${total} guests assigned. Add more rooms to cover everyone.`,
        );
      } else {
        showBookingRequestToast('Room added to booking request');
      }
      bookingRequestUi.notifyAdded();
      closeBrowsePreview();
    } catch (err) {
      showBookingRequestToast(err.message || 'Could not add room.', { error: true });
    }
  }

  function roomReserveControl(room, { compact = false } = {}) {
    const avail = availabilityForRoom(room.id);
    const st = statusInfo(room);
    const cardBase = 'mt-auto w-full py-3 rounded-xl font-bold text-label-md';
    if (readOnly) {
      return compact
        ? `<div class="browse-preview__cta text-center bg-surface-container-low text-outline border border-outline-variant/50 flex items-center justify-center gap-1.5"><span class="material-symbols-outlined text-[18px]">visibility</span>View only</div>`
        : `<div class="${cardBase} text-center bg-surface-container-low text-outline border border-outline-variant/50 flex items-center justify-center gap-1.5"><span class="material-symbols-outlined text-[18px]">visibility</span>View only</div>`;
    }
    if (st.bookable && stayMatchesLastSearch()) {
      if (compact) {
        return `
          <button type="button" class="browse-preview__cta browse-preview__cta--secondary" data-room-add-request="${escapeHtml(String(room.id))}" data-preview-stop>Add to booking request</button>
          <button type="button" class="browse-preview__cta browse-preview__cta--primary" data-room-book="${escapeHtml(String(room.id))}" data-preview-stop>Reserve this room</button>`;
      }
      return `
        <button type="button" class="mt-auto w-full py-3 rounded-xl font-bold text-label-md border border-primary text-primary hover:bg-primary hover:text-white transition-colors" data-room-add-request="${escapeHtml(String(room.id))}">Add to booking request</button>
        <button type="button" class="w-full py-3 rounded-xl font-bold text-label-md bg-primary text-white hover:bg-primary/90 transition-colors" data-room-book="${escapeHtml(String(room.id))}">Reserve this room</button>`;
    }
    if (st.bookable && !stayMatchesLastSearch()) {
      return `<button type="button" class="browse-preview__ghost" data-refresh-stay-search data-preview-stop>Update search to reserve</button>`;
    }
    const dormNote = avail?.availability_status === 'dorm_min_guests'
      ? ` · Min ${avail?.dorm_booking_minimum || 5} guests`
      : '';
    return `<button disabled class="browse-preview__ghost">${st.label}${dormNote}</button>`;
  }

  function roomViewDetailsControl() {
    return `<button type="button" class="mt-auto w-full py-3 rounded-xl font-bold text-label-md border border-primary text-primary hover:bg-primary hover:text-white transition-colors cursor-pointer" data-preview-open>
      <span class="inline-flex items-center justify-center gap-1.5">
        <span class="material-symbols-outlined text-[18px]" aria-hidden="true">photo_library</span>
        View details
      </span>
    </button>`;
  }

  function roomCard(room, { silent = false } = {}) {
    const avail = availabilityForRoom(room.id);
    const st = statusInfo(room);
    const price = priceFor(room);
    const icon = TYPE_ICON[room.roomType] || 'meeting_room';
    const images = getImagesByRoom(room);
    const img = images[0] || roomPreviewImage(room);
    const galleryCount = images.length;
    const priceLine = price && price.perNight != null
      ? `<p class="text-body-sm text-on-surface-variant mb-4">${peso(price.perNight)} / night · ${price.nights} night(s)</p>`
      : '<div class="mb-4"></div>';
    const dormNotice = avail?.availability_status === 'dorm_min_guests'
      ? `<p class="text-body-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">Minimum ${avail?.dorm_booking_minimum || 5} guests required to book this dorm.</p>`
      : '';
    return `
      <article
        class="browse-room-card browse-space-card${silent ? '' : ' reveal'}"
        data-preview-room="${escapeHtml(String(room.id))}"
        role="button"
        tabindex="0"
        aria-label="View details for room ${escapeHtml(String(room.roomNumber))}"
      >
        <div class="browse-room-card__media">
          <img src="${img}" alt="${room.roomType} room ${room.roomNumber}" loading="lazy" />
          <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent"></div>
          <div class="absolute top-3 left-3">
            <span class="${st.cls} px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest shadow">${st.label}</span>
          </div>
          <span class="browse-space-card__photos">
            <span class="material-symbols-outlined text-[16px]" aria-hidden="true">photo_library</span>
            ${galleryCount} photos
          </span>
        </div>
        <div class="browse-room-card__body">
          <div class="flex justify-between items-start gap-3 mb-1">
            <div>
              <p class="text-label-sm text-primary font-semibold mb-0.5">${room.building}</p>
              <h3 class="text-xl md:text-2xl font-bold text-on-surface flex items-center gap-2">
                <span class="material-symbols-outlined text-primary/80 text-[22px]">${icon}</span>
                Room ${room.roomNumber}
              </h3>
            </div>
            <div class="flex items-center gap-1.5 text-on-surface-variant bg-surface-container px-2.5 py-1 rounded-lg shrink-0">
              <span class="material-symbols-outlined text-[18px]">group</span>
              <span class="font-label-sm font-semibold">${room.capacityMin}-${room.capacityMax}</span>
            </div>
          </div>
          <p class="text-body-sm text-on-surface-variant mb-1">${room.roomType}</p>
          ${dormNotice}
          ${priceLine}
          ${roomViewDetailsControl()}
        </div>
      </article>`;
  }

  function render({ silent = false } = {}) {
    const mount = document.getElementById('rooms-mount');
    if (!mount) return;
    applyCategoryVisibility();
    updateRoomBrowseVisibility();

    if (!isRoomBrowseUnlocked()) {
      mount.innerHTML = '';
      return;
    }

    const rooms = visibleRooms();
    if (!rooms.length) {
      const hasFilters = filters.type || filters.search.trim() || filters.building;
      const msg = hasFilters
        ? 'No rooms match your filters for these dates. Try clearing filters or adjusting guest count.'
        : (isMultiRoomBrowse()
          ? 'No rooms are available for these dates. Try different dates or a smaller group size.'
          : `No rooms fit all ${totalGroupGuests()} guest${totalGroupGuests() === 1 ? '' : 's'} in one room. Turn on <span class="font-semibold">We need multiple rooms</span> above to book several rooms for your group.`);
      mount.innerHTML = `<div class="text-center py-16 text-on-surface-variant"><span class="material-symbols-outlined text-[48px] mb-2 block">search_off</span><p class="max-w-md mx-auto">${msg}</p></div>`;
      return;
    }
    // Group by building
    const groups = {};
    rooms.forEach((r) => { (groups[r.building] = groups[r.building] || []).push(r); });
    mount.innerHTML = Object.keys(groups).sort().map((building) => `
      <div class="space-y-5">
        <div class="flex items-center gap-4">
          <h4 class="font-headline-sm text-on-surface-variant whitespace-nowrap">${building}</h4>
          <span class="text-label-sm text-outline">${groups[building].length} room(s)</span>
          <div class="h-[1px] w-full bg-outline-variant/30"></div>
        </div>
        <div class="grid grid-cols-1 gap-5">
          ${groups[building].map((room) => roomCard(room, { silent })).join('')}
        </div>
      </div>`).join('');
  }

  async function loadRooms() {
    try {
      const rooms = await getRooms();
      allRooms = rooms
        .map((r) => ({ ...normalizeRoom(r), capacityMin: r.capacity_min, capacityMax: r.capacity_max }))
        .filter((r) => !isBlocked(r.building))
        .filter((r) => canGuestAccessRoom(r, isInternal));
      // Bind DB galleries into runtime maps keyed by room number (e.g. '202').
      registerRoomsUploadedImages(allRooms);
      renderCategoryCards();
      renderFilters();
      if (isRoomBrowseUnlocked()) render();
    } catch (err) {
      document.getElementById('rooms-mount').innerHTML =
        `<div class="text-center py-16 text-error"><span class="material-symbols-outlined text-[40px] mb-2 block">error</span><p>${err.message}</p></div>`;
    }
  }

  async function checkAvailability({ background = false } = {}) {
    const checkIn = checkInEl.value;
    const checkOut = checkOutEl.value;
    const guests = Number(guestsEl.value) || 1;

    if (!checkIn || !checkOut) {
      if (!background) setAvailabilityFeedback('Please choose both check-in and check-out dates.', true);
      return;
    }
    if (new Date(checkOut) <= new Date(checkIn)) {
      if (!background) setAvailabilityFeedback('Check-out must be after check-in.', true);
      return;
    }

    if (!background) {
      findRoomsBtn.disabled = true;
      findRoomsBtn.classList.add('is-loading');
      if (findRoomsBtnText) findRoomsBtnText.textContent = 'Checking…';
      setAvailabilityFeedback('');
    }
    try {
      const data = await getRoomAvailability({
        check_in: checkIn,
        check_out: checkOut,
        guest_count: guests,
        group_picker: isMultiRoomBrowse(),
      });
      availability = new Map((data.rooms || []).map((r) => [String(r.id), r]));
      const fp = jsonFingerprint(data.rooms || []);
      if (background && fp === lastAvailabilityFingerprint) return;
      lastAvailabilityFingerprint = fp;
      lastSearchedStay = readStaySnapshot();
      const availCount = (data.rooms || []).filter(
        (r) => isAvailabilityVisible(r.availability_status)
          && !isBlocked(r.building_name)
          && canGuestAccessRoom({ building: r.building_name }, isInternal),
      ).length;
      const bookCount = (data.rooms || []).filter(
        (r) => isAvailabilityBookable(r.availability_status)
          && !isBlocked(r.building_name)
          && canGuestAccessRoom({ building: r.building_name }, isInternal),
      ).length;
      updateRoomBrowseVisibility();
      if (!background) renderFilters();
      render({ silent: background });
      if (!background) {
        persistStayCriteria();
        setStayStatus(`${bookCount} room${bookCount === 1 ? '' : 's'} ready to book`, bookCount > 0 ? 'success' : 'warn');
        setAvailabilityFeedback(
          availCount > 0
            ? (isMultiRoomBrowse()
              ? (bookCount > 0
                ? `Showing ${bookCount} room${bookCount === 1 ? '' : 's'} that can host part of your group of ${guests}. Add each room to your booking request.`
                : `Showing ${availCount} dorm${availCount === 1 ? '' : 's'} — some need at least 5 guests per room.`)
              : (bookCount > 0
                ? `Showing ${availCount} room${availCount === 1 ? '' : 's'} for ${fmtStayDate(checkIn)} → ${fmtStayDate(checkOut)} (${bookCount} ready to book).`
                : `Showing ${availCount} dorm${availCount === 1 ? '' : 's'} — increase guests to at least 5 to book.`))
            : (isMultiRoomBrowse()
              ? `No rooms are open for these dates. Try different dates or adjust your group size.`
              : 'No rooms are open for these dates. Try different dates or guest count. For large groups, turn on “We need multiple rooms”.'),
        );
        document.getElementById('rooms-mount')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (err) {
      if (background) return;
      availability = null;
      updateRoomBrowseVisibility();
      render();
      setStayStatus('');
      setAvailabilityFeedback(err.message || 'Could not check availability.', true);
    } finally {
      if (!background) {
        findRoomsBtn.classList.remove('is-loading');
        updateStayFormState();
      }
    }
  }

  function clearDates() {
    availability = null;
    lastSearchedStay = null;
    writeStayFields({ checkIn: '', checkOut: '', guests: '1', multiRoom: false });
    try {
      sessionStorage.removeItem(STAY_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    filters.type = '';
    filters.search = '';
    filters.building = '';
    document.getElementById('room-search').value = '';
    setAvailabilityFeedback('');
    setStayStatus('');
    updateStayFormState();
    updateRoomBrowseVisibility();
    renderFilters();
    render();
    focusStayPlanner();
  }

  findRoomsBtn?.addEventListener('click', checkAvailability);
  document.getElementById('clear-stay-btn')?.addEventListener('click', clearDates);
  checkInEl?.addEventListener('change', () => {
    ensureValidStayRange({ announce: true });
    onStayCriteriaChange();
  });
  checkOutEl?.addEventListener('change', () => {
    ensureValidStayRange({ announce: true });
    onStayCriteriaChange();
  });
  guestsEl?.addEventListener('change', () => {
    persistStayCriteria();
    updateStayFormState();
    if (isMultiRoomBrowse()) {
      setGroupTotalGuests(totalGroupGuests());
    }
    onStayCriteriaChange();
  });
  // Don't bind guests on every keystroke — multi-digit values like 25 must finish typing first.
  multiRoomEl?.addEventListener('change', () => {
    updateMultiRoomCopy();
    if (isMultiRoomBrowse()) {
      setGroupTotalGuests(totalGroupGuests());
    }
    onStayCriteriaChange();
    if (isRoomBrowseUnlocked() && hasValidStayDates()) {
      checkAvailability();
    }
  });
  if (checkInEl) checkInEl.min = todayStr;
  if (checkOutEl) checkOutEl.min = todayStr;
  ensureValidStayRange({ announce: false });
  updateStayFormState();
  updateMultiRoomCopy();

  document.getElementById('building-select')?.addEventListener('change', (e) => {
    filters.building = e.target.value;
    render();
  });
  document.getElementById('type-filters')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-type]');
    if (!btn) return;
    filters.type = btn.dataset.type;
    renderFilters();
    render();
  });
  document.getElementById('browse-category-cards')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-category]');
    if (!btn) return;
    setSelectedCategory(btn.dataset.category, { scroll: true });
  });
  document.getElementById('rooms-mount')?.addEventListener('click', (e) => {
    if (e.target.closest('[data-preview-stop]')) return;

    if (e.target.closest('[data-refresh-stay-search]')) {
      e.stopPropagation();
      checkAvailability();
      return;
    }

    const roomAddBtn = e.target.closest('[data-room-add-request]');
    if (roomAddBtn) {
      e.preventDefault();
      e.stopPropagation();
      void addRoomToBookingRequest(roomAddBtn.dataset.roomAddRequest);
      return;
    }

    const roomBookBtn = e.target.closest('[data-room-book]');
    if (roomBookBtn) {
      e.preventDefault();
      e.stopPropagation();
      const roomId = roomBookBtn.dataset.roomBook;
      if (!roomId) return;
      void roomBookingReady.then((roomBooking) => {
        const room = visibleRooms().find((r) => String(r.id) === String(roomId))
          || roomsForFilters().find((r) => String(r.id) === String(roomId));
        const guestsForRoom = room ? guestCountForRoom(room) : (guestsEl?.value || '1');
        roomBooking.openConfirmBooking({
          roomId,
          checkIn: checkInEl?.value,
          checkOut: checkOutEl?.value,
          guests: guestsForRoom || guestsEl?.value || '1',
        });
      });
      return;
    }

    // Whole card is clickable (CSS cursor:pointer) — open the same preview as "View details".
    const card = e.target.closest('[data-preview-room]');
    if (card) {
      e.preventDefault();
      openRoomPreview(card.dataset.previewRoom);
    }
  });

  document.getElementById('venues-mount')?.addEventListener('click', (e) => {
    if (e.target.closest('[data-preview-stop]')) return;
    // Facility cards previously only opened via the button; match room UX — click anywhere on the card.
    const card = e.target.closest('[data-preview-venue]');
    if (!card) return;
    e.preventDefault();
    openVenuePreview(card.dataset.previewVenue);
  });

  // Keyboard: Enter/Space on focused cards opens the preview modal.
  document.getElementById('rooms-mount')?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('[data-preview-room]');
    if (!card || e.target !== card) return;
    e.preventDefault();
    openRoomPreview(card.dataset.previewRoom);
  });
  document.getElementById('venues-mount')?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('[data-preview-venue]');
    if (!card || e.target !== card) return;
    e.preventDefault();
    openVenuePreview(card.dataset.previewVenue);
  });

  let searchTimer;
  document.getElementById('room-search')?.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { filters.search = e.target.value; render(); }, 200);
  });

  // ---- Venue section ----
  function escapeHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // Collapse rows that share a physical space (same category + name + code)
  // into one venue with multiple "uses" so guests see a single card with a
  // use dropdown (e.g. GMC Chapel → Church / Wedding).
  function buildVenueGroups(grouped) {
    const byKey = new Map();
    for (const group of grouped || []) {
      for (const item of group.items || []) {
        const regular = item.rates?.find((r) => r.season === 'Regular');
        const peak = item.rates?.find((r) => r.season === 'Peak');
        const key = `${group.category}\x1f${item.name || ''}\x1f${item.room_code || ''}`;
        if (!byKey.has(key)) {
          byKey.set(key, {
            key,
            category: group.category,
            name: item.name,
            room_code: item.room_code,
            description: item.description || '',
            capacity_min: item.capacity_min ?? null,
            capacity_max: item.capacity_max ?? null,
            min_hours: item.min_hours ?? null,
            hourly_rate: item.hourly_rate ?? null,
            inclusions: item.inclusions || '',
            policies: item.policies || '',
            preview_images: Array.isArray(item.preview_images) ? item.preview_images.filter(Boolean) : [],
            uses: [],
          });
        } else {
          const existing = byKey.get(key);
          if (!existing.description && item.description) existing.description = item.description;
          if (!existing.inclusions && item.inclusions) existing.inclusions = item.inclusions;
          if (!existing.policies && item.policies) existing.policies = item.policies;
          const imgs = Array.isArray(item.preview_images) ? item.preview_images.filter(Boolean) : [];
          if (imgs.length > (existing.preview_images || []).length) existing.preview_images = imgs;
        }
        byKey.get(key).uses.push({
          facilityId: item.facility_id,
          functionName: item.package_name || '',
          item: item.item,
          label: item.label || item.name || item.item,
          capacity_min: item.capacity_min ?? null,
          capacity_max: item.capacity_max ?? null,
          min_hours: item.min_hours ?? null,
          inclusions: item.inclusions || '',
          policies: item.policies || '',
          regularRate: regular?.rate ?? null,
          peakRate: peak?.rate ?? null,
        });
      }
    }
    return [...byKey.values()];
  }

  function venueRateSummary(venue) {
    const rates = venue.uses.map((u) => u.regularRate).filter((r) => r != null);
    if (!rates.length) return '—';
    const min = Math.min(...rates);
    const many = venue.uses.length > 1;
    const base = `₱${Number(min).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
    if (venue.min_hours) return `${many ? 'From ' : ''}${base} · ${venue.min_hours}-hr minimum`;
    return `${many ? 'From ' : ''}${base} / hr`;
  }

  function venueCapacityText(venue) {
    const min = venue.capacity_min;
    const max = venue.capacity_max;
    if (min != null && max != null) return `${min}–${max} guests`;
    if (max != null) return `Up to ${max} guests`;
    if (min != null) return `From ${min} guests`;
    return '';
  }

  function venueCard(venue) {
    const cap = venueCapacityText(venue);
    const usesNote = venue.uses.length > 1
      ? `<p class="text-label-sm text-on-surface-variant mb-2"><span class="material-symbols-outlined text-[15px] align-middle">tune</span> ${venue.uses.length} uses available</p>`
      : '';
    const blurb = venue.description || venue.inclusions;
    const blurbNote = blurb
      ? `<p class="text-body-sm text-on-surface-variant mb-2 line-clamp-2">${escapeHtml(blurb)}</p>`
      : '';
    const galleryVenue = {
      name: venue.name,
      category: venue.category,
      facility_group: venue.category,
      room_code: venue.room_code,
      item: venue.uses?.[0]?.item,
      preview_images: venue.preview_images || [],
    };
    const img = venuePreviewImage(galleryVenue);
    const galleryCount = venueGalleryImages(galleryVenue).length;
    return `
      <article
        class="browse-venue-card browse-space-card flex flex-col bg-white rounded-2xl overflow-hidden border border-outline-variant hover:border-primary/40 hover:shadow-xl transition-all duration-300 reveal"
        data-preview-venue="${escapeHtml(venue.key)}"
        role="button"
        tabindex="0"
        aria-label="View details for ${escapeHtml(venue.name)}"
      >
        <div class="browse-venue-card__media">
          <img src="${escapeHtml(img)}" alt="" loading="lazy" class="w-full h-full object-cover" />
          <span class="browse-space-card__photos">
            <span class="material-symbols-outlined text-[16px]" aria-hidden="true">photo_library</span>
            ${galleryCount} photos
          </span>
        </div>
        <div class="p-5 flex flex-col flex-1">
          <p class="text-label-sm text-primary font-medium mb-1">${escapeHtml(venue.category)}</p>
          <h3 class="font-headline-sm text-on-surface mb-1">${escapeHtml(venue.name)}${venue.room_code ? ` <span class="text-on-surface-variant font-normal">(${escapeHtml(venue.room_code)})</span>` : ''}</h3>
          <p class="text-body-sm text-on-surface-variant mb-1">${venueRateSummary(venue)}</p>
          ${cap ? `<p class="text-label-sm text-on-surface-variant mb-2"><span class="material-symbols-outlined text-[15px] align-middle">group</span> ${escapeHtml(cap)}</p>` : ''}
          ${usesNote}
          ${blurbNote}
          <button type="button"
            class="mt-auto w-full border border-primary text-primary rounded-lg py-2 text-label-sm hover:bg-primary hover:text-white transition-colors"
            data-preview-open
            aria-label="View photos and details for ${escapeHtml(venue.name)}">
            <span class="inline-flex items-center justify-center gap-1.5">
              <span class="material-symbols-outlined text-[16px]" aria-hidden="true">photo_library</span>
              View details
            </span>
          </button>
        </div>
      </article>`;
  }

  let allVenues = [];

  function venueGroupMatchesCategory(venue, cat) {
    return venue.uses.some((u) => venueMatchesBrowseCategory({ category: venue.category, item: u.item }, cat));
  }

  function renderVenues() {
    const mount = document.getElementById('venues-mount');
    if (!mount) return;
    const venuesToShow = allVenues.filter((v) => venueGroupMatchesCategory(v, selectedCategory));
    if (!venuesToShow.length) {
      mount.innerHTML = '<p class="text-body-sm text-on-surface-variant">No venues available for this category.</p>';
      return;
    }
    const groups = {};
    venuesToShow.forEach((v) => { (groups[v.category] = groups[v.category] || []).push(v); });
    mount.innerHTML = Object.keys(groups).sort().map(cat => `
      <div class="space-y-5">
        <div class="flex items-center gap-4">
          <h4 class="font-headline-sm text-on-surface-variant whitespace-nowrap">${escapeHtml(cat)}</h4>
          <div class="h-[1px] w-full bg-outline-variant/30"></div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          ${groups[cat].map(venueCard).join('')}
        </div>
      </div>`).join('');
  }

  async function loadVenues() {
    const mount = document.getElementById('venues-mount');
    try {
      const grouped = await getVenueFacilities({ fresh: true });
      allVenues = buildVenueGroups(grouped);
      registerVenuesUploadedImages(allVenues);
      if (!allVenues.length) {
        mount.innerHTML = '<p class="text-body-sm text-on-surface-variant">No venues available.</p>';
        return;
      }
      renderVenues();
    } catch (err) {
      mount.innerHTML = `<div class="text-center py-8 text-error"><p>${err.message}</p></div>`;
    }
  }

  // ---- Browse preview (photos + details) ----
  const previewModal = document.getElementById('browse-preview-modal');
  if (previewModal && previewModal.parentElement !== document.body) {document.body.appendChild(previewModal);}
  const previewImage = document.getElementById('browse-preview-image');
  const previewThumbs = document.getElementById('browse-preview-thumbs');
  const previewCounter = document.getElementById('browse-preview-counter');
  const previewEyebrow = document.getElementById('browse-preview-eyebrow');
  const previewTitle = document.getElementById('browse-preview-title');
  const previewMeta = document.getElementById('browse-preview-meta');
  const previewBody = document.getElementById('browse-preview-body');
  const previewActions = document.getElementById('browse-preview-actions');
  const previewPrevBtn = previewModal?.querySelector('[data-preview-prev]');
  const previewNextBtn = previewModal?.querySelector('[data-preview-next]');

  const previewState = {
    kind: null,
    images: [],
    index: 0,
    roomId: null,
    venueKey: null,
  };

  function splitDetailLines(text) {
    return String(text || '')
      .split(/\n+|;\s*|,\s+(?=[A-Z])/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function highlightChipsHtml(items) {
    if (!items?.length) return '';
    return `<ul class="browse-preview__chips">${items.map((item) => `
      <li>
        <span class="material-symbols-outlined" aria-hidden="true">${escapeHtml(item.icon || 'check')}</span>
        ${escapeHtml(item.label)}
      </li>`).join('')}</ul>`;
  }

  function detailBlockHtml(title, text, { list = false } = {}) {
    if (!text) return '';
    if (list) {
      const lines = splitDetailLines(text);
      if (!lines.length) return '';
      return `<section class="browse-preview__section">
        <h4>${escapeHtml(title)}</h4>
        <ul class="browse-preview__list">${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
      </section>`;
    }
    return `<section class="browse-preview__section">
      <h4>${escapeHtml(title)}</h4>
      <p>${escapeHtml(text)}</p>
    </section>`;
  }

  function resetPreviewStage() {
    const frame = previewModal?.querySelector('.browse-preview__frame');
    if (frame) {
      frame.style.removeProperty('width');
      frame.style.removeProperty('height');
      frame.style.removeProperty('margin-left');
      frame.style.removeProperty('margin-right');
    }
    previewImage?.style.removeProperty('width');
    previewImage?.style.removeProperty('height');
    previewImage?.style.removeProperty('max-width');
    previewImage?.style.removeProperty('max-height');
    previewImage?.style.removeProperty('object-fit');
    previewModal?.querySelector('.browse-preview__gallery')?.style.removeProperty('min-height');
  }

  let previewLayoutSyncRaf = 0;
  function schedulePreviewLayoutSync() {
    cancelAnimationFrame(previewLayoutSyncRaf);
    previewLayoutSyncRaf = requestAnimationFrame(() => {
      previewLayoutSyncRaf = requestAnimationFrame(syncPreviewLayout);
    });
  }

  function fitPreviewStageToImage() {
    const frame = previewImage?.closest('.browse-preview__frame');
    const stage = previewImage?.closest('.browse-preview__stage');
    if (!frame || !stage || !previewImage) {
      schedulePreviewLayoutSync();
      return;
    }

    if (window.innerWidth < 900) {
      frame.style.width = '100%';
      frame.style.height = '100%';
      frame.style.removeProperty('margin-left');
      frame.style.removeProperty('margin-right');
      previewImage.style.width = '100%';
      previewImage.style.height = '100%';
      previewImage.style.removeProperty('max-width');
      previewImage.style.removeProperty('max-height');
      previewImage.style.objectFit = 'contain';
      schedulePreviewLayoutSync();
      scrollActivePreviewThumbIntoView();
      return;
    }

    const naturalW = previewImage.naturalWidth;
    const naturalH = previewImage.naturalHeight;
    if (!naturalW || !naturalH) {
      schedulePreviewLayoutSync();
      return;
    }

    const maxH = window.innerWidth >= 900
      ? Math.min(window.innerHeight * 0.54, 540)
      : Math.min(window.innerHeight * 0.46, 420);

    const containerW = stage.clientWidth || frame.clientWidth || 0;
    if (!containerW) {
      schedulePreviewLayoutSync();
      return;
    }

    let displayW = containerW;
    let displayH = Math.round((containerW * naturalH) / naturalW);
    if (displayH > maxH) {
      displayH = maxH;
      displayW = Math.round((maxH * naturalW) / naturalH);
    }

    frame.style.width = `${displayW}px`;
    frame.style.height = `${displayH}px`;
    frame.style.marginLeft = 'auto';
    frame.style.marginRight = 'auto';

    previewImage.style.width = `${displayW}px`;
    previewImage.style.height = `${displayH}px`;
    previewImage.style.maxWidth = 'none';
    previewImage.style.maxHeight = 'none';

    schedulePreviewLayoutSync();
  }

  function scrollActivePreviewThumbIntoView() {
    const active = previewThumbs?.querySelector('.browse-preview__thumb.is-active');
    active?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }

  function paintPreviewImage() {
    const { images, index } = previewState;
    if (!images.length || !previewImage) return;
    const src = images[index];
    previewImage.alt = `Photo ${index + 1} of ${images.length}`;
    if (previewCounter) previewCounter.textContent = `${index + 1} / ${images.length}`;
    previewThumbs?.querySelectorAll('[data-preview-thumb]').forEach((btn) => {
      const active = Number(btn.dataset.previewThumb) === index;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    const multi = images.length > 1;
    previewPrevBtn?.classList.toggle('is-hidden', !multi);
    previewNextBtn?.classList.toggle('is-hidden', !multi);
    if (previewCounter) previewCounter.classList.toggle('is-hidden', !multi);

    const onReady = () => fitPreviewStageToImage();
    previewImage.onload = onReady;
    previewImage.onerror = () => schedulePreviewLayoutSync();
    previewImage.src = src;

    if (typeof previewImage.decode === 'function') {
      previewImage.decode().then(onReady).catch(onReady);
    } else if (previewImage.complete && previewImage.naturalWidth) {
      onReady();
    }
  }

  function renderPreviewThumbs() {
    if (!previewThumbs) return;
    previewThumbs.innerHTML = previewState.images.map((src, i) => `
      <button
        type="button"
        class="browse-preview__thumb${i === previewState.index ? ' is-active' : ''}"
        data-preview-thumb="${i}"
        role="tab"
        aria-selected="${i === previewState.index ? 'true' : 'false'}"
        aria-label="Photo ${i + 1}"
      >
        <img src="${escapeHtml(src)}" alt="" loading="lazy" />
      </button>`).join('');
    scrollActivePreviewThumbIntoView();
  }

  function stepPreview(delta) {
    const len = previewState.images.length;
    if (len < 2) return;
    previewState.index = (previewState.index + delta + len) % len;
    paintPreviewImage();
  }

  function syncPreviewLayout() {
    const layout = previewModal?.querySelector('.browse-preview__layout');
    const gallery = previewModal?.querySelector('.browse-preview__gallery');
    const details = previewModal?.querySelector('.browse-preview__details');
    if (!layout || !gallery || !details) return;

    details.style.maxHeight = '';
    details.style.height = '';
    gallery.style.minHeight = '';

    if (window.innerWidth < 900) return;

    const galleryHeight = Math.ceil(gallery.getBoundingClientRect().height);
    const detailsHeight = Math.ceil(details.getBoundingClientRect().height);
    const rowHeight = Math.max(galleryHeight, detailsHeight);

    if (rowHeight > 0) {
      const h = `${rowHeight}px`;
      gallery.style.minHeight = h;
      details.style.maxHeight = h;
      details.style.height = h;
    }
  }

  function openBrowsePreview() {
    if (!previewModal) return;
    previewModal.hidden = false;
    previewModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('browse-preview-open');
    previewModal.querySelector('[data-preview-close]')?.focus?.();
    schedulePreviewLayoutSync();
  }

  function closeBrowsePreview() {
    if (!previewModal || previewModal.hidden) return;
    previewModal.hidden = true;
    previewModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('browse-preview-open');
    previewModal.querySelector('.browse-preview__details')?.style.removeProperty('max-height');
    previewModal.querySelector('.browse-preview__details')?.style.removeProperty('height');
    resetPreviewStage();
    previewState.kind = null;
    previewState.images = [];
    previewState.index = 0;
    previewState.roomId = null;
    previewState.venueKey = null;
  }

  function openRoomPreview(roomId) {
    const room = visibleRooms().find((r) => String(r.id) === String(roomId))
      || roomsForFilters().find((r) => String(r.id) === String(roomId));
    if (!room) return;
    const st = statusInfo(room);
    const price = priceFor(room);
    const highlights = roomTypeHighlights(room);
    const avail = availabilityForRoom(room.id);
    const description = String(room.description || '').trim();
    const policies = String(room.policies || '').trim();

    previewState.kind = 'room';
    previewState.roomId = room.id;
    previewState.venueKey = null;
    previewState.images = getImagesByRoom(room);
    previewState.index = 0;

    if (previewEyebrow) previewEyebrow.textContent = room.building || 'Guest lodging';
    if (previewTitle) previewTitle.textContent = `Room ${room.roomNumber}`;
    if (previewMeta) {
      previewMeta.innerHTML = `
        <span class="browse-preview__pill ${st.bookable ? 'is-ok' : ''}">${escapeHtml(st.label)}</span>
        <span class="browse-preview__pill"><span class="material-symbols-outlined">hotel</span>${escapeHtml(room.roomType)}</span>
        <span class="browse-preview__pill"><span class="material-symbols-outlined">group</span>${room.capacityMin}–${room.capacityMax} guests</span>
        ${price?.perNight != null ? `<span class="browse-preview__pill is-price">${peso(price.perNight)} / night</span>` : ''}
      `;
    }
    if (previewBody) {
      const dorm = avail?.availability_status === 'dorm_min_guests'
        ? `<p class="browse-preview__alert">Minimum ${avail?.dorm_booking_minimum || 5} guests required to book this dorm.</p>`
        : '';
      const stay = price?.nights
        ? `<p class="browse-preview__lead">${peso(price.total)} estimated for ${price.nights} night(s) with your current search.</p>`
        : `<p class="browse-preview__lead">Set stay dates above to see live availability and pricing for this room.</p>`;
      const about = description
        ? `<section class="browse-preview__section"><h4>Description</h4><p>${escapeHtml(description)}</p></section>`
        : '';
      previewBody.innerHTML = `
        ${stay}
        ${dorm}
        ${about}
        <section class="browse-preview__section">
          <h4>Room highlights</h4>
          ${highlightChipsHtml(highlights)}
        </section>
        ${detailBlockHtml('Policies', policies, { list: true })}
        <section class="browse-preview__section">
          <h4>Good to know</h4>
          <ul class="browse-preview__list">
            <li>Located in ${escapeHtml(room.building)}</li>
            <li>Sleeps ${room.capacityMin}–${room.capacityMax} guests</li>
            <li>Photos are representative — layout may vary by room</li>
          </ul>
        </section>
      `;
    }
    if (previewActions) {
      previewActions.className = 'browse-preview__actions browse-preview__actions--stacked';
      previewActions.innerHTML = roomReserveControl(room, { compact: true });
    }

    renderPreviewThumbs();
    paintPreviewImage();
    openBrowsePreview();
  }

  function openVenuePreview(venueKey) {
    const venue = allVenues.find((v) => v.key === venueKey);
    if (!venue) return;
    const cap = venueCapacityText(venue);
    const galleryVenue = {
      name: venue.name,
      category: venue.category,
      facility_group: venue.category,
      room_code: venue.room_code,
      item: venue.uses?.[0]?.item,
      preview_images: venue.preview_images || [],
    };

    previewState.kind = 'venue';
    previewState.venueKey = venue.key;
    previewState.roomId = null;
    previewState.images = venueGalleryImages(galleryVenue);
    previewState.index = 0;

    if (previewEyebrow) previewEyebrow.textContent = venue.category || 'Venue';
    if (previewTitle) {
      previewTitle.textContent = venue.room_code
        ? `${venue.name} (${venue.room_code})`
        : venue.name;
    }
    if (previewMeta) {
      previewMeta.innerHTML = `
        <span class="browse-preview__pill is-price">${escapeHtml(venueRateSummary(venue))}</span>
        ${cap ? `<span class="browse-preview__pill"><span class="material-symbols-outlined">group</span>${escapeHtml(cap)}</span>` : ''}
        ${venue.min_hours ? `<span class="browse-preview__pill"><span class="material-symbols-outlined">schedule</span>${venue.min_hours}-hr minimum</span>` : ''}
        ${venue.uses.length > 1 ? `<span class="browse-preview__pill"><span class="material-symbols-outlined">tune</span>${venue.uses.length} uses</span>` : ''}
      `;
    }
    if (previewBody) {
      const usesDiffer = venue.uses.some((u) =>
        (u.inclusions && u.inclusions !== venue.inclusions)
        || (u.policies && u.policies !== venue.policies)
      );
      const usesList = venue.uses.length
        ? `<section class="browse-preview__section">
            <h4>Available uses</h4>
            <ul class="browse-preview__list">${venue.uses.map((u) => {
              const rate = u.regularRate != null
                ? ` · from ₱${Number(u.regularRate).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
                : '';
              const useNote = usesDiffer && (u.inclusions || u.policies)
                ? `<div class="browse-preview__use-notes">${u.inclusions ? `<p><strong>Includes:</strong> ${escapeHtml(u.inclusions)}</p>` : ''}${u.policies ? `<p><strong>Policies:</strong> ${escapeHtml(u.policies)}</p>` : ''}</div>`
                : '';
              return `<li><span>${escapeHtml(u.functionName || u.item || 'Standard booking')}${rate}</span>${useNote}</li>`;
            }).join('')}</ul>
          </section>`
        : '';
      const about = venue.description
        ? `<section class="browse-preview__section"><h4>Description</h4><p>${escapeHtml(venue.description)}</p></section>`
        : '';
      const sharedInclusions = !usesDiffer ? detailBlockHtml("What's included", venue.inclusions, { list: true }) : '';
      const sharedPolicies = !usesDiffer ? detailBlockHtml('Policies', venue.policies, { list: true }) : '';
      previewBody.innerHTML = `
        <p class="browse-preview__lead">Review the description, what's included, and policies — then continue to request your preferred date and time.</p>
        ${about}
        ${sharedInclusions}
        ${sharedPolicies}
        ${usesList}
      `;
    }
    if (previewActions) {
      previewActions.className = 'browse-preview__actions browse-preview__actions--stacked';
      previewActions.innerHTML = readOnly
        ? `<div class="browse-preview__cta text-center bg-surface-container-low text-outline border border-outline-variant/50">View only</div>`
        : `<button type="button" class="browse-preview__cta browse-preview__cta--secondary" data-venue-add-request data-venue-key="${escapeHtml(venue.key)}" data-preview-stop>Add to booking request</button>
           <button type="button" class="browse-preview__cta browse-preview__cta--primary" data-venue-key="${escapeHtml(venue.key)}" data-preview-book>Request this venue</button>`;
    }

    renderPreviewThumbs();
    paintPreviewImage();
    openBrowsePreview();
  }

  previewModal?.addEventListener('click', (e) => {
    if (e.target.closest('[data-preview-close]')) {
      closeBrowsePreview();
      return;
    }
    if (e.target.closest('[data-refresh-stay-search]')) {
      closeBrowsePreview();
      checkAvailability();
      return;
    }
    if (e.target.closest('[data-preview-prev]')) {
      stepPreview(-1);
      return;
    }
    if (e.target.closest('[data-preview-next]')) {
      stepPreview(1);
      return;
    }
    const thumb = e.target.closest('[data-preview-thumb]');
    if (thumb) {
      previewState.index = Number(thumb.dataset.previewThumb) || 0;
      paintPreviewImage();
      return;
    }
    if (e.target.closest('[data-preview-book]')) {
      const key = e.target.closest('[data-venue-key]')?.dataset.venueKey || previewState.venueKey;
      closeBrowsePreview();
      if (key) openVenueModal(key);
      return;
    }
    if (e.target.closest('[data-venue-add-request]')) {
      const key = e.target.closest('[data-venue-key]')?.dataset.venueKey || previewState.venueKey;
      closeBrowsePreview();
      if (key) openVenueModal(key, { addToRequest: true });
      return;
    }
    const roomAddBtn = e.target.closest('[data-room-add-request]');
    if (roomAddBtn) {
      void addRoomToBookingRequest(roomAddBtn.dataset.roomAddRequest || previewState.roomId);
      return;
    }
    const roomBookBtn = e.target.closest('[data-room-book]');
    if (roomBookBtn) {
      const roomId = roomBookBtn.dataset.roomBook || previewState.roomId;
      closeBrowsePreview();
      if (roomId) {
        void roomBookingReady.then((roomBooking) => {
          const room = visibleRooms().find((r) => String(r.id) === String(roomId))
            || roomsForFilters().find((r) => String(r.id) === String(roomId));
          const guestsForRoom = room ? guestCountForRoom(room) : (guestsEl?.value || '1');
          roomBooking.openConfirmBooking({
            roomId,
            checkIn: checkInEl?.value,
            checkOut: checkOutEl?.value,
            guests: guestsForRoom || guestsEl?.value || '1',
          });
        });
      }
    }
  });

  document.addEventListener('keydown', (e) => {
    if (previewModal?.hidden) return;
    if (e.key === 'Escape') {
      closeBrowsePreview();
      return;
    }
    if (e.key === 'ArrowLeft') stepPreview(-1);
    if (e.key === 'ArrowRight') stepPreview(1);
  });

  let previewTouchX = null;
  previewModal?.querySelector('.browse-preview__stage')?.addEventListener('touchstart', (e) => {
    previewTouchX = e.changedTouches[0]?.clientX ?? null;
  }, { passive: true });
  previewModal?.querySelector('.browse-preview__stage')?.addEventListener('touchend', (e) => {
    if (previewTouchX == null) return;
    const dx = (e.changedTouches[0]?.clientX ?? previewTouchX) - previewTouchX;
    if (Math.abs(dx) > 40) stepPreview(dx < 0 ? 1 : -1);
    previewTouchX = null;
  }, { passive: true });

  window.addEventListener('resize', () => {
    if (previewModal?.hidden) return;
    if (previewImage?.naturalWidth) fitPreviewStageToImage();
    else schedulePreviewLayoutSync();
  });

  const previewGallery = previewModal?.querySelector('.browse-preview__gallery');
  if (previewGallery && typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => {
      if (!previewModal?.hidden) schedulePreviewLayoutSync();
    }).observe(previewGallery);
  }

  // ---- Venue booking modal ----
  const modal    = document.getElementById('venue-booking-modal');
  if (modal && modal.parentElement !== document.body) {document.body.appendChild(modal);}
  const titleEl  = document.getElementById('vbm-title');
  const subtitleEl = document.getElementById('vbm-subtitle');
  const catEl    = document.getElementById('vbm-category');
  const itemEl   = document.getElementById('vbm-item');
  const feedback = document.getElementById('vbm-feedback');
  const submitBtn= document.getElementById('vbm-submit-btn');
  const addRequestBtn = document.getElementById('vbm-add-request-btn');
  const rateHint = document.getElementById('vbm-rate-hint');
  const formFields = document.getElementById('vbm-form-fields');
  const successPanel = document.getElementById('vbm-success-panel');
  const backBtn = document.getElementById('vbm-back');

  const useEl = document.getElementById('vbm-use');
  const useWrap = document.getElementById('vbm-use-wrap');
  const facilityIdEl = document.getElementById('vbm-facility-id');
  const infoEl = document.getElementById('vbm-info');
  const capacityHint = document.getElementById('vbm-capacity-hint');
  let currentVenue = null;

  function fmtVenueTime(t) {
    if (!t) return '';
    const [h, m] = String(t).slice(0, 5).split(':').map(Number);
    if (Number.isNaN(h)) return t;
    const d = new Date(2000, 0, 1, h, m || 0);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  function resetVenueSuccessState() {
    formFields?.classList.remove('hidden');
    successPanel?.classList.add('hidden');
    backBtn?.classList.remove('hidden');
    if (titleEl && currentVenue) {
      titleEl.textContent = `Book — ${currentVenue.name}${currentVenue.room_code ? ` (${currentVenue.room_code})` : ''}`;
    }
    if (subtitleEl) subtitleEl.textContent = 'Set the date and time, then submit your request.';
  }

  function showVenueBookingSuccess({ venueName, useLabel, eventDate, startTime, endTime }) {
    const msg = document.getElementById('vbm-success-msg');
    const when = `${fmtStayDate(eventDate)} · ${fmtVenueTime(startTime)} – ${fmtVenueTime(endTime)}`;
    const place = [venueName, useLabel].filter(Boolean).join(' — ');
    if (msg) msg.textContent = `${place} for ${when} is pending approval.`;
    formFields?.classList.add('hidden');
    successPanel?.classList.remove('hidden');
    backBtn?.classList.add('hidden');
    if (titleEl) titleEl.textContent = 'Request submitted';
    if (subtitleEl) subtitleEl.textContent = 'Staff will review your venue request and notify you by email.';
    feedback?.classList.add('hidden');
  }

  function selectedFacilityId() {
    return facilityIdEl?.value || useEl?.value || '';
  }

  function renderVenueInfo(venue) {
    if (!infoEl) return;
    const parts = [];
    const cap = venueCapacityText(venue);
    if (cap) parts.push(`<p class="text-body-sm text-on-surface-variant"><span class="material-symbols-outlined text-[15px] align-middle">group</span> ${escapeHtml(cap)}</p>`);
    if (venue.min_hours) parts.push(`<p class="text-body-sm text-on-surface-variant"><span class="material-symbols-outlined text-[15px] align-middle">schedule</span> ${venue.min_hours}-hour minimum booking</p>`);
    if (venue.inclusions) parts.push(`<div><p class="text-label-sm font-medium text-on-surface mb-0.5">What's included</p><p class="text-body-sm text-on-surface-variant whitespace-pre-line">${escapeHtml(venue.inclusions)}</p></div>`);
    if (venue.policies) parts.push(`<button type="button" id="vbm-view-policies" class="text-body-sm font-semibold text-primary underline underline-offset-2 hover:opacity-80">View full policies &amp; details</button>`);
    if (!parts.length) { infoEl.classList.add('hidden'); infoEl.innerHTML = ''; return; }
    infoEl.innerHTML = parts.join('');
    infoEl.classList.remove('hidden');
  }

  function applySelectedUse() {
    if (!currentVenue) return;
    const use = currentVenue.uses.find((u) => String(u.facilityId) === String(useEl?.value))
      || currentVenue.uses[0];
    if (!use) return;
    if (facilityIdEl) facilityIdEl.value = use.facilityId;
    if (catEl) catEl.value = currentVenue.category;
    if (itemEl) itemEl.value = use.item;
    if (capacityHint) {
      const limits = {
        capacity_min: use.capacity_min ?? currentVenue.capacity_min,
        capacity_max: use.capacity_max ?? currentVenue.capacity_max,
      };
      const cap = venueCapacityLabel(limits);
      const minH = use.min_hours ?? currentVenue.min_hours;
      capacityHint.textContent = [
        cap ? `This space holds ${cap}.` : '',
        minH ? `${minH}-hour minimum booking.` : '',
      ].filter(Boolean).join(' ');
      capacityHint.classList.toggle('hidden', !capacityHint.textContent);
    }
    updateVenueRateHint();
    checkVenueSlot();
  }

  async function updateVenueRateHint() {
    if (!rateHint) return;
    const facilityId = selectedFacilityId();
    const date = document.getElementById('vbm-date')?.value;
    if (!facilityId || !date) {
      rateHint.textContent = 'Rate depends on the event date (Regular or Peak).';
      return;
    }
    try {
      const quote = await getVenueRateQuote({ facility_id: facilityId, date });
      const season = quote.calendar_season || quote.season;
      rateHint.textContent = quote.rate_label
        ? `${season} rate: ${quote.rate_label}`
        : `${season} rate: ₱${Number(quote.rate).toLocaleString('en-PH')} / hr`;
    } catch {
      rateHint.textContent = '';
    }
  }

  function openVenueModal(venueKey) {
    const venue = allVenues.find((v) => v.key === venueKey);
    if (!venue) return;
    currentVenue = venue;

    if (useEl) {
      useEl.innerHTML = venue.uses
        .map((u) => `<option value="${escapeHtml(u.facilityId)}">${escapeHtml(u.functionName || 'Standard booking')}</option>`)
        .join('');
      useEl.value = venue.uses[0]?.facilityId ?? '';
    }
    useWrap?.classList.toggle('hidden', venue.uses.length <= 1);

    if (titleEl) titleEl.textContent = `Book — ${venue.name}${venue.room_code ? ` (${venue.room_code})` : ''}`;
    if (subtitleEl) subtitleEl.textContent = 'Set the date and time, then submit your request.';

    const dateEl = document.getElementById('vbm-date');
    if (dateEl) {
      dateEl.min = todayStr;
      dateEl.value = '';
    }
    const startEl = document.getElementById('vbm-start');
    const endEl = document.getElementById('vbm-end');
    const minHours = Math.max(1, Number(venue.min_hours) || 4);
    if (startEl) startEl.value = '09:00';
    if (endEl) {
      const [h] = (startEl?.value || '09:00').split(':').map(Number);
      endEl.value = `${String(Math.min(23, h + minHours)).padStart(2, '0')}:00`;
    }
    const vbmGuests = document.getElementById('vbm-guests');
    if (vbmGuests) vbmGuests.value = '1';
    feedback?.classList.add('hidden');
    document.getElementById('vbm-slot-status')?.classList.add('hidden');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Request';
    }
    if (rateHint) {
      rateHint.textContent = 'Pick a date and time — we check slot availability before you submit.';
    }
    renderVenueInfo(venue);
    applySelectedUse();
    resetVenueSuccessState();
    modal?.classList.remove('hidden');
  }

  function closeVenueModal() {
    modal?.classList.add('hidden');
    ['vbm-date','vbm-start','vbm-end','vbm-notes','vbm-phone'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const guests = document.getElementById('vbm-guests');
    if (guests) guests.value = '1';
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Request';
    }
    resetVenueSuccessState();
  }

  document.getElementById('vbm-close')?.addEventListener('click', closeVenueModal);
  document.getElementById('vbm-cancel-btn')?.addEventListener('click', closeVenueModal);
  document.getElementById('vbm-success-done')?.addEventListener('click', closeVenueModal);
  document.getElementById('vbm-back')?.addEventListener('click', () => {
    const key = currentVenue?.key;
    closeVenueModal();
    if (key) openVenuePreview(key);
  });
  modal?.addEventListener('click', (e) => { if (e.target === modal) closeVenueModal(); });

  document.getElementById('vbm-date')?.addEventListener('change', () => {
    feedback?.classList.add('hidden');
    updateVenueRateHint();
    checkVenueSlot();
  });
  document.getElementById('vbm-start')?.addEventListener('change', () => {
    feedback?.classList.add('hidden');
    checkVenueSlot();
  });
  document.getElementById('vbm-end')?.addEventListener('change', () => {
    feedback?.classList.add('hidden');
    checkVenueSlot();
  });
  useEl?.addEventListener('change', () => {
    feedback?.classList.add('hidden');
    applySelectedUse();
  });
  document.getElementById('vbm-guests')?.addEventListener('input', () => {
    feedback?.classList.add('hidden');
  });
  document.getElementById('vbm-notes')?.addEventListener('input', () => {
    feedback?.classList.add('hidden');
  });
  document.getElementById('vbm-phone')?.addEventListener('input', () => {
    feedback?.classList.add('hidden');
  });

  let venueSlotTimer;
  async function checkVenueSlot() {
    clearTimeout(venueSlotTimer);
    venueSlotTimer = setTimeout(async () => {
      const slotEl = document.getElementById('vbm-slot-status');
      if (!slotEl) return;
      const facilityId = selectedFacilityId();
      const eventDate = document.getElementById('vbm-date')?.value;
      const startTime = document.getElementById('vbm-start')?.value;
      const endTime = document.getElementById('vbm-end')?.value;
      if (!facilityId || !eventDate || !startTime || !endTime) {
        slotEl.classList.add('hidden');
        if (submitBtn) submitBtn.disabled = false;
        return;
      }
      if (endTime <= startTime) {
        slotEl.textContent = 'End time must be after start time.';
        slotEl.className = 'text-body-sm rounded-lg px-3 py-2 bg-error/10 text-error';
        slotEl.classList.remove('hidden');
        if (submitBtn) submitBtn.disabled = true;
        return;
      }
      try {
        const result = await checkVenueSlotAvailability({ facility_id: facilityId, event_date: eventDate, start_time: startTime, end_time: endTime });
        slotEl.textContent = result.available
          ? `${result.message}${result.estimated_total != null ? ` Estimated: ₱${Number(result.estimated_total).toLocaleString('en-PH', { minimumFractionDigits: 2 })}.` : ''}`
          : result.message;
        slotEl.className = result.available
          ? 'text-body-sm rounded-lg px-3 py-2 bg-emerald-50 text-emerald-800'
          : 'text-body-sm rounded-lg px-3 py-2 bg-error/10 text-error';
        slotEl.classList.remove('hidden');
        if (submitBtn) submitBtn.disabled = !result.available;
      } catch {
        slotEl.classList.add('hidden');
        if (submitBtn) submitBtn.disabled = false;
      }
    }, 350);
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.book-venue-btn');
    if (btn) openVenueModal(btn.dataset.venueKey);
  });

  function venueFormFeedback(msg, isError) {
    if (!feedback) return;
    feedback.textContent = msg;
    feedback.className = isError
      ? 'text-body-sm rounded-lg px-3 py-2 bg-error/10 text-error'
      : 'text-body-sm rounded-lg px-3 py-2 bg-emerald-50 text-emerald-700';
    feedback.classList.remove('hidden');
  }

  function readVenueFormValues() {
    const facilityId = selectedFacilityId();
    const eventDate = document.getElementById('vbm-date')?.value;
    const startTime = document.getElementById('vbm-start')?.value;
    const endTime = document.getElementById('vbm-end')?.value;
    const guestCount = Number(document.getElementById('vbm-guests')?.value || 1);
    const notes = document.getElementById('vbm-notes')?.value.trim();
    return { facilityId, eventDate, startTime, endTime, guestCount, notes };
  }

  function validateVenueFormValues(values) {
    if (!values.facilityId) return 'Please choose a venue use.';
    if (!values.eventDate) return 'Please select an event date.';
    if (!values.startTime || !values.endTime) return 'Please set start and end times.';
    if (values.endTime <= values.startTime) return 'End time must be after start time.';
    const use = currentVenue?.uses?.find((u) => String(u.facilityId) === String(values.facilityId))
      || currentVenue;
    const limits = {
      capacity_min: use?.capacity_min ?? currentVenue?.capacity_min,
      capacity_max: use?.capacity_max ?? currentVenue?.capacity_max,
      min_hours: use?.min_hours ?? currentVenue?.min_hours,
      package_name: use?.functionName,
      item: use?.item,
    };
    const capacityError = validateVenueCapacityClient(limits, values.guestCount);
    if (capacityError) return capacityError;
    const durationError = validateVenueDurationClient(limits, values.startTime, values.endTime);
    if (durationError) return durationError;
    return null;
  }

  async function addVenueToBookingRequest() {
    const values = readVenueFormValues();
    const validationError = validateVenueFormValues(values);
    if (validationError) {
      venueFormFeedback(validationError, true);
      return;
    }

    if (addRequestBtn) {
      addRequestBtn.disabled = true;
      addRequestBtn.textContent = 'Checking…';
    }
    try {
      const slot = await checkVenueSlotAvailability({
        facility_id: values.facilityId,
        event_date: values.eventDate,
        start_time: values.startTime,
        end_time: values.endTime,
      });
      if (!slot.available) {
        venueFormFeedback(slot.message || 'This time slot is not available.', true);
        return;
      }
    } catch (err) {
      venueFormFeedback(err.message || 'Could not verify availability.', true);
      return;
    } finally {
      if (addRequestBtn) {
        addRequestBtn.disabled = false;
        addRequestBtn.textContent = 'Add to booking request';
      }
    }

    const use = currentVenue?.uses?.find((u) => String(u.facilityId) === String(values.facilityId));
    let estimatedTotal = null;
    try {
      const quote = await getVenueRateQuote({ facility_id: values.facilityId, date: values.eventDate });
      const [sh, sm] = values.startTime.split(':').map(Number);
      const [eh, em] = values.endTime.split(':').map(Number);
      const hours = Math.max(0, (eh + em / 60) - (sh + sm / 60));
      if (quote?.rate) estimatedTotal = Math.round(Number(quote.rate) * hours * 100) / 100;
    } catch {
      /* optional estimate */
    }

    try {
      addBookingRequestItem({
        kind: 'venue',
        facilityId: values.facilityId,
        venueKey: currentVenue?.key,
        venueName: currentVenue?.name,
        category: currentVenue?.category,
        item: use?.item || use?.functionName || '',
        eventDate: values.eventDate,
        startTime: values.startTime,
        endTime: values.endTime,
        guestCount: values.guestCount,
        notes: values.notes || '',
        estimatedTotal,
      });
      venueFormFeedback('Venue added to booking request.', false);
      showBookingRequestToast('Venue added to booking request');
      bookingRequestUi.notifyAdded();
      setTimeout(closeVenueModal, 900);
    } catch (err) {
      venueFormFeedback(err.message || 'Could not add venue.', true);
    }
  }

  addRequestBtn?.addEventListener('click', () => { void addVenueToBookingRequest(); });

  submitBtn?.addEventListener('click', async () => {
    const showMsg = venueFormFeedback;

    const values = readVenueFormValues();
    const validationError = validateVenueFormValues(values);
    if (validationError) return showMsg(validationError, true);

    const { facilityId, eventDate, startTime, endTime, guestCount, notes } = values;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Checking availability…';
    try {
      const slot = await checkVenueSlotAvailability({ facility_id: facilityId, event_date: eventDate, start_time: startTime, end_time: endTime });
      if (!slot.available) {
        showMsg(slot.message || 'This time slot is not available.', true);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Request';
        return;
      }
    } catch (err) {
      showMsg(err.message || 'Could not verify availability.', true);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Request';
      return;
    }

    submitBtn.textContent = 'Submitting…';

    try {
      await createFacilityBooking({
        facility_id: facilityId,
        event_date: eventDate,
        start_time: startTime,
        end_time: endTime,
        guest_count: guestCount,
        notes,
        contact_phone: document.getElementById('vbm-phone')?.value?.trim() || undefined,
      });
      const use = currentVenue?.uses?.find((u) => String(u.facilityId) === String(facilityId));
      showVenueBookingSuccess({
        venueName: currentVenue?.name || 'Venue',
        useLabel: use?.functionName || '',
        eventDate,
        startTime,
        endTime,
      });
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Request';
    } catch (err) {
      showMsg(err.message || 'Submission failed. Please try again.', true);
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Submit Request';
    }
  });

  const browseQ = readBrowseQuery();
  selectedCategory = paintBrowseCategoryCards({ selectedCategory: resolveBrowseCategory(browseQ.category), isInternal });
  renderCategoryCards();
  loadRooms();
  loadVenues();
  // Live-refresh when admin uploads photos in another tab/modal on the same origin.
  window.addEventListener('rooms:changed', (e) => {
    if (e.detail?.preview_images && e.detail?.roomId) {
      registerRoomsUploadedImages([{
        id: e.detail.roomId,
        roomNumber: e.detail.roomNumber,
        room_number: e.detail.roomNumber,
        preview_images: e.detail.preview_images,
      }]);
    }
    void loadRooms();
  });
  window.addEventListener('venues:changed', (e) => {
    if (e.detail?.preview_images) {
      registerVenueUploadedImages({
        facility_id: e.detail.facilityId,
        preview_images: e.detail.preview_images,
      });
    }
    void loadVenues();
  });
  if (browseQ.checkIn || browseQ.checkOut) {
    writeStayFields({
      checkIn: browseQ.checkIn,
      checkOut: browseQ.checkOut,
      guests: browseQ.guests || '1',
    });
    ensureValidStayRange({ announce: Boolean(browseQ.checkIn && browseQ.checkOut) });
  } else {
    restoreStayCriteria();
  }
  persistStayCriteria();
  updateStayFormState();
  updateRoomBrowseVisibility();
  render();
  if (browseQ.checkIn && browseQ.checkOut) {
    checkAvailability();
  } else if (browseQ.focus === 'venues' || !categoryShowsRooms(selectedCategory)) {
    document.getElementById('venues')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (browseQ.previewRoom) {
    const reopen = () => openRoomPreview(browseQ.previewRoom);
    browseQ.checkIn && browseQ.checkOut ? setTimeout(reopen, 300) : reopen();
    window.history.replaceState({}, '', window.location.pathname);
  }

  createBookingPoll(
    () => checkAvailability({ background: true }),
    { shouldPoll: () => isRoomBrowseUnlocked() && availability !== null },
  );
}

bootGuestFacilitiesBrowse().catch((err) => {
  console.error('[browse] Failed to initialize', err);
});