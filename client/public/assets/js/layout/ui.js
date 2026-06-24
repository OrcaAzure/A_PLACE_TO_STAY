import { initManageRequestsModal, isManageRequestsModalOpen, closeManageRequestsModal } from '/assets/js/features/manage-requests.js';
import { initManageReservationsModal, isManageReservationsModalOpen, closeManageReservationsModal } from '/assets/js/features/manage-reservations.js';
import { initManageFacilitiesModal, isManageFacilitiesModalOpen, closeManageFacilitiesModal } from '/assets/js/features/manage-facilities.js';
import { initReservationWizard, isReservationWizardOpen, closeReservationWizard } from '/assets/js/features/reservation-wizard.js';
import { initGroupWizard, isGroupWizardOpen, closeGroupWizard } from '/assets/js/features/group-reservation-wizard.js';
import { initTabGroup, switchTabPanel } from '/assets/js/layout/tabs.js';
import { initAdminEnhancements, animateDrawerOpen, animateModalOpen, animateNotificationsPanel } from '/assets/js/layout/animations.js';
import { initAdminPageNavTransitions } from '/assets/js/layout/page-transitions.js';

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
  const base = 'flex items-center gap-md px-md py-md transition-colors duration-200 rounded-lg text-body-md';
  return active === id
    ? `${base} admin-nav-active text-primary font-bold`
    : `${base} hover:bg-surface-variant/50 text-on-surface-variant`;
}

function renderSidebarNav(items, active) {
  return items.map((item) => `
    <a class="${navLinkClass(active, item.id)}" href="${item.href}">
      <span class="material-symbols-outlined">${item.icon}</span>
      <span class="font-body-md admin-nav-label">${item.label}</span>
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

  const [sidebarTpl, headerTpl, drawerTpl, modalTpl, manageRequestsTpl, manageReservationsTpl, manageFacilitiesTpl, reservationWizardTpl, groupWizardTpl, notifTpl] = await Promise.all([
    loadComponent('/components/sidebar.html'),
    loadComponent('/components/header.html'),
    loadComponent('/components/drawer.html'),
    loadComponent('/components/modal.html'),
    loadComponent('/components/manage-requests-modal.html'),
    loadComponent('/components/manage-reservations-modal.html'),
    loadComponent('/components/manage-facilities-modal.html'),
    loadComponent('/components/reservation-wizard-modal.html'),
    loadComponent('/components/group-wizard-modal.html'),
    loadComponent('/components/notifications.html'),
  ]);

  document.body.className = 'admin-shell bg-background text-on-surface font-body-md h-screen overflow-hidden flex relative';

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
      <div id="page-content" class="flex-1 overflow-y-auto p-6 lg:p-8 space-y-6 lg:space-y-8">${savedContent}</div>
    </main>
    ${drawerTpl}
    ${modalTpl}
    ${manageRequestsTpl}
    ${manageReservationsTpl}
    ${manageFacilitiesTpl}
    ${reservationWizardTpl}
    ${groupWizardTpl}
    ${notifTpl}
    <div id="sidebar-overlay" class="hidden fixed inset-0 bg-black/40 z-[45]"></div>
  `;

  bindLayoutEvents();
  initSidebarCollapse();
  initManageRequestsModal();
  initManageReservationsModal();
  initManageFacilitiesModal();
  initReservationWizard();
  initGroupWizard();
  initDrawerTabs();
  initAdminPageNavTransitions();
  initAdminEnhancements().catch(() => {});
}

let drawerTabGroup = null;

function initDrawerTabs() {
  const drawer = document.getElementById('managementDrawer');
  if (!drawer) return;
  drawerTabGroup = initTabGroup({
    root: drawer,
    tabAttr: 'data-drawer-tab',
    panelAttr: 'data-drawer-panel',
    useHiddenClass: true,
  });
}

const SIDEBAR_COLLAPSED_KEY = 'admin-sidebar-collapsed';

function initSidebarCollapse() {
  const shell = document.body;
  const openBtn = document.getElementById('sidebar-open-btn');
  const collapseBtn = document.getElementById('sidebar-collapse-btn');

  if (window.matchMedia('(min-width: 1024px)').matches && localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1') {
    shell.classList.add('sidebar-collapsed');
  }
  syncSidebarToggleUi();

  collapseBtn?.addEventListener('click', () => setSidebarCollapsed(true));
  openBtn?.addEventListener('click', () => {
    if (window.matchMedia('(max-width: 1023px)').matches) {
      openMobileSidebar();
      return;
    }
    setSidebarCollapsed(false);
  });

  window.addEventListener('resize', () => {
    if (!isDesktopSidebar()) {
      document.body.classList.remove('sidebar-collapsed');
    } else if (localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1') {
      document.body.classList.add('sidebar-collapsed');
    }
    syncSidebarToggleUi();
  });
}

function isDesktopSidebar() {
  return window.matchMedia('(min-width: 1024px)').matches;
}

function setSidebarCollapsed(collapsed) {
  const shell = document.body;
  shell.classList.toggle('sidebar-collapsed', collapsed);
  if (isDesktopSidebar()) {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
  }
  if (collapsed) closeSidebar();
  syncSidebarToggleUi();
}

function syncSidebarToggleUi() {
  const openBtn = document.getElementById('sidebar-open-btn');
  const icon = openBtn?.querySelector('.sidebar-open-btn__icon');
  const collapsed = document.body.classList.contains('sidebar-collapsed');
  const mobile = !isDesktopSidebar();

  if (openBtn) {
    openBtn.setAttribute('aria-expanded', mobile ? 'false' : String(!collapsed));
    openBtn.setAttribute('aria-label', mobile ? 'Open menu' : 'Show sidebar');
    openBtn.title = mobile ? 'Open menu' : 'Show sidebar';
  }
  if (icon) {
    icon.textContent = 'menu';
  }
}

function openMobileSidebar() {
  document.getElementById('app-sidebar')?.classList.add('sidebar-open');
  document.getElementById('sidebar-overlay')?.classList.remove('hidden');
  document.getElementById('sidebar-overlay')?.classList.add('visible');
  document.getElementById('sidebar-open-btn')?.setAttribute('aria-expanded', 'true');
}

function bindLayoutEvents() {
  document.getElementById('logout-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login.html';
  });

  document.getElementById('sidebar-overlay')?.addEventListener('click', closeSidebar);

  document.getElementById('notifications-btn')?.addEventListener('click', () => {
    const panel = document.getElementById('notifications-panel');
    if (!panel) return;
    const opening = panel.classList.contains('hidden');
    if (opening) {
      animateNotificationsPanel(panel, true).catch(() => panel.classList.remove('hidden'));
    } else {
      animateNotificationsPanel(panel, false).catch(() => panel.classList.add('hidden'));
    }
  });

  document.getElementById('close-notifications')?.addEventListener('click', () => {
    const panel = document.getElementById('notifications-panel');
    if (panel) {
      animateNotificationsPanel(panel, false).catch(() => panel.classList.add('hidden'));
    }
  });

  document.getElementById('drawer-close')?.addEventListener('click', closeDrawer);
  document.getElementById('drawerOverlay')?.addEventListener('click', closeDrawer);
  document.getElementById('modal-close')?.addEventListener('click', closeModal);
  document.getElementById('modal-overlay')?.addEventListener('click', closeModal);
  document.getElementById('app-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'app-modal') closeModal();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (isManageRequestsModalOpen()) {
        closeManageRequestsModal();
        return;
      }
      if (isManageReservationsModalOpen()) {
        closeManageReservationsModal();
        return;
      }
      if (isManageFacilitiesModalOpen()) {
        closeManageFacilitiesModal();
        return;
      }
      if (isReservationWizardOpen()) {
        closeReservationWizard();
        return;
      }
      if (isGroupWizardOpen()) {
        closeGroupWizard();
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
  const manageOpen = isManageRequestsModalOpen()
    || isManageReservationsModalOpen()
    || isManageFacilitiesModalOpen()
    || isReservationWizardOpen()
    || isGroupWizardOpen();
  document.body.style.overflow = (modalOpen || drawerOpen || manageOpen) ? 'hidden' : '';
}

function closeSidebar() {
  document.getElementById('app-sidebar')?.classList.remove('sidebar-open');
  document.getElementById('sidebar-overlay')?.classList.add('hidden');
  document.getElementById('sidebar-overlay')?.classList.remove('visible');
  syncSidebarToggleUi();
}

export function openDrawer(id, title, bodyHtml = '') {
  document.getElementById('drawerID').textContent = id;
  document.getElementById('drawerTitle').textContent = title;
  const body = document.getElementById('drawerBody');
  if (body && bodyHtml) body.innerHTML = bodyHtml;
  switchDrawerTab('details');
  document.getElementById('managementDrawer')?.classList.remove('translate-x-full');
  document.getElementById('drawerOverlay')?.classList.remove('hidden');
  updateBodyScrollLock();
  const drawer = document.getElementById('managementDrawer');
  animateDrawerOpen(drawer).catch(() => {});
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
  const shell = document.querySelector('#app-modal > div');
  animateModalOpen(shell).catch(() => {});
}

export function closeModal() {
  document.getElementById('app-modal')?.classList.add('hidden');
  document.getElementById('modal-overlay')?.classList.add('hidden');
  updateBodyScrollLock();
}

export function switchDrawerTab(tabId) {
  if (drawerTabGroup) {
    drawerTabGroup.switchTo(tabId);
    return;
  }

  const drawer = document.getElementById('managementDrawer');
  if (!drawer) return;

  const tabs = drawer.querySelectorAll('[data-drawer-tab]');
  const panels = drawer.querySelectorAll('[data-drawer-panel]');

  tabs.forEach((btn) => {
    const active = btn.getAttribute('data-drawer-tab') === tabId;
    btn.classList.toggle('app-tab-active', active);
    btn.classList.toggle('border-primary', active);
    btn.classList.toggle('text-primary', active);
    btn.classList.toggle('border-transparent', !active);
    btn.classList.toggle('text-on-surface-variant', !active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  switchTabPanel({
    tabs,
    panels,
    activeId: tabId,
    tabAttr: 'data-drawer-tab',
    panelAttr: 'data-drawer-panel',
    useHiddenClass: true,
  });
}

/** @deprecated Use switchDrawerTab — kept for backward compatibility */
export function switchTab(tabId) {
  switchDrawerTab(tabId);
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
