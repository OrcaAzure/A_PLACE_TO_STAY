/** Shared responsive sidebar — overlay/drawer on small screens, push layout on desktop. */

/** @type {(() => void) | null} */
let scrollLockCallback = null;

export function configureMobileSidebar({ onScrollLockChange } = {}) {
  scrollLockCallback = onScrollLockChange || null;
}

function notifyScrollLock() {
  scrollLockCallback?.();
}

export const SIDEBAR_DESKTOP_MQ = '(min-width: 1024px)';

export function isDesktopSidebar() {
  return window.matchMedia(SIDEBAR_DESKTOP_MQ).matches;
}

export function isMobileSidebarOpen() {
  return document.documentElement.classList.contains('sidebar-mobile-open');
}

function sidebarEl() {
  return document.getElementById('app-sidebar');
}

function overlayEl() {
  return document.getElementById('sidebar-overlay');
}

function openBtnEl() {
  return document.getElementById('sidebar-open-btn');
}

function pageContentEl() {
  return document.getElementById('page-content');
}

function mainEl() {
  return document.querySelector('.admin-shell > main');
}

export function syncMobileSidebarToggleUi() {
  const openBtn = openBtnEl();
  const mobile = !isDesktopSidebar();
  const open = isMobileSidebarOpen();

  if (openBtn) {
    openBtn.setAttribute('aria-expanded', mobile ? String(open) : String(!document.body.classList.contains('sidebar-collapsed')));
    openBtn.setAttribute('aria-label', mobile ? (open ? 'Close menu' : 'Open menu') : 'Show sidebar');
    openBtn.title = mobile ? (open ? 'Close menu' : 'Open menu') : 'Show sidebar';
    openBtn.hidden = mobile && open;
  }
}

export function openMobileSidebar() {
  if (isDesktopSidebar()) return;

  document.documentElement.classList.add('sidebar-user-toggle', 'sidebar-mobile-open');
  sidebarEl()?.classList.add('sidebar-open');
  overlayEl()?.classList.remove('hidden');
  overlayEl()?.classList.add('visible');
  overlayEl()?.setAttribute('aria-hidden', 'false');

  pageContentEl()?.setAttribute('aria-hidden', 'true');
  mainEl()?.setAttribute('inert', '');

  syncMobileSidebarToggleUi();
  notifyScrollLock();
}

export function closeMobileSidebar() {
  document.documentElement.classList.remove('sidebar-mobile-open');
  sidebarEl()?.classList.remove('sidebar-open');
  overlayEl()?.classList.add('hidden');
  overlayEl()?.classList.remove('visible');
  overlayEl()?.setAttribute('aria-hidden', 'true');

  pageContentEl()?.removeAttribute('aria-hidden');
  mainEl()?.removeAttribute('inert');

  syncMobileSidebarToggleUi();
  notifyScrollLock();

  requestAnimationFrame(() => {
    document.documentElement.classList.remove('sidebar-user-toggle');
  });
}

export function closeSidebarIfMobile() {
  if (!isDesktopSidebar() && isMobileSidebarOpen()) {
    closeMobileSidebar();
  }
}

export function bindMobileSidebarEvents({ onScrollLockChange } = {}) {
  configureMobileSidebar({ onScrollLockChange });

  overlayEl()?.addEventListener('click', closeMobileSidebar);

  sidebarEl()?.querySelector('nav')?.addEventListener('click', (e) => {
    if (isDesktopSidebar()) return;
    if (e.target.closest('a')) closeMobileSidebar();
  });

  window.addEventListener('resize', () => {
    if (isDesktopSidebar() && isMobileSidebarOpen()) {
      closeMobileSidebar();
    }
    syncMobileSidebarToggleUi();
    onScrollLockChange?.();
  });
}
