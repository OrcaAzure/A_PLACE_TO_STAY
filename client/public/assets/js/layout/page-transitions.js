/**
 * Portal page navigation — admin soft nav keeps sidebar/header static.
 */

import { formatRoleLabel, getCurrentUser, getAdminNavItems } from '/assets/js/services/auth.js';
import { lockStaticChrome } from '/assets/js/layout/animations.js';
import { bootAdminPage, cleanupAdminPage } from '/assets/js/layout/admin-page-loaders.js';

const GUEST_PAGES = new Set([
  'dashboard.html',
  'reservations.html',
  'facilities.html',
  'settings.html',
]);

const ADMIN_PAGES = new Set([
  'dashboard.html',
  'calendar.html',
  'reservations.html',
  'facilities.html',
  'residents.html',
  'payments.html',
  'settings.html',
]);

/** @type {Promise<void> | null} */
let adminNavPromise = null;

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

function parseAdminPageMeta(html, pageName) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const content = doc.getElementById('page-content');
  const script = doc.querySelector('script[type="module"]')?.textContent || '';
  const title = script.match(/title:\s*['"]([^'"]+)['"]/)?.[1]
    || doc.title.replace(/\s*\|\s*APTS.*$/i, '').trim();
  const subtitle = script.match(/subtitle:\s*['"]([^'"]*)['"]/)?.[1] ?? '';
  const activePage = script.match(/activePage:\s*['"]([^'"]+)['"]/)?.[1]
    || pageName.replace('.html', '');

  return {
    contentClass: content?.className || '',
    contentHtml: content?.innerHTML || '',
    title,
    subtitle,
    activePage,
    docTitle: doc.title,
    doc,
  };
}

function mergePageStyles(doc) {
  doc.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
    const href = link.getAttribute('href');
    if (!href || document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) return;
    document.head.appendChild(link.cloneNode(true));
  });
}

function ensureVisible(contentEl, headerEl) {
  [contentEl, headerEl].forEach((el) => {
    if (!el) return;
    el.classList.remove('page-enter-start', 'page-enter-active', 'page-exit-active', 'admin-content-loading');
    el.style.opacity = '1';
    el.style.transform = 'none';
  });
}

async function navigateAdminSoft(href) {
  if (!document.getElementById('app-sidebar')) {
    window.location.href = href;
    return;
  }

  const pageName = pageNameFromHref(href);
  if (!ADMIN_PAGES.has(pageName)) {
    window.location.href = href;
    return;
  }

  if (pageName === 'residents.html') {
    const { canAccessGuestAccess } = await import('/assets/js/services/auth.js');
    if (!canAccessGuestAccess()) {
      window.location.replace('/admin/dashboard.html');
      return;
    }
  }

  if (adminNavPromise) return adminNavPromise;

  const pageEl = document.getElementById('page-content');
  const headerEl = document.querySelector('main > header');
  if (!pageEl) {
    window.location.href = href;
    return;
  }

  document.documentElement.classList.add('admin-chrome-boot');
  lockStaticChrome();
  pageEl.classList.add('admin-content-loading');

  adminNavPromise = (async () => {
    try {
      const res = await fetch(href, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const meta = parseAdminPageMeta(html, pageName);
      if (!meta.contentHtml) throw new Error('Missing page content');

      mergePageStyles(meta.doc);
      cleanupAdminPage();
      pageEl.className = meta.contentClass;
      pageEl.innerHTML = meta.contentHtml;

      const { updateActiveNav, updateAdminHeader } = await import('/assets/js/layout/ui.js');
      const user = getCurrentUser() || {};
      const userName = user.full_name || user.name || 'Admin User';
      updateAdminHeader({
        title: meta.title,
        subtitle: meta.subtitle,
        userName,
        userRole: formatRoleLabel(user.role) || 'Housing Admin',
        userInitial: userName.charAt(0).toUpperCase(),
      });
      updateActiveNav(meta.activePage, getAdminNavItems());
      document.title = meta.docTitle;
      window.history.pushState({ adminPage: pageName }, '', href);

      ensureVisible(pageEl, headerEl);
      await bootAdminPage(pageName);
    } catch (err) {
      console.warn('[nav] Soft navigation failed, using full load:', err);
      window.location.href = href;
    } finally {
      pageEl.classList.remove('admin-content-loading');
      adminNavPromise = null;
    }
  })();

  return adminNavPromise;
}

function bindPortalNav({ navSelector, contentSelector, headerSelector, allowedPages, softNav = false }) {
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
        return;
      }
      if (softNav) {
        e.preventDefault();
        import('/assets/js/layout/ui.js').then(({ updateActiveNav }) => {
          const page = pageNameFromHref(link.href);
          const navItems = getAdminNavItems();
          const activePage = navItems.find((item) => item.href.endsWith(page))?.id
            || page.replace('.html', '');
          updateActiveNav(activePage, navItems);
        });
        navigateAdminSoft(link.href);
      }
    });
  });
}

export function initGuestPageNavTransitions() {
  bindPortalNav({
    navSelector: '.guest-top-nav-links a, #lp-mobile-menu nav a[href*="/guest/"]',
    contentSelector: '#page-content',
    headerSelector: null,
    allowedPages: GUEST_PAGES,
  });
}

export function initAdminPageNavTransitions() {
  bindPortalNav({
    navSelector: '#app-sidebar nav a, .admin-bottom-nav a',
    contentSelector: '#page-content',
    headerSelector: 'main > header',
    allowedPages: ADMIN_PAGES,
    softNav: true,
  });

  window.addEventListener('popstate', () => {
    if (document.getElementById('app-sidebar')) {
      navigateAdminSoft(window.location.href);
    }
  });
}
