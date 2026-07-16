/**
 * Landing welcome after the greeting preloader.
 * Preloader → clean APTS mark lockup → landing page.
 */

const FAVICON_SRC = '/assets/logo/apts-favicon.svg';
const WELCOME_MS = 2200;
const EXIT_MS = 480;

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function buildWelcomeOverlay() {
  const el = document.createElement('div');
  el.id = 'lp-welcome';
  el.className = 'lp-welcome is-entering';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('aria-label', 'Welcome to APTS — A Place to Stay');
  el.innerHTML = `
    <div class="lp-welcome__bg-grid" aria-hidden="true"></div>
    <div class="lp-welcome__bg-smoke" aria-hidden="true">
      <span class="lp-welcome__smoke lp-welcome__smoke--a"></span>
      <span class="lp-welcome__smoke lp-welcome__smoke--b"></span>
    </div>
    <div class="lp-welcome__vignette" aria-hidden="true"></div>
    <div class="lp-welcome__inner">
      <div class="lp-welcome__stage">
            <p class="lp-welcome__title-line">Welcome to</p>
        <div class="lp-welcome__mark-wrap">
          <span class="lp-welcome__mark-shine" aria-hidden="true"></span>
          <img
            class="lp-welcome__mark"
            src="${FAVICON_SRC}"
            alt=""
            width="120"
            height="120"
            decoding="async"
            aria-hidden="true"
          />
        </div>
        <p class="lp-welcome__wordmark">APTS</p>
        <p class="lp-welcome__tagline">A Place To Stay</p>
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

  return welcome;
}

/** Preload favicon during the greeting preloader. */
export function preloadWelcomeAssets() {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = FAVICON_SRC;
  });
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

  await delay(WELCOME_MS);

  const exit = prefersReducedMotion() ? 100 : EXIT_MS;
  welcome.classList.add('is-exiting');
  await delay(exit);

  welcome.remove();
  document.body.classList.remove('lp-welcome-active');
}
