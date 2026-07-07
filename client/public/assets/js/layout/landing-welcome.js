/**
 * Landing welcome after the greeting preloader.
 * Preloader → "Welcome to AptSpace" → landing page.
 */

const IDLE_LOTTIE_SRC = '/assets/animations/idle-magnifier-animation.lottie';
const DOTLOTTIE_CDN = 'https://cdn.jsdelivr.net/npm/@dotlottie/player-component@2.7.12/dist/dotlottie-player.mjs';
const WELCOME_MS = 2500;
const EXIT_MS = 520;

let dotLottiePromise = null;

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function loadDotLottie() {
  if (customElements.get('dotlottie-player')) return Promise.resolve(true);
  if (dotLottiePromise) return dotLottiePromise;

  dotLottiePromise = new Promise((resolve) => {
    const finish = (ok) => {
      window.clearTimeout(timer);
      resolve(ok);
    };
    const timer = window.setTimeout(() => finish(false), 4000);

    const onReady = () => finish(!!customElements.get('dotlottie-player'));

    if (document.querySelector('script[data-apt-dotlottie]')) {
      customElements.whenDefined('dotlottie-player').then(onReady).catch(() => finish(false));
      return;
    }

    const script = document.createElement('script');
    script.type = 'module';
    script.src = DOTLOTTIE_CDN;
    script.setAttribute('data-apt-dotlottie', '1');
    script.addEventListener('load', () => {
      customElements.whenDefined('dotlottie-player').then(onReady).catch(() => finish(false));
    });
    script.addEventListener('error', () => finish(false));
    document.head.appendChild(script);
  });

  return dotLottiePromise;
}

const MAGNIFIER_SVG = `
  <svg class="lp-welcome__magnifier" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="27" cy="27" r="17" fill="#f8fafc" stroke="#475569" stroke-width="4"/>
    <rect x="39" y="39" width="6" height="18" rx="3" transform="rotate(45 39 39)" fill="#64748b"/>
  </svg>`;

const LOTTIE_MARKUP = `
  <dotlottie-player
    class="lp-welcome__lottie"
    src="${IDLE_LOTTIE_SRC}"
    autoplay
    loop
    mode="normal"
    background="transparent"
  ></dotlottie-player>`;

function buildWelcomeOverlay() {
  const el = document.createElement('div');
  el.id = 'lp-welcome';
  el.className = 'lp-welcome is-entering';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('aria-label', 'Welcome to AptSpace');
  el.innerHTML = `
    <div class="lp-welcome__bg-grid" aria-hidden="true"></div>
    <div class="lp-welcome__bg-smoke" aria-hidden="true">
      <span class="lp-welcome__smoke lp-welcome__smoke--a"></span>
      <span class="lp-welcome__smoke lp-welcome__smoke--b"></span>
    </div>
    <div class="lp-welcome__vignette" aria-hidden="true"></div>
    <div class="lp-welcome__inner">
      <div class="lp-welcome__stage">
        <div class="lp-welcome__search-zone">
          <div class="lp-welcome__search-text">
            <p class="lp-welcome__title-line">Welcome to</p>
            <h1 class="lp-welcome__brand" aria-label="AptSpace">
              <span class="lp-welcome__apt">Apt</span><span class="lp-welcome__space">Space</span>
            </h1>
          </div>
          <div class="lp-welcome__icon" aria-hidden="true">
            <span class="lp-welcome__icon-glow"></span>
            <span class="lp-welcome__icon-media">${LOTTIE_MARKUP}</span>
          </div>
        </div>
      </div>
    </div>`;
  return el;
}

function playLottie(player) {
  if (!player) return;
  requestAnimationFrame(() => {
    try {
      if (typeof player.play === 'function') player.play();
    } catch {
      /* ignore */
    }
  });
}

function mountMagnifierFallback(welcome) {
  const media = welcome.querySelector('.lp-welcome__icon-media');
  if (media) media.innerHTML = MAGNIFIER_SVG;
}

/** Preload Lottie during the greeting preloader. */
export function preloadWelcomeAssets() {
  return loadDotLottie();
}

/**
 * Mount welcome overlay synchronously (used during preloader handoff).
 * @returns {HTMLElement | null}
 */
export function mountLandingWelcome() {
  if (prefersReducedMotion()) return null;

  document.getElementById('lp-welcome')?.remove();

  const welcome = buildWelcomeOverlay();
  document.body.appendChild(welcome);
  document.body.classList.add('lp-page-hidden');
  return welcome;
}

/**
 * @returns {Promise<void>}
 */
export async function runLandingWelcome() {
  if (prefersReducedMotion()) return;

  const welcome = document.getElementById('lp-welcome') || mountLandingWelcome();
  if (!welcome) return;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => welcome.classList.remove('is-entering'));
  });

  loadDotLottie().then((ok) => {
    if (!welcome.isConnected) return;
    if (!ok) {
      mountMagnifierFallback(welcome);
      return;
    }
    const media = welcome.querySelector('.lp-welcome__icon-media');
    if (media && !media.querySelector('dotlottie-player')) {
      media.innerHTML = LOTTIE_MARKUP;
    }
    playLottie(welcome.querySelector('dotlottie-player'));
  });

  await delay(WELCOME_MS);

  const exit = prefersReducedMotion() ? 100 : EXIT_MS;
  welcome.classList.add('is-exiting');
  await delay(exit);

  welcome.remove();
}

/** @deprecated Use runLandingWelcome */
export const runLandingIdleWelcome = runLandingWelcome;
