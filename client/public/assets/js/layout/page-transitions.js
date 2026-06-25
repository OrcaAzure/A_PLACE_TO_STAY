/**
 * Portal page navigation — instant (no fade/slide) for stable admin & guest chrome.
 */

const GUEST_PAGES = new Set([
  'dashboard.html',
  'reservations.html',
  'facilities.html',
  'settings.html',
]);

const ADMIN_PAGES = new Set([
  'dashboard.html',
  'reservations.html',
  'facilities.html',
  'residents.html',
  'payments.html',
  'settings.html',
]);

function pageNameFromHref(href) {
  try {
    const url = new URL(href, window.location.href);
    return url.pathname.split('/').pop() || '';
  } catch {
    return '';
  }
}

function isSameDocument(href) {
  try {
    const target = new URL(href, window.location.href);
    return target.pathname === window.location.pathname;
  } catch {
    return false;
  }
}

function isInternalPortalLink(link, allowedPages) {
  if (link.target === '_blank') return false;
  const href = link.getAttribute('href');
  if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return false;
  if (href.startsWith('http') && !href.startsWith(window.location.origin)) return false;
  return allowedPages.has(pageNameFromHref(href));
}

/** No enter animation — content is visible immediately on load. */
function ensureVisible(contentEl, headerEl) {
  [contentEl, headerEl].forEach((el) => {
    if (!el) return;
    el.classList.remove('page-enter-start', 'page-enter-active', 'page-exit-active');
    el.style.opacity = '1';
    el.style.transform = 'none';
  });
}

function bindPortalNav({ navSelector, contentSelector, headerSelector, allowedPages }) {
  const contentEl = document.querySelector(contentSelector);
  if (!contentEl) return;

  const headerEl = headerSelector ? document.querySelector(headerSelector) : null;
  ensureVisible(contentEl, headerEl);

  document.querySelectorAll(navSelector).forEach((link) => {
    if (!isInternalPortalLink(link, allowedPages)) return;

    link.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      if (isSameDocument(link.href)) {
        e.preventDefault();
      }
      // Default browser navigation — no exit animation delay.
    });
  });
}

export function initGuestPageNavTransitions() {
  bindPortalNav({
    navSelector: '#app-sidebar nav a, .guest-bottom-nav a',
    contentSelector: '#page-content',
    headerSelector: 'main > header',
    allowedPages: GUEST_PAGES,
  });
}

export function initAdminPageNavTransitions() {
  bindPortalNav({
    navSelector: '#app-sidebar nav a',
    contentSelector: '#page-content',
    headerSelector: 'main > header',
    allowedPages: ADMIN_PAGES,
  });
}
