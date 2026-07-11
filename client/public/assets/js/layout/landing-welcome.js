/**
 * Landing welcome after the greeting preloader.
 * Preloader → "Welcome to APTSpace" → landing page.
 */

const IDLE_LOTTIE_SRC = '/assets/animations/idle-magnifier-animation.lottie';
const DOTLOTTIE_CDN = 'https://cdn.jsdelivr.net/npm/@dotlottie/player-component@2.7.12/dist/dotlottie-player.mjs';
const WELCOME_MS = 2000;
const EXIT_MS = 520;
const LOTTIE_MAX_MS = 1200;

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
    const timer = window.setTimeout(() => finish(false), 8000);

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

function createLottiePlayer() {
  const player = document.createElement('dotlottie-player');
  player.className = 'lp-welcome__lottie';
  player.setAttribute('src', IDLE_LOTTIE_SRC);
  player.setAttribute('autoplay', '');
  player.setAttribute('loop', '');
  player.setAttribute('mode', 'normal');
  player.setAttribute('background', 'transparent');
  return player;
}

function playLottie(player) {
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

function mountMagnifierFallback(welcome) {
  const media = welcome.querySelector('.lp-welcome__icon-media');
  if (media) media.innerHTML = MAGNIFIER_SVG;
}

/** Inject Lottie only after the custom element is defined (avoids upgrade bugs). */
async function mountWelcomeLottie(welcome) {
  const media = welcome.querySelector('.lp-welcome__icon-media');
  if (!media || !welcome.isConnected) return;

  const ok = await loadDotLottie();
  if (!ok || !welcome.isConnected) {
    mountMagnifierFallback(welcome);
    return;
  }

  media.replaceChildren(createLottiePlayer());
  const player = media.querySelector('dotlottie-player');
  if (!player) return;

  const start = () => playLottie(player);
  if (player.dotLottie) {
    start();
    return;
  }

  player.addEventListener('ready', start, { once: true });
  window.setTimeout(start, 500);
}

function buildWelcomeOverlay() {
  const el = document.createElement('div');
  el.id = 'lp-welcome';
  el.className = 'lp-welcome is-entering';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('aria-label', 'Welcome to APTSpace');
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
            <h1 class="lp-welcome__brand" aria-label="APTSpace">
              <span class="lp-welcome__apts">APTS</span><span class="lp-welcome__pace">pace</span>
            </h1>
          </div>
          <div class="lp-welcome__icon-track" aria-hidden="true">
            <div class="lp-welcome__icon">
              <span class="lp-welcome__icon-glow"></span>
              <span class="lp-welcome__icon-media"></span>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  return el;
}

/**
 * Kick off welcome visuals during the preloader wipe (seamless handoff).
 * @returns {HTMLElement | null}
 */
export function beginLandingWelcomeHandoff() {
  if (prefersReducedMotion()) return null;

  const welcome = document.getElementById('lp-welcome') || mountLandingWelcome();
  if (!welcome) return null;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      welcome.classList.remove('is-entering');
    });
  });

  void mountWelcomeLottie(welcome);
  return welcome;
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
  document.body.classList.add('lp-welcome-active', 'lp-page-hidden');
  return welcome;
}

/**
 * @returns {Promise<void>}
 */
export async function runLandingWelcome() {
  if (prefersReducedMotion()) return;

  const welcome = document.getElementById('lp-welcome') || mountLandingWelcome();
  if (!welcome) return;

  if (welcome.classList.contains('is-entering')) {
    await new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          welcome.classList.remove('is-entering');
          resolve();
        });
      });
    });
  }

  await Promise.race([mountWelcomeLottie(welcome), delay(LOTTIE_MAX_MS)]);
  await delay(WELCOME_MS);

  const exit = prefersReducedMotion() ? 100 : EXIT_MS;
  welcome.classList.add('is-exiting');
  await delay(exit);

  welcome.remove();
  document.body.classList.remove('lp-welcome-active');
}
