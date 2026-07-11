/**
 * Landing page preloader:
 * 1) Greetings on white (no circle)
 * 2) Namaste → Welcome finale with proper holds
 * 3) Circle wipe into APTSpace welcome screen
 */

const CYCLE_MS = 420;
const NAMASTE_HOLD_MS = 620;
const WELCOME_HOLD_MS = 880;
const WORD_FADE_MS = 300;
const WORD_IN_MS = 360;
const WIPE_MS = 720;
const EXIT_FADE_MS = 420;
const WIPE_EXIT_OVERLAP_MS = 240;

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

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function removePreloader(el) {
  el?.remove();
  document.body.classList.remove('lp-preloader-active');
}

function waitForCircleWipe(el, fallbackMs) {
  return new Promise((resolve) => {
    const circle = el?.querySelector('.lp-preloader-circle');
    if (!circle) {
      resolve();
      return;
    }

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      circle.removeEventListener('transitionend', onEnd);
      window.clearTimeout(timer);
      resolve();
    };

    const onEnd = (event) => {
      if (event.target === circle && event.propertyName === 'transform') finish();
    };

    const timer = window.setTimeout(finish, fallbackMs + 80);
    circle.addEventListener('transitionend', onEnd);
  });
}

async function fadeWordTo(wordEl, text) {
  if (!wordEl) return;
  wordEl.classList.add('is-out');
  await delay(WORD_FADE_MS);
  wordEl.textContent = text;
  wordEl.classList.remove('is-out');
  wordEl.classList.add('is-in');
  await delay(WORD_IN_MS);
  wordEl.classList.remove('is-in');
}

async function playWipeAndExit(el, { onBeforeExit } = {}) {
  if (!el) return;

  const reduced = prefersReducedMotion();
  const wordFade = reduced ? 60 : WORD_FADE_MS;
  const wipe = reduced ? 180 : WIPE_MS;
  const exitFade = reduced ? 100 : EXIT_FADE_MS;
  const overlap = reduced ? 60 : WIPE_EXIT_OVERLAP_MS;

  const wordEl = document.getElementById('lp-preloader-word');
  wordEl?.classList.add('is-out');

  await delay(wordFade);

  el.classList.add('is-wiping');
  void el.offsetHeight;

  onBeforeExit?.();

  const wipeDone = waitForCircleWipe(el, wipe);
  await delay(Math.max(0, wipe - overlap));

  el.classList.add('is-exiting');

  await wipeDone;
  await delay(exitFade);

  removePreloader(el);
}

function setGreetingDuration(el) {
  if (!el) return;
  const estimated =
    (GREETINGS.length - 2) * CYCLE_MS +
    NAMASTE_HOLD_MS +
    WORD_FADE_MS +
    WORD_IN_MS +
    WELCOME_HOLD_MS +
    WIPE_MS;
  el.style.setProperty('--lp-preloader-greet-ms', `${estimated}ms`);
}

/**
 * @param {{ onBeforeExit?: () => void }} [options]
 * @returns {Promise<void>}
 */
export function runLandingPreloader({ onBeforeExit } = {}) {
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

    setGreetingDuration(el);
    document.body.classList.add('lp-preloader-active');

    let index = 0;
    let intervalId = null;
    let finaleStarted = false;

    wordEl.textContent = GREETINGS[0];

    const runFinale = async () => {
      if (finaleStarted) return;
      finaleStarted = true;
      window.clearInterval(intervalId);

      wordEl.classList.remove('is-out', 'is-in');
      await delay(NAMASTE_HOLD_MS);
      await fadeWordTo(wordEl, GREETINGS[GREETINGS.length - 1]);
      await delay(WELCOME_HOLD_MS);
      await playWipeAndExit(el, { onBeforeExit });
      resolve();
    };

    const cycle = () => {
      if (index >= GREETINGS.length - 2) return;

      wordEl.classList.add('is-out');

      window.setTimeout(() => {
        index += 1;
        wordEl.textContent = GREETINGS[index];
        wordEl.classList.remove('is-out');
        wordEl.classList.add('is-in');
        window.setTimeout(() => wordEl.classList.remove('is-in'), WORD_IN_MS);

        if (index === GREETINGS.length - 2) {
          runFinale();
        }
      }, WORD_FADE_MS);
    };

    intervalId = window.setInterval(cycle, CYCLE_MS);
  });
}
