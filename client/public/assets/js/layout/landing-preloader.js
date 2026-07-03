/**

 * Landing page preloader:

 * 1) Greetings on white (no circle)

 * 2) Circle rises to wipe the screen

 * 3) Fade out — then "Welcome to AptSpace" — then landing page

 */



const GREETING_MS = 2400;
const WELCOME_HOLD_MS = 280;
const CYCLE_MS = 300;
const WORD_FADE_MS = 220;
const WIPE_MS = 680;
const EXIT_FADE_MS = 320;
const WIPE_EXIT_OVERLAP_MS = 200;



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

  const wipeDone = waitForCircleWipe(el, wipe);
  await delay(Math.max(0, wipe - overlap));

  onBeforeExit?.();

  el.classList.add('is-exiting');

  await wipeDone;
  await delay(exitFade);

  removePreloader(el);
}



function setGreetingDuration(el) {

  if (!el) return;

  el.style.setProperty('--lp-preloader-greet-ms', `${GREETING_MS + WELCOME_HOLD_MS}ms`);

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

    wordEl.textContent = GREETINGS[0];



    const cycle = () => {

      if (index >= GREETINGS.length - 1) return;



      wordEl.classList.add('is-out');

      window.setTimeout(() => {

        index += 1;

        wordEl.textContent = GREETINGS[index];

        wordEl.classList.remove('is-out');

        wordEl.classList.add('is-in');

        window.setTimeout(() => wordEl.classList.remove('is-in'), 280);

      }, 200);

    };



    const intervalId = window.setInterval(cycle, CYCLE_MS);



    window.setTimeout(async () => {

      window.clearInterval(intervalId);



      index = GREETINGS.length - 1;

      wordEl.textContent = GREETINGS[index];

      wordEl.classList.remove('is-out', 'is-in');



      await delay(WELCOME_HOLD_MS);
      await playWipeAndExit(el, { onBeforeExit });
      resolve();
    }, GREETING_MS);

  });

}


