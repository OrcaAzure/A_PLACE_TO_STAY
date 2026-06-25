/** Guest portal — delegates to shared mobile sidebar (same as admin). */

import {
  syncMobileSidebarToggleUi,
  bindMobileSidebarEvents,
  closeMobileSidebar,
  openMobileSidebar,
  isMobileSidebarOpen,
} from '/assets/js/layout/mobile-sidebar.js';

export {
  isDesktopSidebar,
  isMobileSidebarOpen,
  openMobileSidebar,
  closeMobileSidebar,
  closeSidebarIfMobile,
  syncMobileSidebarToggleUi,
  bindMobileSidebarEvents,
  configureMobileSidebar,
  SIDEBAR_DESKTOP_MQ,
} from '/assets/js/layout/mobile-sidebar.js';

const GUEST_SIDEBAR_KEY = 'guest-sidebar-collapsed';

function isDesktop() {
  return window.matchMedia('(min-width: 1024px)').matches;
}

function syncGuestSidebarUi() {
  syncMobileSidebarToggleUi();
}

export function setGuestSidebarCollapsed(collapsed) {
  document.body.classList.toggle('sidebar-collapsed', collapsed);
  if (isDesktop()) {
    localStorage.setItem(GUEST_SIDEBAR_KEY, collapsed ? '1' : '0');
  }
  if (collapsed) closeMobileSidebar();
  syncGuestSidebarUi();
}

/** @deprecated Guest pages use initAppLayout → initSidebarCollapse; kept for compatibility. */
export function initGuestSidebar() {
  if (isDesktop() && localStorage.getItem(GUEST_SIDEBAR_KEY) === '1') {
    document.body.classList.add('sidebar-collapsed');
  }
  syncGuestSidebarUi();
  bindMobileSidebarEvents();

  document.getElementById('sidebar-collapse-btn')?.addEventListener('click', () => {
    setGuestSidebarCollapsed(true);
  });

  document.getElementById('sidebar-open-btn')?.addEventListener('click', () => {
    if (!isDesktop()) {
      if (isMobileSidebarOpen()) closeMobileSidebar();
      else openMobileSidebar();
      return;
    }
    setGuestSidebarCollapsed(false);
  });

  window.addEventListener('resize', () => {
    if (!isDesktop()) {
      document.body.classList.remove('sidebar-collapsed');
    } else if (localStorage.getItem(GUEST_SIDEBAR_KEY) === '1') {
      document.body.classList.add('sidebar-collapsed');
    }
    syncGuestSidebarUi();
  });
}
