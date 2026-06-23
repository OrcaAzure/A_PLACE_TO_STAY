import { getRooms, getBookings, normalizeRoom, normalizeBooking } from '/assets/js/services/api.js';
import { initAppLayout, showError } from '/assets/js/layout/ui.js';
import { requireAuth } from '/assets/js/services/auth.js';
import {
  renderTimelineShell,
  renderTimeline,
  renderBookingBar,
  getMonthRange,
  openBookingModal,
} from '/assets/js/features/timeline.js';

let viewYear = new Date().getFullYear();
let viewMonth = new Date().getMonth();
let rawBookingsById = {};

async function loadReservations() {
  const [apiRooms, apiBookings] = await Promise.all([getRooms(), getBookings()]);
  const rooms = apiRooms.map(normalizeRoom);
  const bookings = apiBookings.map(normalizeBooking);

  rawBookingsById = Object.fromEntries(apiBookings.map((b) => [String(b.id), b]));

  const dates = getMonthRange(viewYear, viewMonth);
  const rangeStart = dates[0].toISOString().slice(0, 10);
  const periodLabel = dates[0].toLocaleString('en-US', { month: 'long', year: 'numeric' });

  document.getElementById('timeline-period').textContent = periodLabel;
  document.getElementById('pending-count').textContent =
    `${bookings.filter((b) => b.status === 'pending').length} PENDING`;

  renderTimeline({
    rooms,
    items: bookings,
    rangeStart,
    dates,
    barRenderer: renderBookingBar,
    onBarClick: (booking) => {
      openBookingModal(rawBookingsById[String(booking.id)] || booking);
    },
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
