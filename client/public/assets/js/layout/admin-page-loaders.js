/**
 * Admin page boot handlers — first load (HTML) and soft navigation.
 */

import { initAdminEnhancements, releaseChromeBoot } from '/assets/js/layout/animations.js';
import { teardownGuestAccessPage } from '/assets/js/features/admin-guest-access.js';
import { createBookingPoll } from '/assets/js/layout/booking-poll.js';

/** @type {(() => void) | null} */
let pageCleanup = null;

export function cleanupAdminPage() {
  pageCleanup?.();
  pageCleanup = null;
  teardownGuestAccessPage();
  import('/assets/js/features/admin-facility-catalog.js')
    .then(({ hideFacilityCatalogModal }) => hideFacilityCatalogModal())
    .catch(() => {});
  document.getElementById('calendar-mount')?.replaceChildren();
  document.getElementById('page-content')?.scrollTo(0, 0);
}

export async function bootAdminPage(pageName) {
  cleanupAdminPage();

  switch (pageName) {
    case 'dashboard.html':
      pageCleanup = await bootDashboard();
      break;
    case 'calendar.html':
      pageCleanup = await bootCalendar();
      break;
    case 'reservations.html':
      pageCleanup = await bootReservations();
      break;
    case 'facilities.html':
      pageCleanup = await bootFacilities();
      break;
    case 'residents.html':
      pageCleanup = await bootResidents();
      break;
    case 'payments.html':
      pageCleanup = await bootPayments();
      break;
    case 'settings.html':
      pageCleanup = await bootSettings();
      break;
    default:
      throw new Error(`Unknown admin page: ${pageName}`);
  }
}

async function bootDashboard() {
  const { loadDashboard } = await import('/assets/js/features/dashboard.js');
  await loadDashboard();
  const onUpdate = () => loadDashboard({ background: true });
  window.addEventListener('booking:updated', onUpdate);
  const stopPoll = createBookingPoll(() => loadDashboard({ background: true }));
  await initAdminEnhancements();
  return () => {
    stopPoll();
    window.removeEventListener('booking:updated', onUpdate);
  };
}

async function bootCalendar() {
  const { mountAdminCalendar } = await import('/assets/js/features/timeline.js');
  const unmount = await mountAdminCalendar({
    mountEl: document.getElementById('calendar-mount'),
    title: 'Reservation calendar',
  });
  await initAdminEnhancements();
  return unmount;
}

async function bootReservations() {
  const { bootstrapReservationsHub, teardownReservationsHub } = await import('/assets/js/features/admin-reservations-hub.js');
  await bootstrapReservationsHub();
  await initAdminEnhancements();
  return () => teardownReservationsHub();
}

async function bootFacilities() {
  const { getMealRatesCatalog, getExtraServicesCatalog } = await import('/assets/js/services/api.js');
  const { bootstrapRoomsBoard, teardownRoomsBoard } = await import('/assets/js/features/admin-rooms-board.js');
  const { bootstrapVenueScheduleBoard, teardownVenueScheduleBoard } = await import('/assets/js/features/admin-venue-board.js');
  const {
    initFacilityCatalog,
    renderMealsCatalog,
    renderExtrasCatalog,
    setCatalogToolbarTab,
  } = await import('/assets/js/features/admin-facility-catalog.js');
  const { bootstrapRoomRates } = await import('/assets/js/features/admin-room-rates.js');
  const { bootstrapVenueRates } = await import('/assets/js/features/admin-venue-rates.js');

  let activeFacTab = 'rooms';

  async function reloadCatalog() {
    const [meals, extras] = await Promise.all([
      getMealRatesCatalog(),
      getExtraServicesCatalog(),
    ]);
    renderMealsCatalog(meals || []);
    renderExtrasCatalog(extras || []);
  }

  function switchFacTab(tab) {
    activeFacTab = tab;
    document.querySelectorAll('[data-fac-tab]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.getAttribute('data-fac-tab') === tab);
    });
    document.getElementById('fac-panel-rooms')?.classList.toggle('hidden', tab !== 'rooms');
    document.getElementById('fac-panel-room-prices')?.classList.toggle('hidden', tab !== 'room-prices');
    document.getElementById('fac-panel-venue-spaces')?.classList.toggle('hidden', tab !== 'venue-spaces');
    document.getElementById('fac-panel-venue-prices')?.classList.toggle('hidden', tab !== 'venue-prices');
    document.getElementById('fac-panel-meals')?.classList.toggle('hidden', tab !== 'meals');
    document.getElementById('fac-panel-extras')?.classList.toggle('hidden', tab !== 'extras');
    if (activeFacTab === 'venue-spaces') {
      setCatalogToolbarTab('venue-spaces');
    } else {
      setCatalogToolbarTab(tab);
    }
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.replaceState(window.history.state, '', url);
  }

  function applyFacDeepLinks() {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab && ['rooms', 'room-prices', 'venue-spaces', 'venue-prices', 'meals', 'extras'].includes(tab)) {
      switchFacTab(tab);
    }
    const date = params.get('date');
    if (date && tab === 'venue-spaces') {
      const dateInput = document.getElementById('venue-schedule-date');
      if (dateInput) dateInput.value = date;
    }
  }

  await initFacilityCatalog({ refresh: reloadCatalog });

  const [meals, extras] = await Promise.all([
    getMealRatesCatalog(),
    getExtraServicesCatalog(),
  ]);
  renderMealsCatalog(meals || []);
  renderExtrasCatalog(extras || []);
  setCatalogToolbarTab(activeFacTab);
  applyFacDeepLinks();
  await bootstrapRoomsBoard();
  await bootstrapVenueScheduleBoard();
  await bootstrapRoomRates();
  await bootstrapVenueRates();

  document.querySelectorAll('[data-fac-tab]').forEach((btn) => {
    btn.addEventListener('click', () => switchFacTab(btn.getAttribute('data-fac-tab')));
  });

  await initAdminEnhancements();

  return () => {
    teardownRoomsBoard();
    teardownVenueScheduleBoard();
  };
}

async function bootResidents() {
  const { initGuestAccessPage, loadGuestAccessPage, teardownGuestAccessPage } = await import('/assets/js/features/admin-guest-access.js');
  initGuestAccessPage();
  await loadGuestAccessPage();
  await initAdminEnhancements();
  return () => teardownGuestAccessPage();
}

async function bootPayments() {
  const { loadPaymentsPage, teardownPaymentsPage } = await import('/assets/js/features/admin-payments.js');
  await loadPaymentsPage();
  await initAdminEnhancements();
  return () => teardownPaymentsPage();
}

async function bootSettings() {
  const { loadAdminSettings, teardownAdminSettings } = await import('/assets/js/features/settings.js');
  try {
    await loadAdminSettings();
    await initAdminEnhancements();
    return () => teardownAdminSettings();
  } catch (err) {
    console.error(err);
    const feedback = document.getElementById('system-settings-feedback');
    if (feedback) {
      feedback.textContent = err.message || 'Settings failed to load. Refresh and try again.';
      feedback.className = 'settings-feedback settings-feedback--error';
      feedback.classList.remove('hidden');
    }
    releaseChromeBoot();
    return () => teardownAdminSettings();
  }
}
