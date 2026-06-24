/** Guest portal — collapsible sidebar (desktop), same pattern as admin. */

const GUEST_SIDEBAR_KEY = 'guest-sidebar-collapsed';

function isDesktop() {
  return window.matchMedia('(min-width: 1024px)').matches;
}

function syncGuestSidebarUi() {
  const openBtn = document.getElementById('guest-sidebar-open-btn');
  const collapsed = document.body.classList.contains('sidebar-collapsed');
  if (openBtn) {
    openBtn.setAttribute('aria-expanded', String(!collapsed));
  }
}

export function setGuestSidebarCollapsed(collapsed) {
  document.body.classList.toggle('sidebar-collapsed', collapsed);
  if (isDesktop()) {
    localStorage.setItem(GUEST_SIDEBAR_KEY, collapsed ? '1' : '0');
  }
  syncGuestSidebarUi();
}

export function initGuestSidebar() {
  if (isDesktop() && localStorage.getItem(GUEST_SIDEBAR_KEY) === '1') {
    document.body.classList.add('sidebar-collapsed');
  }
  syncGuestSidebarUi();

  document.getElementById('guest-sidebar-collapse-btn')?.addEventListener('click', () => {
    setGuestSidebarCollapsed(true);
  });

  document.getElementById('guest-sidebar-open-btn')?.addEventListener('click', () => {
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
