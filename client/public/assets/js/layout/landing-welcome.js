/**
 * Simple landing welcome after the greeting preloader.
 * Preloader → "Welcome to AptSpace" → landing page.
 */

const IDLE_LOTTIE_SRC = '/assets/animations/idle-magnifier-animation.lottie';
const DOTLOTTIE_CDN = 'https://cdn.jsdelivr.net/npm/@dotlottie/player-component@2.7.12/dist/dotlottie-player.mjs';
const WELCOME_MS = 2200;
const EXIT_MS = 360;

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

/** Preload Lottie during the greeting preloader. */
export function preloadWelcomeAssets() {
  return loadDotLottie();
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

function buildWelcomeOverlay(useLottie) {
  const lottie = useLottie
    ? `<dotlottie-player
        class="lp-welcome__lottie"
        src="${IDLE_LOTTIE_SRC}"
        autoplay
        loop
        mode="normal"
        background="transparent"
      ></dotlottie-player>`
    : `<span class="lp-welcome__mark material-symbols-outlined" aria-hidden="true">apartment</span>`;

  const el = document.createElement('div');
  el.id = 'lp-welcome';
  el.className = 'lp-welcome is-entering';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('aria-label', 'Welcome to AptSpace');
  el.innerHTML = `
    <div class="lp-welcome__inner">
      <div class="lp-welcome__mascot" role="img" aria-label="AptSpace">${lottie}</div>
      <h1 class="lp-welcome__title">Welcome to AptSpace</h1>
    </div>`;
  return el;
}

/**
 * Mount welcome overlay synchronously (used during preloader handoff).
 * @returns {HTMLElement | null}
 */
export function mountLandingWelcome() {
  if (prefersReducedMotion()) return null;

  document.getElementById('lp-welcome')?.remove();

  const welcome = buildWelcomeOverlay(true);
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
      const mascot = welcome.querySelector('.lp-welcome__mascot');
      if (mascot) {
        mascot.innerHTML = '<span class="lp-welcome__mark material-symbols-outlined" aria-hidden="true">apartment</span>';
      }
      return;
    }
    const existing = welcome.querySelector('dotlottie-player');
    if (!existing) {
      welcome.querySelector('.lp-welcome__mascot')?.insertAdjacentHTML('afterbegin', `
        <dotlottie-player class="lp-welcome__lottie" src="${IDLE_LOTTIE_SRC}" autoplay loop mode="normal" background="transparent"></dotlottie-player>`);
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
