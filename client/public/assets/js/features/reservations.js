import { initAppLayout, showError } from '/assets/js/layout/ui.js';
import { requireAuth } from '/assets/js/services/auth.js';
import { mountBookingTimeline } from '/assets/js/features/timeline.js';

requireAuth();

await initAppLayout({
  portal: 'admin',
  activePage: 'reservations',
  title: 'Reservations',
  subtitle: 'Review and approve booking requests',
});

try {
  await mountBookingTimeline({
    mountEl: document.getElementById('timeline-mount'),
    title: 'Reservation Calendar',
  });
} catch (err) {
  showError(document.getElementById('page-content'), err.message);
}
