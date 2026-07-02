/**
 * Landing page boot — preloader, guest idle welcome, then page init.
 */

const FAILSAFE_MS = 16000;

function clearLandingBlockers() {
  document.body.classList.remove('lp-preloader-active', 'lp-page-hidden');
  document.getElementById('lp-preloader')?.remove();
  document.getElementById('apt-landing-idle')?.remove();
}

async function boot() {
  const failsafe = window.setTimeout(clearLandingBlockers, FAILSAFE_MS);

  try {
    const { runLandingPreloader } = await import('/assets/js/layout/landing-preloader.js');
    await runLandingPreloader();
  } catch (err) {
    console.error('[landing] preloader failed:', err);
    clearLandingBlockers();
  }

  try {
    const { runLandingIdleWelcome } = await import('/assets/js/layout/landing-idle-welcome.js');
    await runLandingIdleWelcome();
  } catch (err) {
    console.error('[landing] idle welcome failed:', err);
    document.body.classList.remove('lp-page-hidden');
    document.getElementById('apt-landing-idle')?.remove();
  }

  window.clearTimeout(failsafe);
  clearLandingBlockers();

  try {
    const { initLandingPage } = await import('/assets/js/layout/landing.js');
    const { redirectIfLoggedIn } = await import('/assets/js/services/auth.js');
    redirectIfLoggedIn().catch(() => {});
    await initLandingPage();
  } catch (err) {
    console.error('[landing] page init failed:', err);
    clearLandingBlockers();
  }
}

boot();
