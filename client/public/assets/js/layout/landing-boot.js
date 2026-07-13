/**
 * Landing page boot — preloader, welcome, then page init.
 */

const FAILSAFE_MS = 10000;

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function clearLandingBlockers() {
  document.body.classList.remove('lp-preloader-active', 'lp-page-hidden', 'lp-welcome-active');
  document.body.classList.add('lp-ready');
  document.getElementById('lp-preloader')?.remove();
  document.getElementById('lp-welcome')?.remove();
  document.getElementById('apt-landing-idle')?.remove();
}

function waitForIdleDismiss(idle) {
  if (!idle || idle.classList.contains('is-hidden')) return Promise.resolve();

  return new Promise((resolve) => {
    const done = () => {
      observer.disconnect();
      resolve();
    };
    const observer = new MutationObserver(() => {
      if (idle.classList.contains('is-hidden')) done();
    });
    observer.observe(idle, { attributes: true, attributeFilter: ['class'] });
  });
}

async function revealLandingPage(startHeroHandoff) {
  document.body.classList.remove('lp-page-hidden');
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  if (typeof startHeroHandoff === 'function') {
    startHeroHandoff();
  }
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

async function boot() {
  const params = new URLSearchParams(window.location.search);
  const previewIdle = params.has('previewIdle') || params.get('idle') === 'preview';

  try {
    const { mountPublicLandingContent } = await import('/assets/js/layout/landing-content.js');
    await mountPublicLandingContent();
  } catch (err) {
    console.error('[landing] content mount failed:', err);
  }

  if (previewIdle) {
    document.getElementById('lp-preloader')?.remove();
    document.getElementById('lp-welcome')?.remove();
    document.body.classList.add('lp-page-hidden');

    const { showAptIdlePreview } = await import('/assets/js/layout/splash-idle.js');
    const idle = await showAptIdlePreview({ portal: 'guest' });
    await waitForIdleDismiss(idle);

    document.body.classList.remove('lp-preloader-active');
    document.body.classList.add('lp-ready');

    try {
      const { initLandingPage } = await import('/assets/js/layout/landing.js?v=scrollrestore1');
      const { redirectIfLoggedIn } = await import('/assets/js/services/auth.js');
      redirectIfLoggedIn().catch(() => {});
      const startHeroHandoff = await initLandingPage({ skipHeroEntrance: true });
      await revealLandingPage(startHeroHandoff);
    } catch (err) {
      console.error('[landing] page init failed:', err);
      document.body.classList.remove('lp-page-hidden');
    }
    return;
  }

  const failsafe = window.setTimeout(clearLandingBlockers, FAILSAFE_MS);
  const reduced = prefersReducedMotion();

  if (!reduced) {
    document.body.classList.add('lp-page-hidden');
  }

  const welcomeModPromise = import('/assets/js/layout/landing-welcome.js');

  try {
    const [{ runLandingPreloader }, welcomeMod] = await Promise.all([
      import('/assets/js/layout/landing-preloader.js'),
      welcomeModPromise,
    ]);

    welcomeMod.preloadWelcomeAssets?.();

    await runLandingPreloader({
      onBeforeExit: () => {
        if (!reduced) welcomeMod.beginLandingWelcomeHandoff?.();
      },
    });
  } catch (err) {
    console.error('[landing] preloader failed:', err);
    clearLandingBlockers();
  }

  try {
    const welcomeMod = await welcomeModPromise;
    if (!reduced) {
      await welcomeMod.runLandingWelcome();
    }
  } catch (err) {
    console.error('[landing] welcome failed:', err);
    document.getElementById('lp-welcome')?.remove();
    document.body.classList.remove('lp-welcome-active');
  }

  window.clearTimeout(failsafe);

  document.body.classList.remove('lp-preloader-active', 'lp-welcome-active');
  document.getElementById('lp-preloader')?.remove();
  document.body.classList.add('lp-ready');

  try {
    const { initLandingPage } = await import('/assets/js/layout/landing.js?v=scrollrestore1');
    const { redirectIfLoggedIn } = await import('/assets/js/services/auth.js');
    redirectIfLoggedIn().catch(() => {});
    const startHeroHandoff = await initLandingPage({ skipHeroEntrance: true });
    await revealLandingPage(startHeroHandoff);
  } catch (err) {
    console.error('[landing] page init failed:', err);
    document.body.classList.remove('lp-page-hidden');
  }
}

boot();
