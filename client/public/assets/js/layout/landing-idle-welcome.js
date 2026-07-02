/**
 * Landing page guest idle welcome — self-contained (no splash-idle.js import).
 * Same visual as the guest portal screensaver magnifier scene.
 */

const IDLE_LOTTIE_SRC = '/assets/animations/idle-magnifier-animation.lottie';
const DOTLOTTIE_CDN = 'https://cdn.jsdelivr.net/npm/@dotlottie/player-component@2.7.12/dist/dotlottie-player.mjs';
const SHOW_MS = 4500;
const SLIDE_MS = 8000;

const FACILITY_IMAGES = [
  'https://images.unsplash.com/photo-1562774053-701939374585?auto=format&fit=crop&w=1920&q=80',
  'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&w=1400&q=80',
  'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1438032455732-1033d28535fd?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1200&q=80',
];

let slideTimer = null;
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

    const timer = window.setTimeout(() => finish(false), 6000);

    const onReady = () => finish(!!customElements.get('dotlottie-player'));

    if (document.querySelector('script[data-apt-dotlottie]')) {
      customElements.whenDefined('dotlottie-player').then(() => onReady()).catch(() => finish(false));
      return;
    }

    const script = document.createElement('script');
    script.type = 'module';
    script.src = DOTLOTTIE_CDN;
    script.setAttribute('data-apt-dotlottie', '1');
    script.addEventListener('load', () => {
      customElements.whenDefined('dotlottie-player').then(() => onReady()).catch(() => finish(false));
    });
    script.addEventListener('error', () => finish(false));
    document.head.appendChild(script);
  });

  return dotLottiePromise;
}

function idleSceneHtml() {
  const slides = FACILITY_IMAGES.map((url, i) =>
    `<div class="apt-idle--guest__slide${i === 0 ? ' is-active' : ''}" style="background-image:url('${url}')"></div>`,
  ).join('');

  const cards = FACILITY_IMAGES.slice(0, 4).map((url) =>
    `<div class="apt-idle--guest__card" style="background-image:url('${url}')"></div>`,
  ).join('');

  return `
    <div class="apt-idle--guest__slides">${slides}</div>
    <div class="apt-idle--guest__vignette" aria-hidden="true"></div>
    <div class="apt-idle--guest__cards">${cards}</div>
    <div class="apt-idle--guest__message">
      <div class="apt-idle--guest__lottie-wrap" role="img" aria-label="AptSpace mascot">
        <dotlottie-player
          class="apt-idle--guest__lottie"
          src="${IDLE_LOTTIE_SRC}"
          autoplay
          loop
          mode="normal"
          background="transparent"
        ></dotlottie-player>
      </div>
      <h2>Welcome to AptSpace – Tap to explore.</h2>
    </div>`;
}

function buildOverlay() {
  const el = document.createElement('div');
  el.id = 'apt-landing-idle';
  el.className = 'apt-overlay apt-idle apt-idle--guest apt-landing-idle';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('aria-label', 'Welcome to AptSpace');
  el.innerHTML = idleSceneHtml();
  return el;
}

function startSlideshow(overlay) {
  if (slideTimer) clearInterval(slideTimer);
  const slides = [...overlay.querySelectorAll('.apt-idle--guest__slide')];
  if (slides.length < 2 || prefersReducedMotion()) return;

  let index = 0;
  slideTimer = window.setInterval(() => {
    slides[index]?.classList.remove('is-active');
    index = (index + 1) % slides.length;
    slides[index]?.classList.add('is-active');
  }, SLIDE_MS);
}

function stopSlideshow() {
  if (slideTimer) {
    clearInterval(slideTimer);
    slideTimer = null;
  }
}

function playLottie(overlay) {
  const player = overlay?.querySelector('dotlottie-player');
  if (!player) return;
  requestAnimationFrame(() => {
    try {
      if (typeof player.play === 'function') player.play();
    } catch {
      /* ignore */
    }
  });
}

function dismissOverlay(overlay) {
  if (!overlay) return;
  overlay.classList.add('is-hidden');
  overlay.setAttribute('aria-hidden', 'true');
  window.setTimeout(() => overlay.remove(), 500);
}

/**
 * Show the guest idle magnifier scene, then dismiss.
 * @returns {Promise<void>}
 */
export async function runLandingIdleWelcome() {
  if (prefersReducedMotion()) return;

  document.getElementById('apt-landing-idle')?.remove();
  stopSlideshow();

  FACILITY_IMAGES.forEach((url) => {
    const img = new Image();
    img.src = url;
  });

  const overlay = buildOverlay();
  document.body.appendChild(overlay);
  document.body.classList.add('lp-page-hidden');

  startSlideshow(overlay);
  loadDotLottie().then((ok) => { if (ok) playLottie(overlay); });

  await delay(SHOW_MS);

  stopSlideshow();
  dismissOverlay(overlay);
  document.body.classList.remove('lp-page-hidden');
}
