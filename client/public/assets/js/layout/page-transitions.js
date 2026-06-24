/**
 * Smooth transitions when navigating between portal pages (MPA).
 */

import { prefersReducedMotion } from '/assets/js/layout/animations.js';

const DURATION_MS = 300;

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

let navigating = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pageNameFromHref(href) {
  try {
    const url = new URL(href, window.location.href);
    const path = url.pathname;
    return path.split('/').pop() || '';
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
  const name = pageNameFromHref(href);
  return allowedPages.has(name);
}

async function animateExit(contentEl, headerEl) {
  if (!contentEl || prefersReducedMotion()) return;
  contentEl.classList.add('page-exit-active');
  if (headerEl) headerEl.classList.add('page-exit-active');
  await sleep(DURATION_MS);
}

function animateEnter(contentEl, headerEl) {
  if (!contentEl || prefersReducedMotion()) return;
  contentEl.classList.add('page-enter-start');
  if (headerEl) headerEl.classList.add('page-enter-start');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      contentEl.classList.add('page-enter-active');
      contentEl.classList.remove('page-enter-start');
      if (headerEl) {
        headerEl.classList.add('page-enter-active');
        headerEl.classList.remove('page-enter-start');
      }
    });
  });
}

function bindPortalNavTransitions({
  navSelector,
  contentSelector,
  headerSelector,
  allowedPages,
}) {
  const contentEl = document.querySelector(contentSelector);
  if (!contentEl) return;

  const headerEl = headerSelector ? document.querySelector(headerSelector) : null;

  animateEnter(contentEl, headerEl);

  document.querySelectorAll(navSelector).forEach((link) => {
    if (!isInternalPortalLink(link, allowedPages)) return;

    link.addEventListener('click', async (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      if (isSameDocument(link.href)) {
        e.preventDefault();
        return;
      }

      e.preventDefault();
      if (navigating) return;
      navigating = true;

      link.classList.add('portal-nav-pending');

      if (prefersReducedMotion()) {
        window.location.href = link.href;
        return;
      }

      await animateExit(contentEl, headerEl);
      window.location.href = link.href;
    });
  });
}

/** Guest portal — sidebar + bottom nav only (not in-page content links). */
export function initGuestPageNavTransitions() {
  bindPortalNavTransitions({
    navSelector: '.guest-sidebar nav a, .guest-bottom-nav a',
    contentSelector: '.guest-main',
    headerSelector: '.guest-header',
    allowedPages: GUEST_PAGES,
  });
}

/** Admin portal — sidebar primary nav. */
export function initAdminPageNavTransitions() {
  bindPortalNavTransitions({
    navSelector: '#app-sidebar nav a',
    contentSelector: '#page-content',
    headerSelector: 'main > header',
    allowedPages: ADMIN_PAGES,
  });
}
