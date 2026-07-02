/**
 * Landing page preloader:
 * 1) Greetings on white (no circle)
 * 2) Circle rises to wipe the screen
 * 3) Fade out to the landing page
 */

const GREETING_MS = 3000;
const CYCLE_MS = 360;
const WORD_FADE_MS = 300;
const WIPE_MS = 920;
const EXIT_FADE_MS = 480;

const GREETINGS = [
  'Hello',
  'Kumusta',
  '你好',
  'Hola',
  'Ciao',
  'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ',
  'Namaste',
  'Welcome',
];

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function removePreloader(el) {
  el?.remove();
  document.body.classList.remove('lp-preloader-active');
}

function playWipeAndExit(el, onDone) {
  if (!el) {
    onDone();
    return;
  }

  const reduced = prefersReducedMotion();
  const wordFade = reduced ? 80 : WORD_FADE_MS;
  const wipe = reduced ? 200 : WIPE_MS;
  const exitFade = reduced ? 120 : EXIT_FADE_MS;

  const wordEl = document.getElementById('lp-preloader-word');
  wordEl?.classList.add('is-out');

  window.setTimeout(() => {
    el.classList.add('is-wiping');
    void el.offsetHeight;

    window.setTimeout(() => {
      el.classList.add('is-exiting');

      window.setTimeout(() => {
        removePreloader(el);
        onDone();
      }, exitFade);
    }, wipe);
  }, wordFade);
}

/**
 * @returns {Promise<void>}
 */
export function runLandingPreloader() {
  return new Promise((resolve) => {
    const el = document.getElementById('lp-preloader');
    const wordEl = document.getElementById('lp-preloader-word');

    if (!el || !wordEl) {
      resolve();
      return;
    }

    if (prefersReducedMotion()) {
      removePreloader(el);
      resolve();
      return;
    }

    document.body.classList.add('lp-preloader-active');

    let index = 0;
    wordEl.textContent = GREETINGS[0];

    const cycle = () => {
      if (index >= GREETINGS.length - 1) return;
      wordEl.classList.add('is-out');
      window.setTimeout(() => {
        index += 1;
        wordEl.textContent = GREETINGS[index];
        wordEl.classList.remove('is-out');
        wordEl.classList.add('is-in');
        window.setTimeout(() => wordEl.classList.remove('is-in'), 320);
      }, 220);
    };

    const intervalId = window.setInterval(cycle, CYCLE_MS);
    window.setTimeout(() => {
      window.clearInterval(intervalId);
      playWipeAndExit(el, resolve);
    }, GREETING_MS);
  });
}
