import { initManageRequestsModal, isManageRequestsModalOpen, closeManageRequestsModal } from '/assets/js/features/manage-requests.js';

export const ADMIN_NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', href: '/admin/dashboard.html' },
  { id: 'reservations', label: 'Reservations', icon: 'calendar_month', href: '/admin/reservations.html' },
  { id: 'facilities', label: 'Facilities', icon: 'domain', href: '/admin/facilities.html' },
  { id: 'residents', label: 'Residents', icon: 'groups', href: '/admin/residents.html' },
  { id: 'payments', label: 'Payments', icon: 'payments', href: '/admin/payments.html' },
  { id: 'settings', label: 'Settings', icon: 'settings', href: '/admin/settings.html' },
];

export async function loadComponent(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  return res.text();
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
    portalLabel = portal === 'admin' ? 'Seminary Admin' : 'Guest Portal',
  } = config;

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const userName = user.full_name || user.name || 'Admin User';
  const userRole = user.role || 'Ops Commander';
  const userInitial = userName.charAt(0).toUpperCase();

  const [sidebarTpl, headerTpl, drawerTpl, modalTpl, manageRequestsTpl, notifTpl] = await Promise.all([
    loadComponent('/components/sidebar.html'),
    loadComponent('/components/header.html'),
    loadComponent('/components/drawer.html'),
    loadComponent('/components/modal.html'),
    loadComponent('/components/manage-requests-modal.html'),
    loadComponent('/components/notifications.html'),
  ]);

  document.body.className = 'bg-background text-on-surface font-body-md h-screen overflow-hidden flex relative';

  const sidebar = sidebarTpl
    .replace('{{NAV_ITEMS}}', renderSidebarNav(ADMIN_NAV, activePage))
    .replace('{{PORTAL_LABEL}}', portalLabel)
    .replace('{{PROPERTY_LINK}}', '/guest/dashboard.html')
    .replace('{{PROPERTY_LABEL}}', 'Guest Portal');

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

  bindLayoutEvents();
  initManageRequestsModal();
}

function bindLayoutEvents() {
  document.getElementById('logout-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login.html';
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
  document.getElementById('modal-close')?.addEventListener('click', closeModal);
  document.getElementById('modal-overlay')?.addEventListener('click', closeModal);
  document.getElementById('app-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'app-modal') closeModal();
  });

  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab')));
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (isManageRequestsModalOpen()) {
        closeManageRequestsModal();
        return;
      }
      closeModal();
      closeDrawer();
      closeSidebar();
    }
  });
}

function updateBodyScrollLock() {
  const modalOpen = !document.getElementById('app-modal')?.classList.contains('hidden');
  const drawer = document.getElementById('managementDrawer');
  const drawerOpen = drawer && !drawer.classList.contains('translate-x-full');
  const manageOpen = isManageRequestsModalOpen();
  document.body.style.overflow = (modalOpen || drawerOpen || manageOpen) ? 'hidden' : '';
}

function closeSidebar() {
  document.getElementById('app-sidebar')?.classList.remove('sidebar-open');
  document.getElementById('sidebar-overlay')?.classList.add('hidden');
  document.getElementById('sidebar-overlay')?.classList.remove('visible');
}

export function openDrawer(id, title, bodyHtml = '') {
  document.getElementById('drawerID').textContent = id;
  document.getElementById('drawerTitle').textContent = title;
  const body = document.getElementById('drawerBody');
  if (body && bodyHtml) body.innerHTML = bodyHtml;
  switchTab('details');
  document.getElementById('managementDrawer')?.classList.remove('translate-x-full');
  document.getElementById('drawerOverlay')?.classList.remove('hidden');
  updateBodyScrollLock();
}

export function closeDrawer() {
  document.getElementById('managementDrawer')?.classList.add('translate-x-full');
  document.getElementById('drawerOverlay')?.classList.add('hidden');
  updateBodyScrollLock();
}

export function openModal(title, bodyHtml, options = {}) {
  const { subtitle = '' } = options;
  const subtitleEl = document.getElementById('modalSubtitle');
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  if (subtitleEl) {
    if (subtitle) {
      subtitleEl.textContent = subtitle;
      subtitleEl.classList.remove('hidden');
    } else {
      subtitleEl.textContent = '';
      subtitleEl.classList.add('hidden');
    }
  }
  document.getElementById('app-modal')?.classList.remove('hidden');
  document.getElementById('modal-overlay')?.classList.remove('hidden');
  updateBodyScrollLock();
  document.getElementById('modal-close')?.focus();
}

export function closeModal() {
  document.getElementById('app-modal')?.classList.add('hidden');
  document.getElementById('modal-overlay')?.classList.add('hidden');
  updateBodyScrollLock();
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
