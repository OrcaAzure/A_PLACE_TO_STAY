import { updateBooking } from './api.js';
import { initManageRequestsModal, isManageRequestsModalOpen, closeManageRequestsModal } from './manage-requests.js';

export const ADMIN_NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', href: './dashboard.html' },
  { id: 'reservations', label: 'Reservations', icon: 'calendar_month', href: './reservations.html' },
  { id: 'facilities', label: 'Facilities', icon: 'domain', href: './facilities.html' },
  { id: 'residents', label: 'Residents', icon: 'groups', href: './residents.html' },
  { id: 'payments', label: 'Payments', icon: 'payments', href: './payments.html' },
  { id: 'settings', label: 'Settings', icon: 'settings', href: './settings.html' },
];

export const PROPERTY_NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', href: './dashboard.html' },
  { id: 'properties', label: 'Properties', icon: 'apartment', href: './properties.html' },
  { id: 'units', label: 'Units', icon: 'door_front', href: './units.html' },
  { id: 'occupancy', label: 'Occupancy', icon: 'hotel', href: './occupancy.html' },
  { id: 'maintenance', label: 'Maintenance', icon: 'build', href: './maintenance.html' },
  { id: 'projects', label: 'Projects', icon: 'engineering', href: './projects.html' },
  { id: 'budgets', label: 'Budgets', icon: 'account_balance', href: './budgets.html' },
  { id: 'analytics', label: 'Analytics', icon: 'analytics', href: './analytics.html' },
];

export async function loadComponent(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  return res.text();
}

function assetBase() {
  return window.location.pathname.includes('/admin/') || window.location.pathname.includes('/property/')
    ? '../'
    : './';
}

function navLinkClass(active, id) {
  const base = 'flex items-center gap-md px-md py-sm transition-colors duration-200 rounded-lg';
  return active === id
    ? `${base} text-primary font-bold bg-primary-container/10`
    : `${base} hover:bg-surface-variant/50 text-on-surface-variant`;
}

function renderSidebarNav(items, active) {
  return items.map((item) => `
    <a class="${navLinkClass(active, item.id)}" href="${item.href}">
      <span class="material-symbols-outlined">${item.icon}</span>
      <span class="font-body-md">${item.label}</span>
    </a>
  `).join('');
}

export async function initAppLayout(config = {}) {
  const {
    portal = 'admin',
    activePage = 'dashboard',
    title = 'Mission Control',
    subtitle = 'Operations Center',
    portalLabel = portal === 'admin' ? 'Seminary Admin' : 'Property Management',
  } = config;

  const base = assetBase();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const userName = user.full_name || user.name || 'Admin User';
  const userRole = user.role || 'Ops Commander';
  const userInitial = userName.charAt(0).toUpperCase();

  const nav = portal === 'property' ? PROPERTY_NAV : ADMIN_NAV;
  const propertyLink = portal === 'admin'
    ? `${base}property/dashboard.html`
    : `${base}admin/dashboard.html`;
  const propertyLabel = portal === 'admin' ? 'Property Portal' : 'Admin Portal';

  const [sidebarTpl, headerTpl, drawerTpl, modalTpl, manageRequestsTpl, notifTpl] = await Promise.all([
    loadComponent(`${base}components/sidebar.html`),
    loadComponent(`${base}components/header.html`),
    loadComponent(`${base}components/drawer.html`),
    loadComponent(`${base}components/modal.html`),
    loadComponent(`${base}components/manage-requests-modal.html`),
    loadComponent(`${base}components/notifications.html`),
  ]);

  document.body.className = 'bg-[#f1f5f9] text-on-surface font-body-md h-screen overflow-hidden flex relative';

  const sidebar = sidebarTpl
    .replace('{{NAV_ITEMS}}', renderSidebarNav(nav, activePage))
    .replace('{{PORTAL_LABEL}}', portalLabel)
    .replace('{{PROPERTY_LINK}}', propertyLink)
    .replace('{{PROPERTY_LABEL}}', propertyLabel);

  const header = headerTpl
    .replace('{{TITLE}}', title)
    .replace('{{SUBTITLE}}', subtitle)
    .replace('{{USER_NAME}}', userName)
    .replace('{{USER_ROLE}}', userRole)
    .replace('{{USER_INITIAL}}', userInitial);

  const savedContent = document.getElementById('page-content')?.innerHTML || '';

  document.body.innerHTML = `
    ${sidebar}
    <main class="flex-1 flex flex-col overflow-hidden h-full">
      ${header}
      <div id="page-content" class="flex-1 overflow-y-auto p-6 space-y-6">${savedContent}</div>
    </main>
    ${drawerTpl}
    ${modalTpl}
    ${manageRequestsTpl}
    ${notifTpl}
    <div id="sidebar-overlay" class="hidden fixed inset-0 bg-black/40 z-[45]"></div>
  `;

  bindLayoutEvents(base);
  initManageRequestsModal();
}

function bindLayoutEvents(base) {
  document.getElementById('logout-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = `${base}login.html`;
  });

  document.getElementById('menu-toggle')?.addEventListener('click', () => {
    document.getElementById('app-sidebar')?.classList.add('sidebar-open');
    document.getElementById('sidebar-overlay')?.classList.remove('hidden');
    document.getElementById('sidebar-overlay')?.classList.add('visible');
  });

  document.getElementById('sidebar-overlay')?.addEventListener('click', closeSidebar);

  document.getElementById('notifications-btn')?.addEventListener('click', () => {
    document.getElementById('notifications-panel')?.classList.toggle('hidden');
  });

  document.getElementById('close-notifications')?.addEventListener('click', () => {
    document.getElementById('notifications-panel')?.classList.add('hidden');
  });

  document.getElementById('drawer-close')?.addEventListener('click', closeDrawer);
  document.getElementById('drawerOverlay')?.addEventListener('click', closeDrawer);
  document.getElementById('drawer-approve-btn')?.addEventListener('click', () => handleBookingAction('Approved'));
  document.getElementById('drawer-reject-btn')?.addEventListener('click', () => handleBookingAction('Rejected'));
  document.getElementById('modal-close')?.addEventListener('click', closeModal);
  document.getElementById('modal-overlay')?.addEventListener('click', closeModal);

  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab')));
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (isManageRequestsModalOpen()) {
        closeManageRequestsModal();
        return;
      }
      closeDrawer();
      closeModal();
      closeSidebar();
    }
  });
}

function closeSidebar() {
  document.getElementById('app-sidebar')?.classList.remove('sidebar-open');
  document.getElementById('sidebar-overlay')?.classList.add('hidden');
  document.getElementById('sidebar-overlay')?.classList.remove('visible');
}

async function handleBookingAction(newStatus) {
  const drawer = document.getElementById('managementDrawer');
  const bookingId = drawer?.dataset.bookingId;
  if (!bookingId) return;

  const approveBtn = document.getElementById('drawer-approve-btn');
  const rejectBtn  = document.getElementById('drawer-reject-btn');
  const feedback   = document.getElementById('drawer-action-feedback');
  const statusEl   = document.getElementById('drawer-status-value');

  approveBtn?.setAttribute('disabled', 'true');
  rejectBtn?.setAttribute('disabled', 'true');
  if (feedback) {
    feedback.textContent = newStatus === 'Approved' ? 'Approving booking…' : 'Rejecting booking…';
    feedback.className = 'text-body-sm mt-2 text-on-surface-variant';
    feedback.classList.remove('hidden');
  }

  try {
    await updateBooking(bookingId, { status: newStatus });
    if (statusEl) statusEl.textContent = newStatus;
    if (feedback) {
      feedback.textContent = `Booking ${newStatus.toLowerCase()}.`;
      feedback.className = 'text-body-sm mt-2 text-secondary font-bold';
    }
    window.dispatchEvent(new CustomEvent('booking:updated', { detail: { id: bookingId, status: newStatus } }));
    setTimeout(closeDrawer, 900);
  } catch (err) {
    if (feedback) {
      feedback.textContent = err.message || 'Could not update booking. Please try again.';
      feedback.className = 'text-body-sm mt-2 text-error font-bold';
    }
  } finally {
    approveBtn?.removeAttribute('disabled');
    rejectBtn?.removeAttribute('disabled');
  }
}

export function openDrawer(id, title, bodyHtml = '') {
  const drawer = document.getElementById('managementDrawer');
  const overlay = document.getElementById('drawerOverlay');
  document.getElementById('drawerID').textContent = id;
  document.getElementById('drawerTitle').textContent = title;
  const body = document.getElementById('drawerBody');
  if (body && bodyHtml) body.innerHTML = bodyHtml;
  drawer?.classList.remove('translate-x-full');
  overlay?.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

export function closeDrawer() {
  document.getElementById('managementDrawer')?.classList.add('translate-x-full');
  document.getElementById('drawerOverlay')?.classList.add('hidden');
  document.body.style.overflow = '';
}

export function openModal(title, bodyHtml) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('app-modal')?.classList.remove('hidden');
  document.getElementById('modal-overlay')?.classList.remove('hidden');
}

export function closeModal() {
  document.getElementById('app-modal')?.classList.add('hidden');
  document.getElementById('modal-overlay')?.classList.add('hidden');
}

export function switchTab(tabId) {
  document.querySelectorAll('[data-tab]').forEach((btn) => {
    const active = btn.getAttribute('data-tab') === tabId;
    btn.classList.toggle('border-primary', active);
    btn.classList.toggle('text-primary', active);
    btn.classList.toggle('border-transparent', !active);
    btn.classList.toggle('text-on-surface-variant', !active);
  });
  document.querySelectorAll('[data-tab-content]').forEach((el) => {
    el.classList.toggle('hidden', el.getAttribute('data-tab-content') !== tabId);
  });
}

export function syncTimelineScroll() {
  const containers = document.querySelectorAll('.timeline-scroll');
  containers.forEach((container) => {
    container.addEventListener('scroll', () => {
      containers.forEach((c) => {
        if (c !== container) c.scrollLeft = container.scrollLeft;
      });
    });
  });
}

export function scrollTimelineToToday(dayIndex = 9, dayWidth = 80) {
  document.querySelectorAll('.timeline-scroll').forEach((c) => {
    c.scrollLeft = dayWidth * (dayIndex - 1);
  });
}

export function showError(container, message) {
  const el = document.createElement('div');
  el.className = 'error-banner';
  el.textContent = message;
  container.prepend(el);
}

export function showLoading(container) {
  const el = document.createElement('div');
  el.className = 'loading-overlay';
  el.innerHTML = '<span class="text-label-md text-primary font-bold">Loading...</span>';
  container.style.position = 'relative';
  container.appendChild(el);
  return () => el.remove();
}