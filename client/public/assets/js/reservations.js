import { getRooms, getBookings, normalizeRoom, normalizeBooking } from '../api.js';
import { initAppLayout, showError } from '../ui.js';
import { requireAuth } from '../auth.js';
import {
  renderTimelineShell,
  renderTimeline,
  renderBookingBar,
  getMonthRange,
  openBookingDrawer,
} from '../timeline.js';

const DEMO_ROOMS = [
  { id: 1, building: 'PCALM', roomNumber: '201', roomType: 'Superior Guest Room', status: 'Available' },
  { id: 2, building: 'PCALM', roomNumber: '204', roomType: 'Superior Guest Room', status: 'Maintenance' },
  { id: 3, building: 'House', roomNumber: 'Lounge', roomType: 'Standard Apartment', status: 'Available' },
];

const DEMO_BOOKINGS = [
  { id: 2801, roomId: 1, title: 'THEOLOGY DEPT', startDate: '2026-06-02', endDate: '2026-06-06', status: 'approved' },
  { id: 2802, roomId: 2, title: 'HVAC SYSTEM UPGRADE', startDate: '2026-06-09', endDate: '2026-06-14', status: 'maintenance' },
  { id: 2803, roomId: 3, title: 'WEEKLY FELLOWSHIP', startDate: '2026-06-04', endDate: '2026-06-12', status: 'approved' },
];

let viewYear = new Date().getFullYear();
let viewMonth = new Date().getMonth();

async function loadReservations() {
  let rooms = DEMO_ROOMS;
  let bookings = DEMO_BOOKINGS;
  let usingDemo = true;

  try {
    const [apiRooms, apiBookings] = await Promise.all([getRooms(), getBookings()]);
    if (apiRooms.length) {
      rooms = apiRooms.map(normalizeRoom);
      usingDemo = false;
    }
    if (apiBookings.length) {
      bookings = apiBookings.map(normalizeBooking);
      usingDemo = false;
    }
  } catch (err) {
    console.warn('API unavailable, using demo data:', err.message);
  }

  const dates = getMonthRange(viewYear, viewMonth);
  const rangeStart = dates[0].toISOString().slice(0, 10);
  const periodLabel = dates[0].toLocaleString('en-US', { month: 'long', year: 'numeric' });

  document.getElementById('timeline-period').textContent = periodLabel;
  document.getElementById('pending-count').textContent = usingDemo
    ? '18 ACTION REQUIRED'
    : `${bookings.filter((b) => b.status === 'pending').length} ACTION REQUIRED`;

  renderTimeline({
    rooms,
    items: bookings,
    rangeStart,
    dates,
    barRenderer: renderBookingBar,
    onBarClick: openBookingDrawer,
  });
}

function bindTimelineNav() {
  document.getElementById('timeline-prev')?.addEventListener('click', () => {
    viewMonth -= 1;
    if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
    loadReservations();
  });
  document.getElementById('timeline-next')?.addEventListener('click', () => {
    viewMonth += 1;
    if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
    loadReservations();
  });
  document.getElementById('timeline-today')?.addEventListener('click', () => {
    const now = new Date();
    viewYear = now.getFullYear();
    viewMonth = now.getMonth();
    loadReservations();
  });
}

requireAuth();

await initAppLayout({
  portal: 'admin',
  activePage: 'reservations',
  title: 'Reservation Operations Center',
  subtitle: 'Mission Control',
});

document.getElementById('timeline-mount').innerHTML = renderTimelineShell({
  title: 'Facility Utilization Master Timeline',
  periodLabel: new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' }),
});

bindTimelineNav();

try {
  await loadReservations();
} catch (err) {
  showError(document.getElementById('page-content'), err.message);
}
