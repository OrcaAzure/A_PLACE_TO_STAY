/**
 * APTS splash (initial load) + idle (screensaver) — admin & guest portals.
 * Vanilla JS; clocks use local 24-hour HH:MM:SS with no timezone labels.
 */


const SPLASH_DURATION_MS = 1500;
const IDLE_TIMEOUT_MS = 300_000;
const IDLE_PREVIEW_PARAM = 'previewIdle';
const GUEST_LOTTIE_SRC = '/assets/animations/splash-animation.lottie';
const GUEST_IDLE_LOTTIE_SRC = '/assets/animations/idle-magnifier-animation.lottie';
const DOTLOTTIE_PLAYER_CDN = 'https://cdn.jsdelivr.net/npm/@dotlottie/player-component@2.7.12/dist/dotlottie-player.mjs';
const DOTLOTTIE_LOAD_TIMEOUT_MS = 8000;
const GUEST_IDLE_SLIDE_MS = 8000;

/** @type {Promise<void> | null} */
let dotLottiePromise = null;

function ensureDotLottiePlayer() {
  if (customElements.get('dotlottie-player')) return Promise.resolve();
  if (dotLottiePromise) return dotLottiePromise;

  dotLottiePromise = new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error('dotLottie player load timed out'));
    }, DOTLOTTIE_LOAD_TIMEOUT_MS);

    const done = () => {
      window.clearTimeout(timer);
      resolve();
    };

    const fail = (err) => {
      window.clearTimeout(timer);
      reject(err);
    };

    const waitForElement = () => {
      let settled = false;
      const guard = window.setTimeout(() => {
        if (!settled && !customElements.get('dotlottie-player')) {
          settled = true;
          fail(new Error('dotLottie player definition timed out'));
        }
      }, DOTLOTTIE_LOAD_TIMEOUT_MS);

      customElements.whenDefined('dotlottie-player').then(() => {
        if (settled) return;
        settled = true;
        window.clearTimeout(guard);
        done();
      }).catch((err) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(guard);
        fail(err);
      });
    };

    if (document.querySelector('script[data-apt-dotlottie]')) {
      waitForElement();
      return;
    }

    const script = document.createElement('script');
    script.type = 'module';
    script.src = DOTLOTTIE_PLAYER_CDN;
    script.setAttribute('data-apt-dotlottie', '1');
    script.addEventListener('load', waitForElement);
    script.addEventListener('error', () => fail(new Error('Failed to load dotLottie player')));
    document.head.appendChild(script);
  }).catch((err) => {
    dotLottiePromise = null;
    console.warn('[splash-idle] dotLottie unavailable:', err.message);
    throw err;
  });

  return dotLottiePromise;
}

function guestSplashLottieMarkup() {
  return `
    <div class="apt-splash--guest__lottie-wrap">
      <dotlottie-player
        class="apt-splash--guest__lottie"
        src="${GUEST_LOTTIE_SRC}"
        autoplay
        loop
        mode="normal"
        background="transparent"
        style="width: min(18rem, 78vw); height: min(18rem, 52vh);"
      ></dotlottie-player>
    </div>
    <p class="apt-splash--guest__brand">APTS</p>`;
}

function guestIdleLottieMarkup() {
  return `
    <div class="apt-idle--guest__lottie-wrap" role="img" aria-label="APTS mascot">
      <dotlottie-player
        class="apt-idle--guest__lottie"
        src="${GUEST_IDLE_LOTTIE_SRC}"
        autoplay
        loop
        mode="normal"
        background="transparent"
      ></dotlottie-player>
    </div>`;
}

function startGuestLottiePlayer(container) {
  const player = container?.querySelector('dotlottie-player');
  if (!player) return;
  requestAnimationFrame(() => {
    try {
      if (typeof player.play === 'function') player.play();
      else if (typeof player.setAttribute === 'function') player.setAttribute('autoplay', '');
    } catch {
      /* player may upgrade asynchronously */
    }
  });
}

function guestCloudCatMarkup({ compact = false } = {}) {
  const uid = compact ? 'compact' : 'splash';
  const rootClass = compact
    ? 'apt-cloud-cat apt-cloud-cat--compact'
    : 'apt-cloud-cat apt-cloud-cat--splash';
  return `
    <div class="${rootClass}" role="img" aria-label="APTS cloud cat mascot">
      <div class="apt-cloud-cat__scene">
        <div class="apt-cloud-cat__sign" aria-hidden="true">
          <span class="apt-cloud-cat__brand">APTS</span>
        </div>
        <svg class="apt-cloud-cat__svg" viewBox="0 0 220 150" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <defs>
            <linearGradient id="apt-cloud-fill-${uid}" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#f1f5f9"/>
              <stop offset="55%" stop-color="#e2e8f0"/>
              <stop offset="100%" stop-color="#cbd5e1"/>
            </linearGradient>
            <filter id="apt-cloud-shadow-${uid}" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#1a365d" flood-opacity="0.12"/>
            </filter>
          </defs>
          <g class="apt-cloud-cat__tail" filter="url(#apt-cloud-shadow-${uid})">
            <ellipse cx="178" cy="98" rx="22" ry="14" fill="url(#apt-cloud-fill-${uid})"/>
            <ellipse cx="192" cy="88" rx="14" ry="10" fill="url(#apt-cloud-fill-${uid})"/>
          </g>
          <g class="apt-cloud-cat__body" filter="url(#apt-cloud-shadow-${uid})">
            <ellipse cx="108" cy="92" rx="72" ry="44" fill="url(#apt-cloud-fill-${uid})"/>
            <ellipse cx="62" cy="78" rx="36" ry="30" fill="url(#apt-cloud-fill-${uid})"/>
            <ellipse cx="148" cy="80" rx="34" ry="28" fill="url(#apt-cloud-fill-${uid})"/>
            <ellipse cx="108" cy="68" rx="48" ry="32" fill="url(#apt-cloud-fill-${uid})"/>
          </g>
          <g class="apt-cloud-cat__ears">
            <path d="M72 52 L62 22 L88 44 Z" fill="#94a3b8"/>
            <path d="M76 48 L68 28 L84 42 Z" fill="#e2e8f0"/>
            <path d="M144 52 L154 22 L128 44 Z" fill="#94a3b8"/>
            <path d="M140 48 L148 28 L132 42 Z" fill="#e2e8f0"/>
          </g>
          <g class="apt-cloud-cat__face">
            <ellipse cx="94" cy="82" rx="5" ry="7" fill="#334155"/>
            <ellipse cx="122" cy="82" rx="5" ry="7" fill="#334155"/>
            <ellipse cx="95" cy="80" rx="1.8" ry="2.5" fill="#f8fafc"/>
            <ellipse cx="123" cy="80" rx="1.8" ry="2.5" fill="#f8fafc"/>
            <path d="M108 90 L104 96 L112 96 Z" fill="#f472b6"/>
            <path d="M86 92 Q108 102 130 92" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round"/>
            <line x1="72" y1="86" x2="48" y2="82" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="72" y1="92" x2="48" y2="94" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="144" y1="86" x2="168" y2="82" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="144" y1="92" x2="168" y2="94" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round"/>
          </g>
          <g class="apt-cloud-cat__paws">
            <ellipse cx="82" cy="118" rx="14" ry="10" fill="url(#apt-cloud-fill-${uid})" stroke="#cbd5e1" stroke-width="1"/>
            <ellipse cx="134" cy="118" rx="14" ry="10" fill="url(#apt-cloud-fill-${uid})" stroke="#cbd5e1" stroke-width="1"/>
          </g>
        </svg>
      </div>
    </div>`;
}

const GUEST_FACILITY_IMAGES = [
  'https://images.unsplash.com/photo-1562774053-701939374585?auto=format&fit=crop&w=1920&q=80',
  'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&w=1400&q=80',
  'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1438032455732-1033d28535fd?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1200&q=80',
];

let clockInterval = null;
let idleTimer = null;
let slideInterval = null;
let splashDismissTimer = null;
/** @returns {string} 24-hour clock, e.g. 14:05:09 — no timezone suffix */
export function formatClock24(date = new Date()) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Hide overlays before CSS arrives — guest dashboard does not preload splash-idle.css. */
function setOverlayHidden(el, hidden, { displayWhenVisible = 'flex' } = {}) {
  if (!el) return;
  el.classList.toggle('is-hidden', hidden);
  el.setAttribute('aria-hidden', hidden ? 'true' : 'false');
  if (hidden) {
    el.setAttribute('hidden', '');
    el.style.display = 'none';
  } else {
    el.removeAttribute('hidden');
    el.style.display = displayWhenVisible;
  }
}

function ensureStylesheet() {
  const existing = document.querySelector('link[data-apt-splash-idle]');
  if (existing) {
    if (existing.sheet) return Promise.resolve();
    return new Promise((resolve) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => resolve(), { once: true });
    });
  }

  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/assets/css/global/splash-idle.css';
    link.setAttribute('data-apt-splash-idle', '1');
    link.addEventListener('load', () => resolve(), { once: true });
    link.addEventListener('error', () => resolve(), { once: true });
    document.head.appendChild(link);
  });
}

function bindLiveClock(el) {
  if (!el) return;
  const tick = () => { el.textContent = formatClock24(); };
  tick();
  if (clockInterval) clearInterval(clockInterval);
  clockInterval = setInterval(tick, 1000);
}

function buildGuestSplash({ useLottie = true } = {}) {
  const overlay = document.createElement('div');
  overlay.id = 'apt-splash';
  overlay.className = 'apt-overlay apt-splash apt-splash--guest';
  overlay.setAttribute('data-layout-preserve', '');
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');
  overlay.setAttribute('aria-label', 'Loading APTS');
  const mascot = useLottie
    ? guestSplashLottieMarkup()
    : `${guestCloudCatMarkup()}<p class="apt-splash--guest__brand">APTS</p>`;
  overlay.innerHTML = `
    <div class="apt-splash--guest__inner">
      ${mascot}
      <div class="apt-splash--guest__bar" aria-hidden="true">
        <span class="apt-splash--guest__bar-fill"></span>
      </div>
    </div>`;
  return overlay;
}

function buildAdminSplash() {
  const overlay = document.createElement('div');
  overlay.id = 'apt-splash';
  overlay.className = 'apt-overlay apt-splash apt-splash--admin';
  overlay.setAttribute('data-layout-preserve', '');
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');
  overlay.setAttribute('aria-label', 'System boot');
  overlay.innerHTML = `
    <div class="apt-splash--admin__grid" aria-hidden="true"></div>
    <div class="apt-splash--admin__inner">
      <div class="apt-splash--admin__badge">
        <span class="apt-splash--admin__badge-dot" aria-hidden="true"></span>
        Secure boot
      </div>
      <div class="apt-splash--admin__clock" data-apt-clock>00:00:00</div>
      <p class="apt-splash--admin__label">APTS Admin</p>
      <div class="apt-splash--admin__progress" aria-hidden="true"><span></span></div>
    </div>`;
  return overlay;
}

function guestIdleSceneInnerMarkup({ useLottie = true, showHint = true } = {}) {
  const slides = GUEST_FACILITY_IMAGES.map((url, i) =>
    `<div class="apt-idle--guest__slide${i === 0 ? ' is-active' : ''}" style="background-image:url('${url}')"></div>`,
  ).join('');

  const cards = GUEST_FACILITY_IMAGES.slice(0, 4).map((url) =>
    `<div class="apt-idle--guest__card" style="background-image:url('${url}')"></div>`,
  ).join('');

  const mascot = useLottie
    ? guestIdleLottieMarkup()
    : guestCloudCatMarkup({ compact: true });

  const hint = showHint
    ? '<p class="apt-idle--guest__hint">Touch anywhere to return</p>'
    : '';

  return `
    <div class="apt-idle--guest__slides">${slides}</div>
    <div class="apt-idle--guest__vignette" aria-hidden="true"></div>
    <div class="apt-idle--guest__cards">${cards}</div>
    <div class="apt-idle--guest__message">
      ${mascot}
      <h2>Welcome to APTS – Tap to explore.</h2>
      ${hint}
    </div>`;
}

function buildGuestIdle({ useLottie = true } = {}) {
  const overlay = document.createElement('div');
  overlay.id = 'apt-idle';
  overlay.className = 'apt-overlay apt-idle apt-idle--guest is-hidden';
  overlay.setAttribute('data-layout-preserve', '');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.setAttribute('hidden', '');
  overlay.style.display = 'none';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'APTS screensaver');
  overlay.innerHTML = guestIdleSceneInnerMarkup({ useLottie, showHint: true });
  return overlay;
}

function buildAdminIdle() {
  const overlay = document.createElement('div');
  overlay.id = 'apt-idle';
  overlay.className = 'apt-overlay apt-idle apt-idle--admin is-hidden';
  overlay.setAttribute('data-layout-preserve', '');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.setAttribute('hidden', '');
  overlay.style.display = 'none';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Admin screensaver');
  overlay.innerHTML = `
    <div class="apt-idle--admin__inner">
      <div class="apt-idle--admin__clock" data-apt-clock>00:00:00</div>
      <p class="apt-idle--admin__sub">APTS · Tap or move to resume</p>
    </div>`;
  return overlay;
}

function wantsIdlePreview() {
  const params = new URLSearchParams(window.location.search);
  return params.has(IDLE_PREVIEW_PARAM) || params.get('idle') === 'preview';
}

function dismissSplash(overlay) {
  if (!overlay || overlay.classList.contains('is-hidden')) return;
  overlay.classList.add('is-hidden');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('is-splash-active');
  document.querySelector('.admin-shell')?.classList.remove('is-splash-active');
  window.setTimeout(() => overlay.remove(), 600);
}

/** Dismiss the initial splash overlay if it is still visible. */
export function dismissAptSplash() {
  dismissSplash(document.getElementById('apt-splash'));
}

/**
 * Show the guest/admin idle screensaver immediately (for demos and QA).
 * @param {{ portal?: 'admin'|'guest' }} [options]
 * @returns {Promise<HTMLElement | null>}
 */
export async function showAptIdlePreview({ portal = 'guest' } = {}) {
  const isGuest = portal !== 'admin';
  await ensureStylesheet();

  let guestUseLottie = false;
  if (isGuest) {
    guestUseLottie = await Promise.race([
      ensureDotLottiePlayer().then(() => true).catch(() => false),
      new Promise((resolve) => { window.setTimeout(() => resolve(false), 2000); }),
    ]);
  }

  let idle = document.getElementById('apt-idle');
  if (!idle) {
    idle = isGuest ? buildGuestIdle({ useLottie: guestUseLottie }) : buildAdminIdle();
    document.body.appendChild(idle);
    if (!idle.dataset.activityBound) {
      bindIdleActivity(idle);
      idle.dataset.activityBound = '1';
    }
  }

  dismissAptSplash();
  showIdle(idle);
  return idle;
}

/** @returns {boolean} */
export function isIdlePreviewRequested() {
  return wantsIdlePreview();
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function showIdle(overlay) {
  if (!overlay || !overlay.classList.contains('is-hidden')) return;
  setOverlayHidden(overlay, false);
  bindLiveClock(overlay.querySelector('[data-apt-clock]'));

  if (overlay.classList.contains('apt-idle--guest')) {
    startGuestSlideShow(overlay);
    startGuestLottiePlayer(overlay);
  }
}

function hideIdle(overlay) {
  if (!overlay || overlay.classList.contains('is-hidden')) return;
  setOverlayHidden(overlay, true);
  stopGuestSlideShow();
  resetIdleTimer(overlay);
}

function startGuestSlideShow(overlay) {
  stopGuestSlideShow();
  const slides = [...overlay.querySelectorAll('.apt-idle--guest__slide')];
  if (slides.length < 2 || prefersReducedMotion()) return;
  let index = 0;
  slideInterval = window.setInterval(() => {
    slides[index]?.classList.remove('is-active');
    index = (index + 1) % slides.length;
    slides[index]?.classList.add('is-active');
  }, GUEST_IDLE_SLIDE_MS);
}

function stopGuestSlideShow() {
  if (slideInterval) {
    clearInterval(slideInterval);
    slideInterval = null;
  }
}

function resetIdleTimer(idleOverlay) {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => showIdle(idleOverlay), IDLE_TIMEOUT_MS);
}

function bindIdleActivity(idleOverlay) {
  const onActivity = () => {
    if (!idleOverlay.classList.contains('is-hidden')) return;
    resetIdleTimer(idleOverlay);
  };

  const wake = () => {
    if (idleOverlay.classList.contains('is-hidden')) return;
    hideIdle(idleOverlay);
  };

  const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'];
  events.forEach((ev) => {
    document.addEventListener(ev, () => {
      onActivity();
      wake();
    }, { passive: true });
  });

  idleOverlay.addEventListener('click', () => hideIdle(idleOverlay));
  resetIdleTimer(idleOverlay);
}

function shouldShowSplash(portal) {
  const key = `APTS.splash.${portal}`;
  if (sessionStorage.getItem(key) === '1') return false;
  sessionStorage.setItem(key, '1');
  return true;
}

/**
 * @param {{ portal: 'admin'|'guest', forceSplash?: boolean, skipIdle?: boolean, autoDismiss?: boolean }} options
 */
export async function initSplashIdle({
  portal = 'guest',
  forceSplash = false,
  skipIdle = false,
  autoDismiss = true,
} = {}) {
  await ensureStylesheet();

  const isAdmin = portal === 'admin';
  const isGuest = !isAdmin;

  if (isAdmin) {
    document.body.classList.add('is-splash-active');
    document.querySelector('.admin-shell')?.classList.add('is-splash-active');
  }

  let splash = document.getElementById('apt-splash');
  const showSplash = forceSplash || shouldShowSplash(portal);

  let guestUseLottie = false;
  if (isGuest) {
    guestUseLottie = await Promise.race([
      ensureDotLottiePlayer().then(() => true).catch(() => false),
      new Promise((resolve) => { window.setTimeout(() => resolve(false), 2000); }),
    ]);
  }

  if (showSplash && !splash) {
    splash = isAdmin ? buildAdminSplash() : buildGuestSplash({ useLottie: guestUseLottie });
    if (!autoDismiss) splash.classList.add('apt-splash--hold');
    document.body.appendChild(splash);
    bindLiveClock(splash.querySelector('[data-apt-clock]'));
    if (isGuest && guestUseLottie) {
      startGuestLottiePlayer(splash);
    }
  } else if (!showSplash && splash) {
    // initAppLayout re-enters after the page already started splash — keep it.
    if (!autoDismiss) {
      splash.classList.add('apt-splash--hold');
    } else {
      splash.remove();
      splash = null;
      document.body.classList.remove('is-splash-active');
      document.querySelector('.admin-shell')?.classList.remove('is-splash-active');
    }
  }

  let idle = document.getElementById('apt-idle');
  if (!idle) {
    idle = isAdmin ? buildAdminIdle() : buildGuestIdle({ useLottie: guestUseLottie });
    document.body.appendChild(idle);
    if (!skipIdle && !idle.dataset.activityBound) {
      bindIdleActivity(idle);
      idle.dataset.activityBound = '1';
    }
  } else if (idle.classList.contains('is-hidden')) {
    setOverlayHidden(idle, true);
  }

  if (splash && showSplash && autoDismiss) {
    if (splashDismissTimer) clearTimeout(splashDismissTimer);
    splashDismissTimer = window.setTimeout(() => dismissSplash(splash), SPLASH_DURATION_MS);
  } else if (!showSplash && !splash) {
    document.body.classList.remove('is-splash-active');
    document.querySelector('.admin-shell')?.classList.remove('is-splash-active');
  }

  if (wantsIdlePreview() && idle) {
    if (splash) dismissSplash(splash);
    window.setTimeout(() => showIdle(idle), 0);
  }

  return { splash, idle };
}
