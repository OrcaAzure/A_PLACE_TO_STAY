import { getSession } from '/assets/js/services/api.js';
import {
  ADMIN_PORTAL_ROLES,
  doLogout,
  formatRoleLabel,
  setAuthSession,
} from '/assets/js/services/auth.js';
import { initGuestPortalChrome } from '/assets/js/layout/guest-portal.js';
import { bindNotificationBell } from '/assets/js/layout/notifications.js';

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}`);
  return response.text();
}

function applyUserTokens(template, user) {
  const name = user.full_name || user.name || 'Guest';
  return template
    .replaceAll('{{NAV_MODIFIER_CLASSES}}', 'lp-nav-is-visible')
    .replaceAll('{{BRAND_HREF}}', '/guest/dashboard.html')
    .replaceAll('{{USER_INITIAL}}', name.charAt(0).toUpperCase())
    .replaceAll('{{USER_NAME}}', name)
    .replaceAll('{{USER_ROLE}}', formatRoleLabel(user.role) || 'Guest');
}

async function mountGuestHeader(user) {
  const currentHeader = document.getElementById('public-page-header');
  if (!currentHeader) return;
  const [navTemplate, notifications] = await Promise.all([
    fetchText('/components/guest-nav.html'),
    fetchText('/components/notifications.html'),
  ]);
  currentHeader.outerHTML = applyUserTokens(navTemplate, user);
  if (!document.getElementById('notifications-panel')) {
    document.body.insertAdjacentHTML('beforeend', notifications);
  }
  document.body.classList.add('guest-public-nav', 'guest-portal', 'lp-shell');
  document.querySelectorAll('[data-action="logout"]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      await doLogout();
    });
  });
  bindNotificationBell({ isGuest: true });
  await initGuestPortalChrome();
}

async function initPublicInfoHeader() {
  try {
    const data = await getSession({ skipAuthRedirect: true });
    if (!data.authenticated || !data.user) return;
    const user = data.user;
    setAuthSession(user);
    if (user?.role === 'Guest') {
      await mountGuestHeader(user);
      return;
    }
    if (ADMIN_PORTAL_ROLES.includes(user?.role)) {
      const link = document.querySelector('#public-page-header [data-public-auth-link]');
      if (link) {
        link.href = '/admin/dashboard.html';
        link.textContent = 'Admin dashboard';
      }
    }
  } catch {
    // Anonymous visitors keep the simple public header.
  }
}

initPublicInfoHeader();
