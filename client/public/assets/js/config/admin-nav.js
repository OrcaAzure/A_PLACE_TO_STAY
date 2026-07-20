/** Admin sidebar and mobile bottom navigation items. */

export const ADMIN_NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', href: '/admin/dashboard.html' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar_month', href: '/admin/calendar.html' },
  { id: 'reservations', label: 'Reservations', icon: 'event_note', href: '/admin/reservations.html' },
  { id: 'facilities', label: 'Facilities', icon: 'domain', href: '/admin/facilities.html' },
  { id: 'residents', label: 'Guest Access', icon: 'badge', href: '/admin/residents.html' },
  { id: 'payments', label: 'Billing', icon: 'payments', href: '/admin/payments.html' },
  { id: 'settings', label: 'Settings', icon: 'settings', href: '/admin/settings.html' },
];

/** Mobile bottom bar — scrolls horizontally on narrow viewports. */
export const ADMIN_MOBILE_NAV = [
  { id: 'dashboard', label: 'Home', icon: 'dashboard', href: '/admin/dashboard.html' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar_month', href: '/admin/calendar.html' },
  { id: 'reservations', label: 'Manage', icon: 'event_note', href: '/admin/reservations.html' },
  { id: 'facilities', label: 'Facilities', icon: 'domain', href: '/admin/facilities.html' },
  { id: 'residents', label: 'Guest Access', icon: 'badge', href: '/admin/residents.html' },
  { id: 'payments', label: 'Billing', icon: 'payments', href: '/admin/payments.html' },
  { id: 'settings', label: 'Settings', icon: 'settings', href: '/admin/settings.html' },
];
