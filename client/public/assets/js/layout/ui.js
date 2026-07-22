/**
 * App shell builder for both portals — the single entry that turns a bare
 * page into the admin or guest layout.
 *
 * Responsibilities:
 *   - fetch + cache HTML component templates (sidebar, navs, modals)
 *   - build the admin shell (sidebar/topbar) or guest shell (top nav,
 *     mobile bottom nav) around #page-content
 *   - wire global chrome: drawers, notifications, user dropdown, splash/idle,
 *     page transitions, and the shared confirm modal
 *
 * Every portal page calls initAppLayout() once on load; soft navigations
 * reuse the existing shell.
 */
import { initManageRequestsModal, isManageRequestsModalOpen, closeManageRequestsModal } from '/assets/js/features/manage-requests.js';
import { initManageReservationsModal, isManageReservationsModalOpen, closeManageReservationsModal } from '/assets/js/features/manage-reservations.js';
import { initManageVenueBookingsModal, isManageVenueBookingsModalOpen, closeManageVenueBookingsModal } from '/assets/js/features/manage-venue-bookings.js';
import { initManageFacilitiesModal, isManageFacilitiesModalOpen, closeManageFacilitiesModal } from '/assets/js/features/manage-facilities.js';
import { initManageVenuesModal, isManageVenuesModalOpen, closeManageVenuesModal } from '/assets/js/features/manage-venues.js';
import { initReservationWizard, isReservationWizardOpen, closeReservationWizard } from '/assets/js/features/reservation-wizard.js';
import { initGroupWizard, isGroupWizardOpen, closeGroupWizard } from '/assets/js/features/group-reservation-wizard.js';
import { initVenueBookingWizard, isVenueBookingWizardOpen, closeVenueBookingWizard } from '/assets/js/features/venue-booking-wizard.js';
import { initTabGroup, switchTabPanel } from '/assets/js/layout/tabs.js';
import { initAdminEnhancements, lockStaticChrome, releaseChromeBoot, animateDrawerOpen, animateModalOpen, animateNotificationsPanel } from '/assets/js/layout/animations.js';
import { initAdminPageNavTransitions, initGuestPageNavTransitions } from '/assets/js/layout/page-transitions.js';
import { initGuestPortalChrome } from '/assets/js/layout/guest-portal.js';
import { initSplashIdle, dismissAptSplash } from '/assets/js/layout/splash-idle.js';
import { bindNotificationBell } from '/assets/js/layout/notifications.js';
import { formatRoleLabel, getCurrentUser, applyRoleUI, refreshAdminReadOnlyUI, getAdminNavItems, getAdminMobileNavItems } from '/assets/js/services/auth.js';
import { escapeHtml } from '/assets/js/features/reservation-shared.js';
import {
  isDesktopSidebar,
  closeMobileSidebar,
  closeSidebarIfMobile,
  syncMobileSidebarToggleUi,
  isMobileSidebarOpen,
} from '/assets/js/layout/mobile-sidebar.js';
import { ADMIN_NAV, ADMIN_MOBILE_NAV } from '/assets/js/config/admin-nav.js';

export { ADMIN_NAV, ADMIN_MOBILE_NAV } from '/assets/js/config/admin-nav.js';

export const GUEST_NAV = [
  { id: 'dashboard', label: 'Home', icon: 'home', href: '/guest/dashboard.html' },
  { id: 'reservations', label: 'Reservation History', icon: 'event_available', href: '/guest/reservations.html' },
  { id: 'billing', label: 'Billing', icon: 'receipt_long', href: '/guest/billing.html' },
  { id: 'facilities', label: 'Browse', icon: 'explore', href: '/guest/facilities.html' },
  { id: 'settings', label: 'Account', icon: 'person', href: '/guest/settings.html' },
];

/** Mobile bottom nav order — Browse centered for thumb reach */
export const GUEST_MOBILE_NAV = [
  { id: 'dashboard', label: 'Home', icon: 'home', href: '/guest/dashboard.html' },
  { id: 'facilities', label: 'Browse', icon: 'explore', href: '/guest/facilities.html' },
  { id: 'reservations', label: 'History', icon: 'event_available', href: '/guest/reservations.html' },
  { id: 'billing', label: 'Billing', icon: 'receipt_long', href: '/guest/billing.html' },
  { id: 'settings', label: 'Account', icon: 'person', href: '/guest/settings.html' },
];

const SIDEBAR_COLLAPSED_KEY = 'admin-sidebar-collapsed';
const TEMPLATE_CACHE_KEY = 'aptspace.admin.templates.v22';
const COMPONENT_FETCH_MS = 10000;
const BOOT_LOADER_ID = 'apt-boot-loader';
const SHELL_BOOT_TIMEOUT_MS = 8000;

function isShellReady() {
  return document.body?.classList.contains('admin-shell')
    || document.body?.classList.contains('guest-shell');
}

function ensureBootLoader() {
  if (typeof document === 'undefined' || isShellReady() || document.getElementById(BOOT_LOADER_ID)) return;

  const mount = () => {
    if (!document.body || isShellReady() || document.getElementById(BOOT_LOADER_ID)) return;
    const loader = document.createElement('div');
    loader.id = BOOT_LOADER_ID;
    loader.className = 'apt-boot-loader';
    loader.setAttribute('role', 'status');
    loader.setAttribute('aria-live', 'polite');
    loader.setAttribute('aria-label', 'Loading APTS');
    loader.innerHTML = `
      <div class="apt-boot-loader__inner">
        <div class="apt-boot-loader__spinner" aria-hidden="true"></div>
        <p class="apt-boot-loader__text">
          Loading APTS
          <span class="apt-boot-loader__dots" aria-hidden="true">
            <span>.</span><span>.</span><span>.</span>
          </span>
        </p>
      </div>`;
    document.body.appendChild(loader);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
}

function removeBootLoader() {
  document.getElementById(BOOT_LOADER_ID)?.remove();
}

function ensureMinimalShellVisible(isGuest = false) {
  if (isShellReady()) return;
  document.body.classList.add(isGuest ? 'guest-shell' : 'admin-shell');
  const page = document.getElementById('page-content');
  if (page) page.style.visibility = 'visible';
}

function scheduleShellBootFallback() {
  const arm = () => {
    window.setTimeout(() => {
      if (!isShellReady()) {
        const path = window.location.pathname;
        if (path.includes('/guest/')) {
          document.body.classList.add('guest-shell');
        } else {
          document.body.classList.add('admin-shell');
        }
        ensureMinimalShellVisible(path.includes('/guest/'));
        document.documentElement.classList.remove('admin-chrome-boot');
        removeBootLoader();
        console.warn('[ui] Shell bootstrap timed out — forced page visibility');
      }
    }, SHELL_BOOT_TIMEOUT_MS);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arm, { once: true });
  } else {
    arm();
  }
}

export async function loadComponent(url) {
  const res = await Promise.race([
    fetch(url),
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(`Timed out loading ${url}`)), COMPONENT_FETCH_MS);
    }),
  ]);
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  return res.text();
}

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
  if (cached?.sidebar && cached?.guestAccessModals && cached?.teamAccessModals && cached?.manageVenues) return cached;

  if (!templatesPromise) {
    templatesPromise = Promise.all([
      loadComponent('/components/sidebar.html'),
      loadComponent('/components/header.html'),
      loadComponent('/components/drawer.html'),
      loadComponent('/components/modal.html'),
      loadComponent('/components/manage-requests-modal.html'),
      loadComponent('/components/manage-reservations-modal.html'),
      loadComponent('/components/manage-facilities-modal.html'),
      loadComponent('/components/manage-venues-modal.html'),
      loadComponent('/components/reservation-wizard-modal.html'),
      loadComponent('/components/group-wizard-modal.html'),
      loadComponent('/components/venue-booking-wizard-modal.html'),
      loadComponent('/components/manage-venue-bookings-modal.html'),
      loadComponent('/components/notifications.html'),
      loadComponent('/components/guest-access-modals.html'),
      loadComponent('/components/team-access-modals.html'),
    ]).then(([sidebar, header, drawer, modal, manageRequests, manageReservations, manageFacilities, manageVenues, reservationWizard, groupWizard, venueWizard, manageVenueBookings, notifications, guestAccessModals, teamAccessModals]) => {
      const bundle = {
        sidebar,
        header,
        drawer,
        modal,
        manageRequests,
        manageReservations,
        manageFacilities,
        manageVenues,
        reservationWizard,
        groupWizard,
        venueWizard,
        manageVenueBookings,
        notifications,
        guestAccessModals,
        teamAccessModals,
      };
      writeTemplateCache(bundle);
      return bundle;
    }).catch((err) => {
      templatesPromise = null;
      throw err;
    });
  }

  return templatesPromise;
}

/** @type {Promise<Record<string, string>> | null} */
let guestTemplatesPromise = null;

async function loadGuestTemplates() {
  if (!guestTemplatesPromise) {
    guestTemplatesPromise = Promise.all([
      loadComponent('/components/guest-nav.html'),
      loadComponent('/components/notifications.html'),
      loadComponent('/components/modal.html'),
      loadComponent('/components/guest-footer.html'),
    ]).then(([guestNav, notifications, modal, guestFooter]) => ({
      guestNav,
      notifications,
      modal,
      guestFooter,
    }));
  }
  return guestTemplatesPromise;
}

let confirmModalEventsBound = false;

function bindConfirmModalEvents() {
  if (confirmModalEventsBound) return;
  confirmModalEventsBound = true;
  document.getElementById('modal-close')?.addEventListener('click', closeModal);
  document.getElementById('modal-overlay')?.addEventListener('click', closeModal);
  document.getElementById('app-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'app-modal') closeModal();
  });
}

/** Guest pages omit admin shell markup — mount shared confirm dialog on demand. */
export async function ensureConfirmModalMounted() {
  if (!document.getElementById('app-modal')) {
    const html = (await loadGuestTemplates()).modal || await loadComponent('/components/modal.html');
    document.body.insertAdjacentHTML('beforeend', html);
  }
  bindConfirmModalEvents();
}

function ensureGuestWizardStyles() {
  if (document.getElementById('guest-wizard-styles')) return;
  const link = document.createElement('link');
  link.id = 'guest-wizard-styles';
  link.rel = 'stylesheet';
  link.href = '/assets/css/features/guest-reservation-wizard.css';
  document.head.appendChild(link);
}

if (typeof window !== 'undefined') {
  ensureBootLoader();
  const path = window.location.pathname;
  if (path.includes('/admin/') || path.includes('/guest/')) {
    scheduleShellBootFallback();
  }
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
    .replace(/\{\{USER_NAME\}\}/g, userName)
    .replace(/\{\{USER_ROLE\}\}/g, userRole)
    .replace(/\{\{USER_INITIAL\}\}/g, userInitial);

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
    ${templates.manageVenues || ''}
    ${templates.reservationWizard || ''}
    ${templates.groupWizard || ''}
    ${templates.venueWizard || ''}
    ${templates.manageVenueBookings || ''}
    ${templates.notifications || ''}
    ${templates.guestAccessModals || ''}
    ${templates.teamAccessModals || ''}
  `;
}

function adminBottomNavLinkClass(isActive) {
  const base = 'portal-bottom-nav-link admin-bottom-nav-link flex flex-col items-center justify-center gap-0.5 flex-1 min-h-0 px-0.5 py-1.5 font-semibold no-underline transition-colors min-w-0';
  return isActive
    ? `${base} is-active text-primary`
    : `${base} text-on-surface-variant`;
}

function guestBottomNavLinkClass(isActive) {
  const base = 'portal-bottom-nav-link guest-bottom-nav-link flex flex-col items-center justify-center gap-0.5 flex-1 min-h-0 px-0.5 py-1.5 font-semibold no-underline transition-colors min-w-0';
  return isActive
    ? `${base} is-active text-primary`
    : `${base} text-on-surface-variant`;
}

const ADMIN_MOBILE_LABELS = {
  dashboard: 'Home',
  calendar: 'Calendar',
  reservations: 'Manage',
  facilities: 'Facilities',
  residents: 'Guests',
  payments: 'Billing',
  settings: 'Settings',
};

function renderAdminBottomNav(items, active) {
  return `
    <nav class="portal-bottom-nav admin-bottom-nav lg:hidden" aria-label="Mobile navigation">
      ${items.map((item) => `
        <a class="${adminBottomNavLinkClass(active === item.id)}" href="${item.href}" aria-current="${active === item.id ? 'page' : 'false'}" aria-label="${ADMIN_NAV.find((n) => n.id === item.id)?.label || item.label}">
          <span class="material-symbols-outlined leading-none" aria-hidden="true">${item.icon}</span>
          <span class="admin-bottom-nav-label">${ADMIN_MOBILE_LABELS[item.id] || item.label}</span>
        </a>
      `).join('')}
    </nav>`;
}
function renderGuestBottomNav(items, active) {
  return `
    <nav class="portal-bottom-nav guest-bottom-nav lg:hidden" aria-label="Mobile navigation">
      ${items.map((item) => `
        <a class="${guestBottomNavLinkClass(active === item.id)}" href="${item.href}" aria-current="${active === item.id ? 'page' : 'false'}" aria-label="${item.label}">
          <span class="material-symbols-outlined leading-none" aria-hidden="true">${item.icon}</span>
          <span class="guest-bottom-nav-label">${item.label}</span>
        </a>
      `).join('')}
    </nav>`;
}

function guestTopNavLinkClass(isActive) {
  const base = 'lp-nav-link';
  return isActive ? `${base} is-active` : base;
}

function guestMobileNavLinkClass(isActive) {
  const base = 'lp-mobile-link';
  return isActive ? `${base} text-primary font-semibold` : base;
}

function guestPortalNavLinkClass(active) {
  const base = 'lp-nav-link';
  return active ? `${base} is-active` : base;
}

function renderGuestPortalNavLinks(activePage) {
  const items = [
    { id: 'dashboard', label: 'Home', href: '/guest/dashboard.html' },
    { id: 'facilities', label: 'Browse', href: '/guest/facilities.html' },
    { id: 'reservations', label: 'Reservation History', href: '/guest/reservations.html' },
    { id: 'billing', label: 'Billing', href: '/guest/billing.html' },
  ];
  return items.map((item) => `
    <a class="${guestPortalNavLinkClass(activePage === item.id)}" href="${item.href}" aria-current="${activePage === item.id ? 'page' : 'false'}">${item.label}</a>
  `).join('');
}

function renderGuestMobileNavLinks(activePage) {
  const items = [
    { id: 'dashboard', label: 'Home', href: '/guest/dashboard.html', icon: 'home' },
    { id: 'facilities', label: 'Browse', href: '/guest/facilities.html', icon: 'explore' },
    { id: 'reservations', label: 'History', href: '/guest/reservations.html', icon: 'event_available' },
    { id: 'billing', label: 'Billing', href: '/guest/billing.html', icon: 'receipt_long' },
    { id: 'settings', label: 'Account', href: '/guest/settings.html', icon: 'person' },
  ];
  return items.map((item) => {
    const base = 'lp-mobile-link flex items-center gap-2';
    const cls = activePage === item.id ? `${base} text-primary font-semibold` : base;
    return `<a class="${cls}" href="${item.href}" aria-current="${activePage === item.id ? 'page' : 'false'}"><span class="material-symbols-outlined text-[20px] text-primary/80">${item.icon}</span>${item.label}</a>`;
  }).join('');
}

const GUEST_SECTION_SCROLLER = `
<nav class="lp-section-scroller hidden 2xl:block" aria-label="Page sections">
  <div class="lp-section-scroller-rail">
    <ol class="lp-section-scroller-list">
      <li>
        <a href="#hero" class="lp-section-scroller-item" data-nav-section="hero">
          <span class="lp-section-scroller-label">Home</span>
          <span class="lp-section-scroller-dot" aria-hidden="true"></span>
        </a>
      </li>
      <li>
        <a href="#explore" class="lp-section-scroller-item" data-nav-section="explore">
          <span class="lp-section-scroller-label">Explore</span>
          <span class="lp-section-scroller-dot" aria-hidden="true"></span>
        </a>
      </li>
      <li>
        <a href="#facilities" class="lp-section-scroller-item" data-nav-section="facilities">
          <span class="lp-section-scroller-label">Facilities</span>
          <span class="lp-section-scroller-dot" aria-hidden="true"></span>
        </a>
      </li>
      <li>
        <a href="#contact" class="lp-section-scroller-item" data-nav-section="contact">
          <span class="lp-section-scroller-label">Contact</span>
          <span class="lp-section-scroller-dot" aria-hidden="true"></span>
        </a>
      </li>
    </ol>
  </div>
</nav>`;

function buildGuestShell({
  templates,
  pageContent,
  activePage,
  userName,
  userRole,
  userInitial,
  landingHome = false,
}) {
  const homeHref = '/guest/dashboard.html';
  let content = pageContent;
  const pageClass = landingHome ? 'guest-landing' : 'guest-app-page';

  const nav = templates.guestNav
    .replace(/\{\{BRAND_HREF\}\}/g, homeHref)
    .replace(/\{\{HOME_HREF\}\}/g, homeHref)
    .replace(/\{\{NAV_MODIFIER_CLASSES\}\}/g, 'lp-nav-is-visible')
    .replace(/\{\{PORTAL_NAV_LINKS\}\}/g, renderGuestPortalNavLinks(activePage))
    .replace(/\{\{MOBILE_NAV_LINKS\}\}/g, renderGuestMobileNavLinks(activePage))
    .replace(/\{\{USER_NAME\}\}/g, userName)
    .replace(/\{\{USER_ROLE\}\}/g, userRole)
    .replace(/\{\{USER_INITIAL\}\}/g, userInitial);

  return `
    ${nav}
    ${landingHome ? GUEST_SECTION_SCROLLER : ''}
    <main class="guest-main lp-main">
      <div id="page-content" class="${pageClass}">${content}</div>
    </main>
    ${templates.guestFooter || ''}
    ${landingHome ? '' : renderGuestBottomNav(GUEST_MOBILE_NAV, activePage)}
    ${templates.notifications || ''}
    ${templates.modal || ''}
  `;
}

function updateGuestChrome({ userName, userRole, userInitial }) {
  document.querySelectorAll('.guest-user-name').forEach((el) => { el.textContent = userName; });
  document.querySelectorAll('.guest-user-role').forEach((el) => { el.textContent = userRole; });
  document.querySelectorAll('.guest-user-initial').forEach((el) => { el.textContent = userInitial; });
}

export function updateActiveNav(activePage, navItems = getAdminNavItems()) {
  const mobileNavItems = navItems.length === ADMIN_NAV.length
    ? getAdminMobileNavItems()
    : ADMIN_MOBILE_NAV.filter((item) => navItems.some((nav) => nav.id === item.id));
  document.querySelectorAll('#app-sidebar nav a, .guest-bottom-nav a, .admin-bottom-nav a, .guest-top-nav-links a, #lp-mobile-menu nav a[href]').forEach((link) => {
    const href = link.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.startsWith('mailto:')) return;
    const page = href.split('/').pop()?.split('#')[0] || '';
    const pool = link.closest('.admin-bottom-nav') ? mobileNavItems : navItems;
    const id = pool.find((item) => item.href.endsWith(page))?.id
      ?? navItems.find((item) => item.href.endsWith(page))?.id;
    const active = id === activePage;
    if (link.closest('.guest-bottom-nav')) {
      link.className = guestBottomNavLinkClass(active);
    } else if (link.closest('.admin-bottom-nav')) {
      link.className = adminBottomNavLinkClass(active);
    } else if (link.closest('.guest-top-nav-links')) {
      link.className = guestTopNavLinkClass(active);
    } else if (link.closest('#lp-mobile-menu')) {
      link.className = guestMobileNavLinkClass(active);
    } else {
      link.className = navLinkClass(active);
    }
    link.setAttribute('aria-current', active ? 'page' : 'false');
  });
}

export function updateAdminHeader({ title, subtitle, userName, userRole, userInitial }) {
  const titleEl = document.querySelector('.admin-page-title');
  const subtitleEl = document.querySelector('.admin-page-subtitle');
  const nameEls = document.querySelectorAll('.admin-user-chip__name');
  const roleEls = document.querySelectorAll('.admin-user-chip__role');
  const initialEl = document.querySelector('.admin-user-chip__avatar');

  if (titleEl) titleEl.textContent = title;
  if (subtitleEl) subtitleEl.textContent = subtitle;
  nameEls.forEach((el) => { el.textContent = userName; });
  roleEls.forEach((el) => { el.textContent = userRole; });
  if (initialEl) initialEl.textContent = userInitial;
}

function initAdminUserMenu() {
  const btn = document.getElementById('admin-user-menu-btn');
  const menu = document.getElementById('admin-user-dropdown');
  if (!btn || !menu) return;

  const setOpen = (open) => {
    menu.classList.toggle('hidden', !open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(menu.classList.contains('hidden'));
  });

  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target) && !btn.contains(e.target)) {
      setOpen(false);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(false);
  });

  menu.querySelectorAll('a, button').forEach((item) => {
    item.addEventListener('click', () => setOpen(false));
  });
}

function navLinkClass(isActive) {
  const base = 'flex items-center gap-md px-md py-md rounded-lg text-body-md';
  return isActive
    ? `${base} admin-nav-active text-primary font-bold`
    : `${base} hover:bg-surface-variant/50 text-on-surface-variant`;
}

function renderSidebarNav(items, active) {
  return items.map((item) => `
    <a class="${navLinkClass(active === item.id)}" href="${item.href}" title="${item.label}">
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
    title = 'Dashboard',
    subtitle = '',
    portalLabel = '',
    deferEnhancements = false,
    landingHome = false,
  } = config;

  const isGuest = portal === 'guest';
  const navItems = isGuest ? GUEST_NAV : getAdminNavItems();

  let splashRef = null;
  try {
    ({ splash: splashRef } = await initSplashIdle({
      portal: isGuest ? 'guest' : 'admin',
      autoDismiss: false,
    }));

    const user = getCurrentUser() || {};
    const userName = user.full_name || user.name || (isGuest ? 'Guest User' : 'Admin User');
    const userRole = formatRoleLabel(user.role) || (isGuest ? 'Guest' : 'Housing Admin');
    const userInitial = userName.charAt(0).toUpperCase();
    const collapsed = isSidebarCollapsedPreferred();

    document.documentElement.classList.add('admin-chrome-boot');

    const savedContent = document.getElementById('page-content')?.innerHTML || '';
    let pageContent = savedContent;
    if (isGuest && landingHome) {
      const { buildLandingContent } = await import('/assets/js/layout/landing-content.js');
      const firstName = userName.split(' ')[0] || 'Guest';
      pageContent = await buildLandingContent({ variant: 'guest', firstName });
    }
    const preservedNodes = extractPreservedLayoutNodes();
    const existingSidebar = document.getElementById('app-sidebar');
    const existingGuestNav = document.querySelector('.guest-top-nav');

    if (existingGuestNav && isGuest) {
      document.body.className = 'guest-shell lp-shell guest-portal bg-background text-on-surface font-body-md overflow-x-hidden min-h-screen';
      updateActiveNav(activePage, navItems);
      updateGuestChrome({ userName, userRole, userInitial });
      /* Soft re-entry: ensure bottom nav exists on app pages (was never injected before) */
      if (!landingHome && !document.querySelector('.guest-bottom-nav')) {
        document.body.insertAdjacentHTML('beforeend', renderGuestBottomNav(GUEST_MOBILE_NAV, activePage));
        updateActiveNav(activePage, navItems);
      }
      if (!landingHome && !document.querySelector('footer.bg-white.border-t')) {
        loadComponent('/components/guest-footer.html').then((footerHtml) => {
          const main = document.querySelector('.guest-main');
          if (main && footerHtml) main.insertAdjacentHTML('afterend', footerHtml);
        }).catch(() => {});
      }
      await ensureConfirmModalMounted();
      if (activePage === 'reservations') {
        ensureGuestWizardStyles();
        if (!document.getElementById('reservation-wizard-modal')) {
          const [reservationWizard, groupWizard] = await Promise.all([
            loadComponent('/components/reservation-wizard-modal.html'),
            loadComponent('/components/group-wizard-modal.html'),
          ]);
          document.body.insertAdjacentHTML('beforeend', reservationWizard + groupWizard);
        }
        initReservationWizard();
        initGroupWizard();
      }
      bindLayoutEvents({ isGuest: true });
      releaseChromeBoot();
      return;
    }

    if (existingSidebar) {
      document.body.className = `admin-shell bg-background text-on-surface font-body-md h-screen overflow-hidden flex relative${isGuest ? ' guest-portal' : ''}${collapsed ? ' sidebar-collapsed' : ''}`;
      updateActiveNav(activePage, navItems);
      updateAdminHeader({ title, subtitle, userName, userRole, userInitial });
      ensureSidebarUi();
      if (!isGuest) applyRoleUI();
      lockStaticChrome();
      if (!deferEnhancements && !isGuest) initAdminEnhancements().catch(() => releaseChromeBoot());
      else releaseChromeBoot();
      return;
    }

    const templates = isGuest ? await loadGuestTemplates() : await loadAdminTemplates();
    let extraGuestModals = '';
    if (isGuest && activePage === 'reservations') {
      ensureGuestWizardStyles();
      const [reservationWizard, groupWizard] = await Promise.all([
        loadComponent('/components/reservation-wizard-modal.html'),
        loadComponent('/components/group-wizard-modal.html'),
      ]);
      extraGuestModals = reservationWizard + groupWizard;
    }
    const shellHtml = isGuest
      ? buildGuestShell({
          templates,
          pageContent,
          activePage,
          userName,
          userRole,
          userInitial,
          landingHome,
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
          navItems: getAdminNavItems(),
          brandHref: '/admin/dashboard.html',
        }) + renderAdminBottomNav(getAdminMobileNavItems(), activePage);

    document.body.innerHTML = shellHtml + extraGuestModals;
    if (preservedNodes.childNodes.length) {
      document.body.appendChild(preservedNodes);
    }
    document.body.className = isGuest
      ? `guest-shell lp-shell guest-portal bg-background text-on-surface font-body-md overflow-x-hidden min-h-screen${landingHome ? ' lp-ready' : ''}`
      : `admin-shell bg-background text-on-surface font-body-md h-screen overflow-hidden flex relative${collapsed ? ' sidebar-collapsed' : ''}`;

    if (isGuest && landingHome) {
      const { loadSupportContact } = await import('/assets/js/features/support-contact.js');
      loadSupportContact(document).catch(() => {});
    }

    bindLayoutEvents({ isGuest });
    if (isGuest) {
      await ensureConfirmModalMounted();
      ensureGuestWizardStyles();
      initGuestPortalChrome().catch(() => {});
      initGuestPageNavTransitions();
      if (activePage === 'reservations') {
        ensureGuestWizardStyles();
        initReservationWizard();
        initGroupWizard();
      }
      releaseChromeBoot();
    } else {
      ensureSidebarUi();
      applyRoleUI();
      initManageRequestsModal();
      initManageReservationsModal();
      initManageVenueBookingsModal();
      initManageFacilitiesModal();
      initManageVenuesModal();
      initReservationWizard();
      initGroupWizard();
      initVenueBookingWizard();
      initDrawerTabs();
      initAdminPageNavTransitions();
      lockStaticChrome();
      if (!deferEnhancements) initAdminEnhancements().catch(() => releaseChromeBoot());
    }
  } catch (err) {
    console.error('[ui] initAppLayout failed:', err);
    ensureMinimalShellVisible(isGuest);
    throw err;
  } finally {
    removeBootLoader();
    dismissAptSplash();
    document.body.classList.remove('is-splash-active');
    document.querySelector('.admin-shell')?.classList.remove('is-splash-active');
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

let sidebarUiInitialized = false;

function ensureSidebarUi() {
  if (sidebarUiInitialized) return;
  sidebarUiInitialized = true;
  initSidebarCollapse();
}

function initSidebarCollapse() {
  const collapseBtn = document.getElementById('sidebar-collapse-btn');

  syncSidebarToggleUi();

  collapseBtn?.addEventListener('click', () => {
    if (!isDesktopSidebar()) return;
    const collapsed = document.body.classList.contains('sidebar-collapsed');
    setSidebarCollapsed(!collapsed);
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

function syncSidebarCollapseUi() {
  const collapseBtn = document.getElementById('sidebar-collapse-btn');
  const collapsed = document.body.classList.contains('sidebar-collapsed');
  const icon = collapseBtn?.querySelector('.material-symbols-outlined');
  if (icon) icon.textContent = collapsed ? 'dock_to_left' : 'dock_to_right';
  if (collapseBtn) {
    const label = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
    collapseBtn.setAttribute('aria-label', label);
    collapseBtn.title = label;
    collapseBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  }
}

function setSidebarCollapsed(collapsed) {
  const shell = document.body;
  const sidebar = document.getElementById('app-sidebar');
  document.documentElement.classList.add('sidebar-user-toggle');

  if (sidebar) sidebar.classList.add('sidebar-labels-hidden');

  shell.classList.toggle('sidebar-collapsed', collapsed);
  if (isDesktopSidebar()) {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
  }
  if (collapsed) closeMobileSidebar();
  syncSidebarToggleUi();

  if (!sidebar || !isDesktopSidebar()) {
    sidebar?.classList.remove('sidebar-labels-hidden');
    document.documentElement.classList.remove('sidebar-user-toggle');
    return;
  }

  let finished = false;
  const finishTransition = () => {
    if (finished) return;
    finished = true;
    sidebar.classList.remove('sidebar-labels-hidden');
    document.documentElement.classList.remove('sidebar-user-toggle');
    sidebar.removeEventListener('transitionend', onWidthTransitionEnd);
    clearTimeout(fallbackTimer);
  };

  const onWidthTransitionEnd = (event) => {
    if (event.target === sidebar && event.propertyName === 'width') {
      finishTransition();
    }
  };

  sidebar.addEventListener('transitionend', onWidthTransitionEnd);
  const fallbackTimer = setTimeout(finishTransition, 240);
}

function syncSidebarToggleUi() {
  syncSidebarCollapseUi();
  syncMobileSidebarToggleUi();
}

function bindLayoutEvents({ isGuest = false } = {}) {
  if (!isGuest) initAdminUserMenu();

  document.querySelectorAll('[data-action="logout"]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const { doLogout } = await import('/assets/js/services/auth.js');
      await doLogout();
    });
  });

  bindNotificationBell({ isGuest });

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
      if (!isGuest && isManageVenueBookingsModalOpen()) {
        closeManageVenueBookingsModal();
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
      if (!isGuest && isVenueBookingWizardOpen()) {
        closeVenueBookingWizard();
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
    || isManageVenueBookingsModalOpen()
    || isManageFacilitiesModalOpen()
    || isReservationWizardOpen()
    || isGroupWizardOpen()
    || isVenueBookingWizardOpen();
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
  const { subtitle = '', size = 'md', hideHeader = false } = options;
  const subtitleEl = document.getElementById('modalSubtitle');
  const titleEl = document.getElementById('modalTitle');
  const bodyEl = document.getElementById('modalBody');
  const headerEl = document.getElementById('modal-header')
    || document.querySelector('#app-modal > div > .border-b')
    || document.querySelector('#app-modal > div > div:first-child');
  if (!titleEl || !bodyEl) return;
  titleEl.textContent = title;
  bodyEl.innerHTML = bodyHtml;
  if (subtitleEl) {
    if (subtitle) {
      subtitleEl.textContent = subtitle;
      subtitleEl.classList.remove('hidden');
    } else {
      subtitleEl.textContent = '';
      subtitleEl.classList.add('hidden');
    }
  }
  headerEl?.classList.toggle('hidden', Boolean(hideHeader));
  bodyEl.classList.toggle('modal-body--flush', Boolean(hideHeader));
  const shell = document.querySelector('#app-modal > div');
  if (shell) {
    shell.classList.remove('max-w-sm', 'max-w-md', 'max-w-lg', 'max-w-xl', 'max-w-2xl', 'max-w-3xl', 'max-w-4xl');
    const widthClass = size === 'sm'
      ? 'max-w-md'
      : size === 'lg' || size === 'tablet'
        ? 'max-w-3xl'
        : 'max-w-2xl';
    shell.classList.add(widthClass);
  }
  document.getElementById('app-modal')?.classList.remove('hidden');
  document.getElementById('modal-overlay')?.classList.remove('hidden');
  updateBodyScrollLock();
  refreshAdminReadOnlyUI();
  if (!hideHeader) document.getElementById('modal-close')?.focus();
  else bodyEl.querySelector('[data-detail-close]')?.focus();
  animateModalOpen(shell).catch(() => {});
}

export function closeModal() {
  document.getElementById('app-modal')?.classList.add('hidden');
  document.getElementById('modal-overlay')?.classList.add('hidden');
  document.getElementById('modal-header')?.classList.remove('hidden');
  document.querySelector('#app-modal > div > .border-b')?.classList.remove('hidden');
  document.getElementById('modalBody')?.classList.remove('modal-body--flush');
  const shell = document.querySelector('#app-modal > div');
  if (shell) {
    shell.classList.remove('max-w-sm', 'max-w-md', 'max-w-lg', 'max-w-xl', 'max-w-3xl', 'max-w-4xl');
    if (!shell.classList.contains('max-w-2xl')) shell.classList.add('max-w-2xl');
  }
  updateBodyScrollLock();
}

/**
 * Shared "Are you sure?" dialog (matches the Settings / Guest access style).
 * Returns a Promise<boolean>. `message` is treated as HTML — escape any dynamic text.
 * Set `elevate` when opening on top of another modal (e.g. Manage rooms).
 */
export function confirmModal({
  title = 'Confirm',
  message = 'Are you sure?',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  elevate = false,
} = {}) {
  return ensureConfirmModalMounted().then(() => new Promise((resolve) => {
    const overlay = document.getElementById('modal-overlay');
    const modal = document.getElementById('app-modal');
    const lifecycle = new AbortController();
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      lifecycle.abort();
      if (elevate) {
        overlay?.style.removeProperty('z-index');
        modal?.style.removeProperty('z-index');
      }
      closeModal();
      resolve(value);
    };

    const confirmBtn = danger
      ? `<button type="button" class="px-5 py-2.5 min-h-[2.75rem] rounded-lg font-semibold text-sm text-white" style="background:#dc2626" data-action="confirm">${confirmLabel}</button>`
      : `<button type="button" class="btn-primary px-5 py-2.5 min-h-[2.75rem]" data-action="confirm">${confirmLabel}</button>`;

    const body = `
      <p class="text-[0.9375rem] text-on-surface-variant leading-relaxed m-0">${message}</p>
      <div class="flex justify-end gap-3 mt-6 pt-5 border-t border-outline-variant">
        <button type="button" class="px-4 py-2.5 rounded-lg border border-outline-variant text-on-surface-variant font-semibold text-sm hover:bg-surface-variant/30 transition-colors min-h-[2.75rem]" data-action="cancel">${cancelLabel}</button>
        ${confirmBtn}
      </div>`;

    // Defer one frame so the click that opened this dialog can't hit the overlay.
    requestAnimationFrame(() => {
      if (elevate) {
        // Billing details use z-index 200; elevated confirmations must always
        // render above the active record modal and its backdrop.
        if (overlay) overlay.style.zIndex = '300';
        if (modal) modal.style.zIndex = '310';
      }
      openModal(title, body);
      const bodyEl = document.getElementById('modalBody');
      bodyEl?.querySelector('[data-action="cancel"]')?.addEventListener('click', () => finish(false), { once: true });
      bodyEl?.querySelector('[data-action="confirm"]')?.addEventListener('click', () => finish(true), { once: true });
      document.getElementById('modal-close')?.addEventListener('click', () => finish(false), { once: true });
      document.getElementById('modal-overlay')?.addEventListener('click', () => finish(false), { once: true });
      window.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopImmediatePropagation();
        finish(false);
      }, { capture: true, signal: lifecycle.signal });
    });
  })).catch(() => false);
}

/** Single-action alert dialog. `message` is escaped unless `escape: false`. */
export function showAlertModal(title, message, { confirmLabel = 'OK', escape = true } = {}) {
  const body = escape && typeof message === 'string' ? escapeHtml(message) : message;
  return confirmModal({
    title,
    message: body,
    confirmLabel,
    cancelLabel: 'Dismiss',
  });
}

/**
 * Modal with optional text input. Returns trimmed string on confirm, null on cancel.
 */
export function promptModal({
  title = 'Add a note',
  message = '',
  placeholder = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  optional = true,
} = {}) {
  return ensureConfirmModalMounted().then(() => new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      closeModal();
      resolve(value);
    };

    const confirmBtn = danger
      ? `<button type="button" class="px-5 py-2.5 min-h-[2.75rem] rounded-lg font-semibold text-sm text-white" style="background:#dc2626" data-action="confirm">${confirmLabel}</button>`
      : `<button type="button" class="btn-primary px-5 py-2.5 min-h-[2.75rem]" data-action="confirm">${confirmLabel}</button>`;

    const body = `
      <p class="text-[0.9375rem] text-on-surface-variant leading-relaxed m-0">${message}</p>
      <label class="block mt-4 text-label-sm font-medium text-on-surface" for="prompt-modal-input">Note${optional ? ' (optional)' : ''}</label>
      <textarea id="prompt-modal-input" class="res-input w-full mt-1.5" rows="3" placeholder="${escapeHtml(placeholder)}"></textarea>
      <div class="flex justify-end gap-3 mt-6 pt-5 border-t border-outline-variant">
        <button type="button" class="px-4 py-2.5 rounded-lg border border-outline-variant text-on-surface-variant font-semibold text-sm hover:bg-surface-variant/30 transition-colors min-h-[2.75rem]" data-action="cancel">${cancelLabel}</button>
        ${confirmBtn}
      </div>`;

    requestAnimationFrame(() => {
      openModal(title, body);
      const input = document.getElementById('prompt-modal-input');
      input?.focus();
      const bodyEl = document.getElementById('modalBody');
      bodyEl?.querySelector('[data-action="cancel"]')?.addEventListener('click', () => finish(null), { once: true });
      bodyEl?.querySelector('[data-action="confirm"]')?.addEventListener('click', () => {
        const value = input?.value?.trim() || '';
        if (!optional && !value) {
          input?.focus();
          return;
        }
        finish(value);
      }, { once: true });
      document.getElementById('modal-close')?.addEventListener('click', () => finish(null), { once: true });
      document.getElementById('modal-overlay')?.addEventListener('click', () => finish(null), { once: true });
    });
  })).catch(() => null);
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
