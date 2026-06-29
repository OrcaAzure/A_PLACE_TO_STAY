/**
 * Guest portal chrome — landing-style nav, animations, user menu.
 */

import { initNavScroll, initMobileMenu, initLandingPage } from '/assets/js/layout/landing.js';

function initGuestUserMenu() {
  const btn = document.getElementById('guest-user-menu-btn');
  const menu = document.getElementById('guest-user-dropdown');
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
    if (!menu.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
      setOpen(false);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(false);
  });
}

export async function initGuestPortalChrome() {
  initNavScroll(document.querySelector('.guest-top-nav'));
  initGuestUserMenu();

  if (document.getElementById('page-content')?.classList.contains('guest-landing')) {
    await initLandingPage();
  } else {
    initMobileMenu();
  }
}
