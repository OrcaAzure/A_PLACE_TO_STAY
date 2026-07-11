/**
 * APTSpace GSAP animation API
 * Chrome (sidebar + header) stays static — only page content animates.
 */

const GSAP_CDN = 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js';

const EASE = {
  soft: 'sine.out',
  smooth: 'power1.inOut',
  enter: 'power1.out',
};

const DUR = {
  slow: 0.85,
  med: 0.6,
  fast: 0.4,
};

/** @type {Promise<typeof gsap> | null} */
let gsapPromise = null;

const STATIC_SELECTORS = '#app-sidebar, #app-sidebar *, main > header, main > header *';

export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function loadGsap() {
  if (window.gsap) return Promise.resolve(window.gsap);
  if (gsapPromise) return gsapPromise;

  gsapPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GSAP_CDN;
    script.async = true;
    script.onload = () => resolve(window.gsap);
    script.onerror = () => reject(new Error('Failed to load GSAP'));
    document.head.appendChild(script);
  });

  return gsapPromise;
}

function revealInstant(root, selector) {
  root.querySelectorAll(selector).forEach((el) => {
    el.style.opacity = '1';
    el.style.transform = 'none';
  });
}

/** End boot phase — sidebar/tab transitions stay disabled until content is ready. */
export function releaseChromeBoot() {
  requestAnimationFrame(() => {
    document.documentElement.classList.remove('admin-chrome-boot');
  });
}

/** Collect visible page sections for enter animation (supports mount containers). */
export function collectAnimatableBlocks(root = document) {
  const page = root.querySelector('#page-content');
  if (!page) return [];

  const blocks = [];
  const mountIds = new Set(['action-cards-mount', 'timeline-mount']);

  for (const child of page.children) {
    if (child.classList.contains('hidden')) continue;
    if (child.hasAttribute('data-no-page-enter')) continue;
    if (child.classList.contains('res-hub-tabs')) continue;

    if (child.classList.contains('settings-workspace')) {
      const visiblePanel = child.querySelector('.app-tab-panel:not(.is-tab-hidden)');
      blocks.push(visiblePanel || child);
      continue;
    }

    if (mountIds.has(child.id)) {
      child.querySelectorAll(':scope > *').forEach((inner) => blocks.push(inner));
      continue;
    }

    if (child.id?.endsWith('-mount') && !child.children.length) continue;

    blocks.push(child);
  }

  return blocks;
}

/** Lock sidebar + header — no motion on navigation chrome. */
export function lockStaticChrome(root = document) {
  root.querySelectorAll(STATIC_SELECTORS).forEach((el) => {
    el.classList.add('anim-static');
    if (window.gsap) {
      window.gsap.set(el, { opacity: 1, x: 0, y: 0, scale: 1, clearProps: 'transform' });
    } else {
      el.style.opacity = '1';
      el.style.transform = 'none';
    }
  });
}

/** Page load — content only (excludes sidebar, header, kpi-grid). */
export async function initAdminPageAnimations(root = document) {
  lockStaticChrome(root);

  const contentBlocks = collectAnimatableBlocks(root);

  if (prefersReducedMotion()) {
    revealInstant(root, '#page-content > *');
    root.querySelectorAll('#action-cards-mount > *, #timeline-mount > *').forEach((el) => {
      el.style.opacity = '1';
      el.style.transform = 'none';
    });
    return;
  }

  const gsap = await loadGsap();
  lockStaticChrome(root);

  if (!contentBlocks.length) return;

  gsap.set(contentBlocks, { opacity: 0, y: 10 });
  gsap.to(contentBlocks, {
    opacity: 1,
    y: 0,
    duration: DUR.slow,
    stagger: 0.12,
    ease: EASE.soft,
    clearProps: 'opacity,transform',
  });
}

/** KPI / stat cards — gentle fade + scale after data loads. */
export async function animateStatCards(selector = '.kpi-card, .admin-stat-card', root = document) {
  const cards = root.querySelectorAll(selector);
  if (!cards.length) return;

  const grid = root.querySelector('.kpi-grid');
  if (grid) grid.classList.remove('opacity-0');

  if (prefersReducedMotion()) {
    revealInstant(root, selector);
    return;
  }

  const gsap = await loadGsap();
  gsap.fromTo(
    cards,
    { opacity: 0, scale: 0.97, y: 6 },
    {
      opacity: 1,
      scale: 1,
      y: 0,
      duration: DUR.med,
      stagger: 0.08,
      ease: EASE.soft,
      clearProps: 'opacity,transform',
    }
  );
}

/** Smooth count-up for numeric KPI values. */
export async function animateCountUp(element, displayText, options = {}) {
  if (!element) return;

  const numeric = parseFloat(String(displayText).replace(/[^0-9.-]/g, ''));
  const prefix = String(displayText).match(/^[^0-9-]*/)?.[0] || '';
  const suffix = String(displayText).match(/[^0-9.-]*$/)?.[0] || '';

  if (prefersReducedMotion() || Number.isNaN(numeric)) {
    element.textContent = displayText;
    return;
  }

  const gsap = await loadGsap();
  const state = { val: 0 };
  gsap.to(state, {
    val: numeric,
    duration: options.duration ?? 1.1,
    ease: EASE.smooth,
    onUpdate: () => {
      const rounded = Number.isInteger(numeric)
        ? Math.round(state.val)
        : Math.round(state.val * 10) / 10;
      element.textContent = `${prefix}${rounded}${suffix}`;
    },
    onComplete: () => {
      element.textContent = displayText;
    },
  });
}

/** Chart bars — slow ease upward. */
export async function animateChartBars(selector = '.chart-bar', root = document) {
  const bars = root.querySelectorAll(selector);
  if (!bars.length) return;

  bars.forEach((bar) => {
    const target = bar.getAttribute('data-height') || bar.style.height || '100%';
    bar.style.height = '0px';
    bar.dataset._animHeight = target;
  });

  if (prefersReducedMotion()) {
    bars.forEach((bar) => {
      bar.style.height = bar.dataset._animHeight || '100%';
    });
    return;
  }

  const gsap = await loadGsap();
  gsap.to(bars, {
    height: (i, el) => el.dataset._animHeight,
    duration: 1.15,
    stagger: 0.1,
    ease: EASE.smooth,
    delay: 0.2,
  });
}

/** Table rows — soft fade only (no horizontal slide). */
export async function animateTableRows(tbodySelector, root = document) {
  const tbody = root.querySelector(tbodySelector);
  if (!tbody) return;
  const rows = tbody.querySelectorAll('tr');
  if (!rows.length) return;

  if (prefersReducedMotion()) return;

  const gsap = await loadGsap();
  gsap.fromTo(
    rows,
    { opacity: 0, y: 4 },
    { opacity: 1, y: 0, duration: DUR.fast, stagger: 0.05, ease: EASE.soft, clearProps: 'opacity,transform' }
  );
}

/** Activity feed / list items. */
export async function staggerReveal(selector, root = document, options = {}) {
  const items = root.querySelectorAll(selector);
  if (!items.length) return;

  if (prefersReducedMotion()) {
    revealInstant(root, selector);
    return;
  }

  const gsap = await loadGsap();
  gsap.fromTo(
    items,
    { opacity: 0, y: options.y ?? 8 },
    {
      opacity: 1,
      y: 0,
      duration: options.duration ?? DUR.med,
      stagger: options.stagger ?? 0.07,
      ease: options.ease ?? EASE.soft,
      delay: options.delay ?? 0,
      clearProps: 'transform',
    }
  );
}

/** Subtle hover lift on action cards. */
export async function initActionCardHovers(root = document) {
  if (prefersReducedMotion()) return;

  const gsap = await loadGsap();
  root.querySelectorAll('.action-card').forEach((card) => {
    card.addEventListener('mouseenter', () => {
      gsap.to(card, { y: -3, boxShadow: '0 8px 24px rgba(26,54,93,0.1)', duration: 0.35, ease: EASE.soft });
    });
    card.addEventListener('mouseleave', () => {
      gsap.to(card, { y: 0, boxShadow: '0 1px 2px rgba(0,0,0,0.04)', duration: 0.4, ease: EASE.soft });
    });
  });
}

/** Overlay fade for drawer / modal backdrop. */
export async function animateOverlayIn(overlayEl) {
  if (!overlayEl || prefersReducedMotion()) return;
  const gsap = await loadGsap();
  gsap.fromTo(overlayEl, { opacity: 0 }, { opacity: 1, duration: DUR.fast, ease: EASE.soft });
}

/** Drawer — fade content only (slide handled by CSS). */
export async function animateDrawerOpen(drawerEl) {
  if (!drawerEl || prefersReducedMotion()) return;
  const gsap = await loadGsap();
  const body = drawerEl.querySelector('#drawerBody');
  const overlay = document.getElementById('drawerOverlay');
  if (overlay) animateOverlayIn(overlay);
  if (body) {
    gsap.fromTo(body, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: DUR.med, ease: EASE.soft, delay: 0.1 });
  }
}

/** Modal — gentle scale fade (no bounce). */
export async function animateModalOpen(modalShell) {
  if (!modalShell || prefersReducedMotion()) return;
  const gsap = await loadGsap();
  const overlay = document.getElementById('modal-overlay');
  if (overlay) animateOverlayIn(overlay);
  gsap.fromTo(
    modalShell,
    { scale: 0.98, opacity: 0 },
    { scale: 1, opacity: 1, duration: DUR.med, ease: EASE.soft }
  );
}

/** Notifications panel slide + fade. */
export async function animateNotificationsPanel(panel, opening = true) {
  if (!panel || prefersReducedMotion()) return;
  const gsap = await loadGsap();

  if (opening) {
    panel.classList.remove('hidden');
    gsap.fromTo(
      panel,
      { opacity: 0, x: 12, scale: 0.98 },
      { opacity: 1, x: 0, scale: 1, duration: DUR.med, ease: EASE.soft }
    );
  } else {
    await gsap.to(panel, { opacity: 0, x: 8, duration: 0.3, ease: EASE.soft });
    panel.classList.add('hidden');
    gsap.set(panel, { clearProps: 'all' });
  }
}

/** Drawer tab switch — crossfade panel content. */
export async function animateDrawerTabSwitch(panelEl) {
  if (!panelEl || panelEl.classList.contains('hidden') || prefersReducedMotion()) return;
  const gsap = await loadGsap();
  gsap.fromTo(panelEl, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: DUR.fast, ease: EASE.soft });
}

/** Admin panel inner sections (tables, forms). */
export async function animatePanelContent(
  selector = '.admin-panel-body, .timeline-workspace .overflow-x-auto, .res-action-card',
  root = document
) {
  const panels = root.querySelectorAll(selector);
  if (!panels.length || prefersReducedMotion()) return;

  const gsap = await loadGsap();
  gsap.fromTo(
    panels,
    { opacity: 0, y: 6 },
    { opacity: 1, y: 0, duration: DUR.med, stagger: 0.08, ease: EASE.soft, clearProps: 'opacity,transform' }
  );
}

export function revealPageContent(root = document) {
  root.querySelectorAll('#page-content > *').forEach((el) => {
    el.style.opacity = '1';
    el.style.transform = 'none';
  });
  root.querySelectorAll('#page-content [data-no-page-enter]').forEach((el) => {
    el.style.opacity = '1';
    el.style.transform = 'none';
  });
}

/** Run page content animations — sidebar/header stay locked via lockStaticChrome. */
export async function initAdminEnhancements(root = document) {
  lockStaticChrome(root);
  await initAdminPageAnimations(root);
  await initActionCardHovers(root);
  await animatePanelContent(undefined, root);
  revealPageContent(root);
  releaseChromeBoot();
}
