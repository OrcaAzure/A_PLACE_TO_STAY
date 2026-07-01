/**
 * AptSpace splash (initial load) + idle (screensaver) — admin & guest portals.
 * Vanilla JS; clocks use local 24-hour HH:MM:SS with no timezone labels.
 */

const SPLASH_DURATION_MS = 1500;
const IDLE_TIMEOUT_MS = 300_000;
const KIOSK_CORNER_CLICKS = 3;
const KIOSK_LONG_PRESS_MS = 900;
const KIOSK_PIN = '2468';
const GUEST_LOTTIE_SRC = '/assets/animations/splash-animation.lottie';
const DOTLOTTIE_PLAYER_CDN = 'https://cdn.jsdelivr.net/npm/@dotlottie/player-component@2.7.12/dist/dotlottie-player.mjs';
const DOTLOTTIE_LOAD_TIMEOUT_MS = 8000;

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
      customElements.whenDefined('dotlottie-player').then(done).catch(fail);
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
    <p class="apt-splash--guest__brand" data-apt-kiosk-logo>AptSpace</p>`;
}

function guestIdleLottieMarkup() {
  return `
    <div class="apt-idle--guest__lottie-wrap" data-apt-kiosk-logo role="img" aria-label="AptSpace mascot">
      <dotlottie-player
        class="apt-idle--guest__lottie"
        src="${GUEST_LOTTIE_SRC}"
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
    <div class="${rootClass}" data-apt-kiosk-logo role="img" aria-label="AptSpace cloud cat mascot">
      <div class="apt-cloud-cat__scene">
        <div class="apt-cloud-cat__sign" aria-hidden="true">
          <span class="apt-cloud-cat__brand">AptSpace</span>
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
let kioskCornerCount = 0;
let kioskCornerResetTimer = null;

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

function ensureStylesheet() {
  if (document.querySelector('link[data-apt-splash-idle]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/assets/css/global/splash-idle.css';
  link.setAttribute('data-apt-splash-idle', '1');
  document.head.appendChild(link);
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
  overlay.setAttribute('aria-label', 'Loading AptSpace');
  const mascot = useLottie
    ? guestSplashLottieMarkup()
    : `${guestCloudCatMarkup()}<p class="apt-splash--guest__brand" data-apt-kiosk-logo>AptSpace</p>`;
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
      <p class="apt-splash--admin__label">AptSpace Admin</p>
      <div class="apt-splash--admin__progress" aria-hidden="true"><span></span></div>
    </div>`;
  return overlay;
}

function buildGuestIdle({ useLottie = true } = {}) {
  const slides = GUEST_FACILITY_IMAGES.map((url, i) =>
    `<div class="apt-idle--guest__slide${i === 0 ? ' is-active' : ''}" style="background-image:url('${url}')"></div>`,
  ).join('');

  const cards = GUEST_FACILITY_IMAGES.slice(0, 4).map((url) =>
    `<div class="apt-idle--guest__card" style="background-image:url('${url}')"></div>`,
  ).join('');

  const mascot = useLottie
    ? guestIdleLottieMarkup()
    : guestCloudCatMarkup({ compact: true });

  const overlay = document.createElement('div');
  overlay.id = 'apt-idle';
  overlay.className = 'apt-overlay apt-idle apt-idle--guest is-hidden';
  overlay.setAttribute('data-layout-preserve', '');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'AptSpace screensaver');
  overlay.innerHTML = `
    <div class="apt-idle--guest__slides">${slides}</div>
    <div class="apt-idle--guest__vignette" aria-hidden="true"></div>
    <div class="apt-idle--guest__cards">${cards}</div>
    <div class="apt-idle--guest__message">
      ${mascot}
      <h2>Welcome to AptSpace – Tap to explore.</h2>
      <p class="apt-idle--guest__hint">Touch anywhere to return</p>
    </div>
    <div class="apt-idle--guest__kiosk-zone" data-apt-kiosk-corner aria-hidden="true"></div>`;
  return overlay;
}

function buildAdminIdle() {
  const overlay = document.createElement('div');
  overlay.id = 'apt-idle';
  overlay.className = 'apt-overlay apt-idle apt-idle--admin is-hidden';
  overlay.setAttribute('data-layout-preserve', '');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Admin screensaver');
  overlay.innerHTML = `
    <div class="apt-idle--admin__inner">
      <div class="apt-idle--admin__clock" data-apt-clock>00:00:00</div>
      <p class="apt-idle--admin__sub">AptSpace · Tap or move to resume</p>
    </div>`;
  return overlay;
}

function dismissSplash(overlay) {
  if (!overlay || overlay.classList.contains('is-hidden')) return;
  overlay.classList.add('is-hidden');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('is-splash-active');
  document.querySelector('.admin-shell')?.classList.remove('is-splash-active');
  window.setTimeout(() => overlay.remove(), 600);
}

function showIdle(overlay) {
  if (!overlay || !overlay.classList.contains('is-hidden')) return;
  overlay.classList.remove('is-hidden');
  overlay.setAttribute('aria-hidden', 'false');
  bindLiveClock(overlay.querySelector('[data-apt-clock]'));

  if (overlay.classList.contains('apt-idle--guest')) {
    startGuestSlideShow(overlay);
    startGuestLottiePlayer(overlay);
  }
}

function hideIdle(overlay) {
  if (!overlay || overlay.classList.contains('is-hidden')) return;
  overlay.classList.add('is-hidden');
  overlay.setAttribute('aria-hidden', 'true');
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
  }, 6000);
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

function ensureKioskModal() {
  let overlay = document.getElementById('apt-kiosk-modal-overlay');
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = 'apt-kiosk-modal-overlay';
  overlay.className = 'apt-kiosk-modal-overlay is-hidden';
  overlay.setAttribute('data-layout-preserve', '');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = `
    <div class="apt-kiosk-modal" role="dialog" aria-modal="true" aria-labelledby="apt-kiosk-title">
      <h3 id="apt-kiosk-title">Staff access</h3>
      <p>Enter the admin PIN or sign in with your credentials.</p>
      <div id="apt-kiosk-error" class="apt-kiosk-modal__error hidden" role="alert"></div>
      <form id="apt-kiosk-form">
        <label for="apt-kiosk-pin">Admin PIN</label>
        <input id="apt-kiosk-pin" type="password" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="••••" />
        <div class="apt-kiosk-modal__actions">
          <button type="button" class="apt-kiosk-modal__btn apt-kiosk-modal__btn--ghost" data-apt-kiosk-cancel>Cancel</button>
          <button type="submit" class="apt-kiosk-modal__btn apt-kiosk-modal__btn--primary">Unlock</button>
        </div>
      </form>
      <p style="margin-top:0.85rem;font-size:0.75rem;text-align:center;">
        <a href="/login.html" class="text-primary font-semibold no-underline">Sign in with email</a>
      </p>
    </div>`;

  document.body.appendChild(overlay);

  const hide = () => {
    overlay.classList.add('is-hidden');
    overlay.setAttribute('aria-hidden', 'true');
    const err = document.getElementById('apt-kiosk-error');
    err?.classList.add('hidden');
    const pin = document.getElementById('apt-kiosk-pin');
    if (pin) pin.value = '';
  };

  overlay.querySelector('[data-apt-kiosk-cancel]')?.addEventListener('click', hide);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) hide();
  });

  document.getElementById('apt-kiosk-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = document.getElementById('apt-kiosk-pin')?.value?.trim() || '';
    const err = document.getElementById('apt-kiosk-error');
    if (pin === KIOSK_PIN) {
      hide();
      const idle = document.getElementById('apt-idle');
      hideIdle(idle);
      window.location.href = '/login.html';
      return;
    }
    if (err) {
      err.textContent = 'Invalid PIN. Try again or use email sign-in.';
      err.classList.remove('hidden');
    }
  });

  return overlay;
}

export function openKioskAdminModal() {
  const overlay = ensureKioskModal();
  overlay.classList.remove('is-hidden');
  overlay.setAttribute('aria-hidden', 'false');
  document.getElementById('apt-kiosk-pin')?.focus();
}

function onKioskCornerTap() {
  kioskCornerCount += 1;
  if (kioskCornerResetTimer) clearTimeout(kioskCornerResetTimer);
  kioskCornerResetTimer = window.setTimeout(() => { kioskCornerCount = 0; }, 1200);
  if (kioskCornerCount >= KIOSK_CORNER_CLICKS) {
    kioskCornerCount = 0;
    openKioskAdminModal();
  }
}

function bindKioskLongPress(el) {
  if (!el) return;
  let pressTimer = null;

  const clear = () => {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  };

  el.addEventListener('pointerdown', () => {
    clear();
    pressTimer = window.setTimeout(() => {
      pressTimer = null;
      openKioskAdminModal();
    }, KIOSK_LONG_PRESS_MS);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => {
    el.addEventListener(ev, clear);
  });
}

function bindIdleActivity(idleOverlay, { isGuest }) {
  const onActivity = () => {
    if (!idleOverlay.classList.contains('is-hidden')) return;
    resetIdleTimer(idleOverlay);
  };

  const wake = (e) => {
    if (idleOverlay.classList.contains('is-hidden')) return;
    if (e?.type === 'click' && e.target?.closest?.('[data-apt-kiosk-corner]')) return;
    if (document.getElementById('apt-kiosk-modal-overlay')?.classList.contains('is-hidden') === false) return;
    hideIdle(idleOverlay);
  };

  const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'];
  events.forEach((ev) => {
    document.addEventListener(ev, (e) => {
      onActivity();
      wake(e);
    }, { passive: true });
  });

  if (isGuest) {
    idleOverlay.addEventListener('click', (e) => {
      if (e.target.closest('[data-apt-kiosk-corner]')) return;
      hideIdle(idleOverlay);
    });
    idleOverlay.querySelector('[data-apt-kiosk-corner]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      onKioskCornerTap();
    });
    bindKioskLongPress(idleOverlay.querySelector('[data-apt-kiosk-logo]'));
    bindKioskLongPress(document.querySelector('.lp-nav-brand, .guest-top-nav .lp-nav-brand'));
  } else {
    idleOverlay.addEventListener('click', () => hideIdle(idleOverlay));
  }

  resetIdleTimer(idleOverlay);
}

function shouldShowSplash(portal) {
  const key = `aptspace.splash.${portal}`;
  if (sessionStorage.getItem(key) === '1') return false;
  sessionStorage.setItem(key, '1');
  return true;
}

/**
 * @param {{ portal: 'admin'|'guest', forceSplash?: boolean, skipIdle?: boolean }} options
 */
export async function initSplashIdle({ portal = 'guest', forceSplash = false, skipIdle = false } = {}) {
  ensureStylesheet();

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
    guestUseLottie = await ensureDotLottiePlayer().then(() => true).catch(() => false);
  }

  if (showSplash && !splash) {
    splash = isAdmin ? buildAdminSplash() : buildGuestSplash({ useLottie: guestUseLottie });
    document.body.appendChild(splash);
    bindLiveClock(splash.querySelector('[data-apt-clock]'));
    if (isGuest) {
      bindKioskLongPress(splash.querySelector('[data-apt-kiosk-logo]'));
      if (guestUseLottie) startGuestLottiePlayer(splash);
    }
  } else if (!showSplash && splash) {
    splash.remove();
    splash = null;
    document.body.classList.remove('is-splash-active');
    document.querySelector('.admin-shell')?.classList.remove('is-splash-active');
  }

  let idle = document.getElementById('apt-idle');
  if (!idle) {
    idle = isAdmin ? buildAdminIdle() : buildGuestIdle({ useLottie: guestUseLottie });
    document.body.appendChild(idle);
    ensureKioskModal();
    if (!skipIdle && !idle.dataset.activityBound) {
      bindIdleActivity(idle, { isGuest });
      idle.dataset.activityBound = '1';
    }
  }

  if (splash && showSplash) {
    if (splashDismissTimer) clearTimeout(splashDismissTimer);
    splashDismissTimer = window.setTimeout(() => dismissSplash(splash), SPLASH_DURATION_MS);
  } else {
    document.body.classList.remove('is-splash-active');
    document.querySelector('.admin-shell')?.classList.remove('is-splash-active');
  }

  return { splash, idle };
}
