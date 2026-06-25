import { initManageRequestsModal, isManageRequestsModalOpen, closeManageRequestsModal } from '/assets/js/features/manage-requests.js';
import { initManageReservationsModal, isManageReservationsModalOpen, closeManageReservationsModal } from '/assets/js/features/manage-reservations.js';
import { initManageFacilitiesModal, isManageFacilitiesModalOpen, closeManageFacilitiesModal } from '/assets/js/features/manage-facilities.js';
import { initReservationWizard, isReservationWizardOpen, closeReservationWizard } from '/assets/js/features/reservation-wizard.js';
import { initGroupWizard, isGroupWizardOpen, closeGroupWizard } from '/assets/js/features/group-reservation-wizard.js';
import { initTabGroup, switchTabPanel } from '/assets/js/layout/tabs.js';
import { initAdminEnhancements, lockStaticChrome, releaseChromeBoot, animateDrawerOpen, animateModalOpen, animateNotificationsPanel } from '/assets/js/layout/animations.js';
import { initAdminPageNavTransitions, initGuestPageNavTransitions } from '/assets/js/layout/page-transitions.js';
import {
  isDesktopSidebar,
  openMobileSidebar,
  closeMobileSidebar,
  closeSidebarIfMobile,
  syncMobileSidebarToggleUi,
  bindMobileSidebarEvents,
  isMobileSidebarOpen,
} from '/assets/js/layout/mobile-sidebar.js';

export const ADMIN_NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', href: '/admin/dashboard.html' },
  { id: 'reservations', label: 'Reservations', icon: 'calendar_month', href: '/admin/reservations.html' },
  { id: 'facilities', label: 'Facilities', icon: 'domain', href: '/admin/facilities.html' },
  { id: 'residents', label: 'Residents', icon: 'groups', href: '/admin/residents.html' },
  { id: 'payments', label: 'Payments', icon: 'payments', href: '/admin/payments.html' },
  { id: 'settings', label: 'Settings', icon: 'settings', href: '/admin/settings.html' },
];

export const GUEST_NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', href: '/guest/dashboard.html' },
  { id: 'reservations', label: 'Reservations', icon: 'event_available', href: '/guest/reservations.html' },
  { id: 'facilities', label: 'Facilities', icon: 'domain', href: '/guest/facilities.html' },
  { id: 'settings', label: 'Settings', icon: 'settings', href: '/guest/settings.html' },
];

export const GUEST_NEW_RESERVATION_FOOTER = `
  <div class="mb-md px-sm admin-sidebar-footer-action js-requires-write">
    <a href="/guest/reservations.html#new-reservation" class="w-full flex items-center gap-md px-md py-md bg-primary text-on-primary rounded-lg font-body-md font-semibold hover:bg-primary/90 transition-colors min-h-[3rem] no-underline">
      <span class="material-symbols-outlined text-[1.35rem] shrink-0">add</span>
      <span class="admin-nav-label">New Reservation</span>
    </a>
  </div>`;

export async function loadComponent(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  return res.text();
}

const SIDEBAR_COLLAPSED_KEY = 'admin-sidebar-collapsed';
const TEMPLATE_CACHE_KEY = 'aptspace.admin.templates.v3';

/** @type {Promise<Record<string, string>> | null} */
let templatesPromise = null;

function readTemplateCache() {
  try {
    const raw = sessionStorage.getItem(TEMPLATE_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeTemplateCache(templates) {
  try {
    sessionStorage.setItem(TEMPLATE_CACHE_KEY, JSON.stringify(templates));
  } catch {
    /* quota or private mode */
  }
}

async function loadAdminTemplates() {
  const cached = readTemplateCache();
  if (cached?.sidebar && cached?.facilityCatalog) return cached;

  if (!templatesPromise) {
    templatesPromise = Promise.all([
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
      loadComponent('/components/facility-catalog-modal.html'),
    ]).then(([sidebar, header, drawer, modal, manageRequests, manageReservations, manageFacilities, reservationWizard, groupWizard, notifications, facilityCatalog]) => {
      const bundle = {
        sidebar,
        header,
        drawer,
        modal,
        manageRequests,
        manageReservations,
        manageFacilities,
        reservationWizard,
        groupWizard,
        notifications,
        facilityCatalog,
      };
      writeTemplateCache(bundle);
      return bundle;
    });
  }

  return templatesPromise;
}

/** @type {Promise<Record<string, string>> | null} */
let guestTemplatesPromise = null;

async function loadGuestTemplates() {
  if (!guestTemplatesPromise) {
    guestTemplatesPromise = Promise.all([
      loadComponent('/components/sidebar.html'),
      loadComponent('/components/header.html'),
      loadComponent('/components/notifications.html'),
    ]).then(([sidebar, header, notifications]) => ({ sidebar, header, notifications }));
  }
  return guestTemplatesPromise;
}

if (typeof window !== 'undefined' && window.location.pathname.includes('/admin/')) {
  loadAdminTemplates().catch(() => {});
}

if (typeof window !== 'undefined' && window.location.pathname.includes('/guest/')) {
  loadGuestTemplates().catch(() => {});
}

function isSidebarCollapsedPreferred() {
  return isDesktopSidebar() && localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
}

function buildAdminShell({
  templates,
  pageContent,
  activePage,
  title,
  subtitle,
  portalLabel,
  userName,
  userRole,
  userInitial,
  collapsed,
  navItems = ADMIN_NAV,
  brandHref = '/admin/dashboard.html',
  sidebarFooter = '',
}) {
  const sidebar = templates.sidebar
    .replace('{{NAV_ITEMS}}', renderSidebarNav(navItems, activePage))
    .replace('{{PORTAL_LABEL}}', portalLabel)
    .replace('{{BRAND_HREF}}', brandHref)
    .replace('{{SIDEBAR_FOOTER}}', sidebarFooter)
    .replace('{{PROPERTY_LINK}}', '/guest/dashboard.html')
    .replace('{{PROPERTY_LABEL}}', 'Guest Portal');

  const header = templates.header
    .replace('{{TITLE}}', title)
    .replace('{{SUBTITLE}}', subtitle)
    .replace('{{USER_NAME}}', userName)
    .replace('{{USER_ROLE}}', userRole)
    .replace('{{USER_INITIAL}}', userInitial);

  return `
    ${sidebar}
    <main class="flex-1 flex flex-col overflow-hidden h-full min-w-0">
      ${header}
      <div id="page-content" class="flex-1 overflow-y-auto min-h-0">${pageContent}</div>
    </main>
    ${templates.drawer || ''}
    ${templates.modal || ''}
    ${templates.manageRequests || ''}
    ${templates.manageReservations || ''}
    ${templates.manageFacilities || ''}
    ${templates.reservationWizard || ''}
    ${templates.groupWizard || ''}
    ${templates.notifications || ''}
    ${templates.facilityCatalog || ''}
    <div id="sidebar-overlay" class="hidden fixed inset-0 bg-black/40 z-[50]" aria-hidden="true"></div>
  `;
}

function guestBottomNavLinkClass(active, id) {
  const base = 'guest-bottom-nav-link flex flex-col items-center justify-center gap-0.5 flex-1 min-h-[3rem] px-1 py-2 text-[0.6875rem] font-medium no-underline transition-colors';
  return active === id
    ? `${base} is-active text-primary`
    : `${base} text-on-surface-variant`;
}

function renderGuestBottomNav(items, active) {
  return `
    <nav class="guest-bottom-nav lg:hidden" aria-label="Mobile navigation">
      ${items.map((item) => `
        <a class="${guestBottomNavLinkClass(active, item.id)}" href="${item.href}" aria-current="${active === item.id ? 'page' : 'false'}">
          <span class="material-symbols-outlined text-[1.35rem] leading-none">${item.icon}</span>
          <span class="guest-bottom-nav-label">${item.label}</span>
        </a>
      `).join('')}
    </nav>`;
}

function buildGuestShell(options) {
  const shell = buildAdminShell({
    ...options,
    navItems: GUEST_NAV,
    brandHref: '/guest/dashboard.html',
    sidebarFooter: GUEST_NEW_RESERVATION_FOOTER,
    templates: {
      sidebar: options.templates.sidebar,
      header: options.templates.header,
      notifications: options.templates.notifications,
    },
  });
  return `${shell}${renderGuestBottomNav(GUEST_NAV, options.activePage)}`;
}

function updateActiveNav(activePage, navItems = ADMIN_NAV) {
  document.querySelectorAll('#app-sidebar nav a, .guest-bottom-nav a').forEach((link) => {
    const href = link.getAttribute('href') || '';
    const page = href.split('/').pop() || '';
    const id = navItems.find((item) => item.href.endsWith(page))?.id;
    const active = id === activePage;
    if (link.closest('.guest-bottom-nav')) {
      link.className = guestBottomNavLinkClass(active, id || '');
    } else {
      link.className = navLinkClass(active, id || '');
    }
    link.setAttribute('aria-current', active ? 'page' : 'false');
  });
}

function updateAdminHeader({ title, subtitle, userName, userRole, userInitial }) {
  const titleEl = document.querySelector('.admin-page-title');
  const subtitleEl = document.querySelector('.admin-page-subtitle');
  const nameEl = document.querySelector('.admin-user-chip__name');
  const roleEl = document.querySelector('.admin-user-chip__role');
  const initialEl = document.querySelector('.admin-user-chip__avatar');

  if (titleEl) titleEl.textContent = title;
  if (subtitleEl) subtitleEl.textContent = subtitle;
  if (nameEl) nameEl.textContent = userName;
  if (roleEl) roleEl.textContent = userRole;
  if (initialEl) initialEl.textContent = userInitial;
}

function navLinkClass(active, id) {
  const base = 'flex items-center gap-md px-md py-md rounded-lg text-body-md';
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

function extractPreservedLayoutNodes() {
  const fragment = document.createDocumentFragment();
  document.querySelectorAll('[data-layout-preserve]').forEach((el) => {
    fragment.appendChild(el);
  });
  return fragment;
}

export async function initAppLayout(config = {}) {
  const {
    portal = 'admin',
    activePage = 'dashboard',
    title = 'Mission Control',
    subtitle = 'Operations Center',
    portalLabel = portal === 'admin' ? 'Seminary Admin' : 'Guest Portal',
    deferEnhancements = false,
  } = config;

  const isGuest = portal === 'guest';
  const navItems = isGuest ? GUEST_NAV : ADMIN_NAV;

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const userName = user.full_name || user.name || (isGuest ? 'Guest User' : 'Admin User');
  const userRole = user.role || (isGuest ? 'Guest' : 'Ops Commander');
  const userInitial = userName.charAt(0).toUpperCase();
  const collapsed = isSidebarCollapsedPreferred();

  document.documentElement.classList.add('admin-chrome-boot');

  const savedContent = document.getElementById('page-content')?.innerHTML || '';
  const preservedNodes = extractPreservedLayoutNodes();
  const existingSidebar = document.getElementById('app-sidebar');

  if (existingSidebar) {
    document.body.className = `admin-shell bg-background text-on-surface font-body-md h-screen overflow-hidden flex relative${isGuest ? ' guest-portal' : ''}${collapsed ? ' sidebar-collapsed' : ''}`;
    updateActiveNav(activePage, navItems);
    updateAdminHeader({ title, subtitle, userName, userRole, userInitial });
    lockStaticChrome();
    if (!deferEnhancements && !isGuest) initAdminEnhancements().catch(() => releaseChromeBoot());
    else releaseChromeBoot();
    return;
  }

  const templates = isGuest ? await loadGuestTemplates() : await loadAdminTemplates();
  const shellHtml = isGuest
    ? buildGuestShell({
        templates,
        pageContent: savedContent,
        activePage,
        title,
        subtitle,
        portalLabel,
        userName,
        userRole,
        userInitial,
        collapsed,
      })
    : buildAdminShell({
        templates,
        pageContent: savedContent,
        activePage,
        title,
        subtitle,
        portalLabel,
        userName,
        userRole,
        userInitial,
        collapsed,
        brandHref: '/admin/dashboard.html',
      });

  document.body.innerHTML = shellHtml;
  if (preservedNodes.childNodes.length) {
    document.body.appendChild(preservedNodes);
  }
  document.body.className = `admin-shell bg-background text-on-surface font-body-md h-screen overflow-hidden flex relative${isGuest ? ' guest-portal' : ''}${collapsed ? ' sidebar-collapsed' : ''}`;

  bindLayoutEvents({ isGuest });
  initSidebarCollapse();
  bindMobileSidebarEvents({ onScrollLockChange: updateBodyScrollLock });
  if (!isGuest) {
    initManageRequestsModal();
    initManageReservationsModal();
    initManageFacilitiesModal();
    initReservationWizard();
    initGroupWizard();
    initDrawerTabs();
    initAdminPageNavTransitions();
    lockStaticChrome();
    if (!deferEnhancements) initAdminEnhancements().catch(() => releaseChromeBoot());
  } else {
    initGuestPageNavTransitions();
    releaseChromeBoot();
  }
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

function initSidebarCollapse() {
  const collapseBtn = document.getElementById('sidebar-collapse-btn');
  const openBtn = document.getElementById('sidebar-open-btn');

  syncSidebarToggleUi();

  collapseBtn?.addEventListener('click', () => {
    if (!isDesktopSidebar()) {
      closeMobileSidebar();
      return;
    }
    setSidebarCollapsed(true);
  });
  openBtn?.addEventListener('click', () => {
    if (!isDesktopSidebar()) {
      if (isMobileSidebarOpen()) {
        closeMobileSidebar();
      } else {
        openMobileSidebar();
      }
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

function setSidebarCollapsed(collapsed) {
  const shell = document.body;
  document.documentElement.classList.add('sidebar-user-toggle');
  shell.classList.toggle('sidebar-collapsed', collapsed);
  if (isDesktopSidebar()) {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
  }
  if (collapsed) closeMobileSidebar();
  syncSidebarToggleUi();
  requestAnimationFrame(() => {
    document.documentElement.classList.remove('sidebar-user-toggle');
  });
}

function syncSidebarToggleUi() {
  syncMobileSidebarToggleUi();
}

function bindLayoutEvents({ isGuest = false } = {}) {
  document.getElementById('logout-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login.html';
  });

  document.getElementById('notifications-btn')?.addEventListener('click', async () => {
    const panel = document.getElementById('notifications-panel');
    const list  = document.getElementById('notifications-list');
    if (!panel) return;

    const isHidden = panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !isHidden);

    if (isHidden && list) {
      list.innerHTML = '<div class="p-4 text-body-sm text-on-surface-variant text-center">Loading…</div>';
      try {
        if (isGuest) {
          const items = [
            { icon: 'event_available', text: 'Reservation updates', sub: 'Check My Reservations for status changes' },
            { icon: 'info', text: 'Need help?', sub: 'Contact facility staff from your dashboard' },
            { icon: 'wifi', text: 'Portal status: Live', sub: 'Guest services are available' },
          ];
          list.innerHTML = items.map((item) => `
          <div class="p-4 border-b border-outline-variant/30 hover:bg-surface-container-low/50 flex items-start gap-3">
            <span class="material-symbols-outlined text-[18px] text-on-surface-variant mt-0.5">${item.icon}</span>
            <div>
              <p class="text-body-sm font-medium text-on-surface">${item.text}</p>
              <p class="text-[11px] text-on-surface-variant mt-0.5">${item.sub}</p>
            </div>
          </div>`).join('');
          return;
        }

        const { getAdminSummary } = await import('/assets/js/services/api.js');
        const summary = await getAdminSummary();
        const kpis    = summary?.kpis || {};
        const pending  = Number(kpis.pending || 0);
        const arriving = Number(kpis.upcoming || 0);

        const items = [
          pending > 0
            ? { icon: 'pending_actions', text: `${pending} pending reservation${pending === 1 ? '' : 's'}`, sub: 'Requires admin review' }
            : { icon: 'check_circle', text: 'No pending reservations', sub: 'All clear' },
          { icon: 'login', text: `${arriving} upcoming check-in${arriving === 1 ? '' : 's'}`, sub: 'Approved reservations ahead' },
          { icon: 'wifi',  text: 'System status: Live', sub: 'All services operational' },
        ];

        list.innerHTML = items.map(item => `
          <div class="p-4 border-b border-outline-variant/30 hover:bg-surface-container-low/50 flex items-start gap-3">
            <span class="material-symbols-outlined text-[18px] text-on-surface-variant mt-0.5">${item.icon}</span>
            <div>
              <p class="text-body-sm font-medium text-on-surface">${item.text}</p>
              <p class="text-[11px] text-on-surface-variant mt-0.5">${item.sub}</p>
            </div>
          </div>`).join('');
      } catch {
        list.innerHTML = '<div class="p-4 text-body-sm text-error text-center">Could not load notifications.</div>';
      }
    }
  });

  document.getElementById('close-notifications')?.addEventListener('click', () => {
    const panel = document.getElementById('notifications-panel');
    if (panel) panel.classList.add('hidden');
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
      if (!isGuest && isManageRequestsModalOpen()) {
        closeManageRequestsModal();
        return;
      }
      if (!isGuest && isManageReservationsModalOpen()) {
        closeManageReservationsModal();
        return;
      }
      if (!isGuest && isManageFacilitiesModalOpen()) {
        closeManageFacilitiesModal();
        return;
      }
      if (!isGuest && isReservationWizardOpen()) {
        closeReservationWizard();
        return;
      }
      if (!isGuest && isGroupWizardOpen()) {
        closeGroupWizard();
        return;
      }
      if (!isGuest) {
        closeModal();
        closeDrawer();
      }
      closeSidebarIfMobile();
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
  const mobileSidebarOpen = isMobileSidebarOpen();
  document.body.style.overflow = (modalOpen || drawerOpen || manageOpen || mobileSidebarOpen) ? 'hidden' : '';

  const pageContent = document.getElementById('page-content');
  if (pageContent) {
    pageContent.style.overflow = mobileSidebarOpen ? 'hidden' : '';
  }
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
