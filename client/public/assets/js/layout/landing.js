/**
 * APTSpace landing page — GSAP entrance + scroll animations
 */

const GSAP_URL = 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js';
const ST_URL   = 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js';
const SCROLLTO_URL = 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollToPlugin.min.js';

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const HERO_TYPE_PHRASES = [
  'GMC rooms',
  'conference halls',
  'chapel & gardens',
  'recreation spaces',
  'group ministry stays',
];

function initHeroTypewriter() {
  const el = document.getElementById('lp-hero-typed');
  const cursor = document.querySelector('.lp-hero-type-cursor');
  if (!el) return () => {};

  if (prefersReducedMotion()) {
    el.textContent = 'GMC rooms, conference halls, chapel & gardens, recreation spaces, and group ministry stays.';
    cursor?.classList.add('hidden');
    return () => {};
  }

  let phraseIndex = 0;
  let charIndex = 0;
  let deleting = false;
  let timerId = 0;

  const schedule = (fn, ms) => {
    timerId = window.setTimeout(fn, ms);
  };

  const tick = () => {
    const current = HERO_TYPE_PHRASES[phraseIndex];

    if (!deleting) {
      charIndex += 1;
      const complete = charIndex >= current.length;
      el.textContent = `${current.slice(0, charIndex)}${complete ? '.' : ''}`;
      if (complete) {
        schedule(() => {
          deleting = true;
          tick();
        }, 2400);
        return;
      }
      schedule(tick, 42 + Math.random() * 40);
      return;
    }

    charIndex -= 1;
    el.textContent = current.slice(0, charIndex);
    if (charIndex <= 0) {
      deleting = false;
      phraseIndex = (phraseIndex + 1) % HERO_TYPE_PHRASES.length;
      schedule(tick, 520);
      return;
    }
    schedule(tick, 26);
  };

  schedule(tick, 1100);

  return () => window.clearTimeout(timerId);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

async function loadGsapWithScrollTrigger() {
  await loadScript(GSAP_URL);
  await loadScript(ST_URL);
  await loadScript(SCROLLTO_URL);
  if (window.gsap?.registerPlugin) {
    window.gsap.registerPlugin(window.ScrollTrigger, window.ScrollToPlugin);
  }
  if (window.ScrollTrigger?.config) {
    window.ScrollTrigger.config({ limitCallbacks: true });
  }
  return window.gsap;
}

/** Ensure all content is visible if GSAP fails or is skipped */
function revealStatic() {
  if (!document.body.classList.contains('lp-ready')) return;

  document.querySelectorAll('.lp-trust-item').forEach((el) => {
    el.style.opacity = '1';
    el.style.transform = 'none';
  });
  document.querySelectorAll('.lp-login-btn').forEach((el) => {
    el.style.visibility = 'visible';
    el.style.opacity = '1';
  });
  if (window.gsap) {
    window.gsap.set('.lp-hero-badge, .lp-hero-line, .lp-hero-rule, .lp-hero-sub, .lp-hero-cta > *, .lp-hero-tags > *, .lp-stat, .lp-scroll-hint', {
      clearProps: 'all',
    });
  }
  document.querySelectorAll('.lp-scroll-char').forEach((el) => {
    el.style.removeProperty('transform');
  });
}

export function initMobileMenu() {
  const toggle = document.getElementById('lp-menu-toggle');
  const menu   = document.getElementById('lp-mobile-menu');
  if (!toggle || !menu) return;

  const setOpen = (open) => {
    menu.classList.toggle('hidden', !open);
    menu.setAttribute('aria-hidden', open ? 'false' : 'true');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.querySelector('.material-symbols-outlined').textContent = open ? 'close' : 'menu';
    if (open) {
      document.querySelector('.lp-nav')?.classList.add('lp-nav-is-visible');
      document.body.classList.add('lp-nav-revealed');
    }
  };

  toggle.addEventListener('click', () => setOpen(menu.classList.contains('hidden')));

  document.addEventListener('click', (e) => {
    if (menu.classList.contains('hidden')) return;
    if (menu.contains(e.target) || toggle.contains(e.target)) return;
    setOpen(false);
  });

  menu.querySelectorAll('a, button[data-action="logout"]').forEach((link) => {
    link.addEventListener('click', () => setOpen(false));
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(false);
  });
}

export function initNavScroll(nav) {
  if (!nav) return;

  let lastScrolled = nav.classList.contains('is-scrolled');
  let ticking = false;

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(() => {
      const scrolled = window.scrollY > 12;
      if (scrolled !== lastScrolled) {
        nav.classList.toggle('is-scrolled', scrolled);
        lastScrolled = scrolled;
      }
      ticking = false;
    });
  };

  nav.classList.add('lp-nav-is-visible');
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

function initNavSpy() {
  const sectionIds = ['hero', 'explore', 'facilities', 'contact'];
  const links = document.querySelectorAll('[data-nav-section]');
  const scroller = document.querySelector('.lp-section-scroller');
  if (!links.length) return;

  let sectionTops = [];

  const measureSections = () => {
    sectionTops = sectionIds.map((id) => {
      const el = document.getElementById(id);
      return el ? el.offsetTop : 0;
    });
  };

  const setActive = (id) => {
    if (!sectionIds.includes(id)) return;
    links.forEach((link) => {
      const section = link.dataset.navSection;
      const isScrollerItem = link.classList.contains('lp-section-scroller-item');
      const match = isScrollerItem
        ? section === id
        : section === (id === 'explore' ? 'hero' : id);
      link.classList.toggle('is-active', match);
    });
    scroller?.classList.toggle('is-on-light', id === 'facilities' || id === 'contact');
  };

  const resolveSection = () => {
    const marker = window.scrollY + window.innerHeight * 0.38;
    let current = sectionIds[0];

    sectionIds.forEach((id, i) => {
      if (sectionTops[i] <= marker) current = id;
    });

    if (window.scrollY < 48) current = 'hero';
    setActive(current);
  };

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(() => {
      resolveSection();
      ticking = false;
    });
  };

  const scheduleMeasure = () => {
    if (document.body.classList.contains('lp-page-hidden')) {
      requestAnimationFrame(scheduleMeasure);
      return;
    }
    measureSections();
    resolveSection();
  };

  scheduleMeasure();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => {
    measureSections();
    onScroll();
  }, { passive: true });
  window.addEventListener('load', () => {
    measureSections();
    resolveSection();
  }, { once: true });

  const scrollSection = document.querySelector('.lp-scroll-section');
  if (scrollSection) {
    const layoutObserver = new MutationObserver(() => {
      if (!scrollSection.classList.contains('is-ready')) return;
      layoutObserver.disconnect();
      requestAnimationFrame(() => {
        measureSections();
        resolveSection();
      });
    });
    layoutObserver.observe(scrollSection, { attributes: true, attributeFilter: ['class'] });
  }

  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', () => {
      const id = link.getAttribute('href')?.slice(1);
      if (id && sectionIds.includes(id)) {
        window.setTimeout(() => setActive(id), 80);
      }
    });
  });

  window.__lpRemeasureNav = () => {
    measureSections();
    resolveSection();
  };
}

function getScrollShowcaseTrigger() {
  const section = document.getElementById('explore');
  if (!section || !window.ScrollTrigger?.getAll) return null;
  return window.ScrollTrigger.getAll().find(
    (t) => t.trigger === section || t.trigger?.id === 'explore',
  ) || null;
}

function initSmoothAnchors() {
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const id = link.getAttribute('href');
      if (!id || id === '#') return;
      if (id === '#hero') {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'auto' });
        return;
      }
      if (id === '#explore') {
        e.preventDefault();
        const st = getScrollShowcaseTrigger();
        if (st) {
          window.scrollTo({ top: Math.max(0, Math.round(st.start) + 2), behavior: 'auto' });
        } else {
          const target = document.getElementById('explore');
          if (target) target.scrollIntoView({ behavior: 'auto', block: 'start' });
        }
        return;
      }
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'auto', block: 'start' });
    });
  });
}

function splitScrollTextLine(line) {
  if (line.dataset.split === '1') return [];

  const chars = [];
  const text = line.textContent;
  line.textContent = '';
  [...text].forEach((char) => {
    const span = document.createElement('span');
    const isSpace = char === ' ' || char === '\u00A0';
    span.className = `lp-scroll-char${isSpace ? ' lp-scroll-char--space' : ''}`;
    span.textContent = isSpace ? '\u00A0' : char;
    if (isSpace) span.setAttribute('aria-hidden', 'true');
    line.appendChild(span);
    chars.push(span);
  });

  const centerIndex = Math.floor(chars.length / 2);
  chars.forEach((span, index) => {
    span.dataset.distance = String(index - centerIndex);
  });

  line.dataset.split = '1';
  return chars;
}

function splitScrollTextLines(container) {
  if (container.dataset.split === '1') return;

  container.querySelectorAll('[data-scroll-line]').forEach((line) => {
    splitScrollTextLine(line);
  });

  container.dataset.split = '1';
}

function setPhraseVisible(phrase, visible) {
  phrase.el.classList.toggle('is-visible', visible);
  phrase.el.style.pointerEvents = visible ? 'auto' : 'none';
}

function setSlidesStatic(phraseData, bgImages, index, hint) {
  phraseData.forEach((phrase, i) => {
    const on = i === index;
    phrase.el.style.opacity = on ? '1' : '0';
    setPhraseVisible(phrase, on);
  });
  bgImages.forEach((img, i) => {
    img.style.opacity = i === index ? '1' : '0';
  });
  if (hint) hint.style.opacity = index === 0 ? '1' : '0';
}

async function preloadScrollShowcaseImages(section) {
  const imgs = [...section.querySelectorAll('.lp-scroll-bg-img')];
  await Promise.all(imgs.map((img) => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise((resolve) => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
    });
  }));
}

function initScrollShowcase(gsap, ScrollTrigger) {
  const section = document.querySelector('.lp-scroll-section');
  const pin = section?.querySelector('.lp-scroll-pin');
  if (!section || !pin) return;

  const hint = pin.querySelector('.lp-scroll-text-hint');
  const phrases = [...pin.querySelectorAll('.lp-scroll-phrase')];
  const bgImages = [...pin.querySelectorAll('.lp-scroll-bg-img')];
  const rails = pin.querySelectorAll('.lp-scroll-rail');
  const count = phrases.length;
  if (!count) return;

  const phraseData = phrases.map((phraseEl) => {
    const line = phraseEl.querySelector('[data-scroll-line]');
    if (line) splitScrollTextLine(line);
    return { el: phraseEl };
  });

  section.classList.remove('is-pending-init');

  if (prefersReducedMotion() || !ScrollTrigger || !gsap) {
    setSlidesStatic(phraseData, bgImages, 0, hint);
    if (hint) hint.style.display = 'none';
    section.classList.add('is-ready');
    return;
  }

  // Wheel-locked stepper: ScrollTrigger only pins. Native snap is disabled —
  // free scroll + snap was causing skips, killed fades, and clunky races.
  const BG_DUR = 0.45;
  const SCROLL_DUR = 0.55;
  const LOCK_DUR = Math.max(BG_DUR, SCROLL_DUR) + 0.05;
  const WHEEL_THRESHOLD = 12;
  const TOUCH_THRESHOLD = 36;

  let currentIndex = 0;
  let bgTween = null;
  let scrollTween = null;
  let locked = false;
  let unlockTimer = 0;
  let ignoreInputUntil = 0;
  let touchStartY = null;
  let showcaseActive = false;

  function setSnapActive(active) {
    showcaseActive = active;
    document.body.classList.toggle('lp-scroll-snap-active', active);
    document.documentElement.classList.toggle('lp-scroll-snap-active', active);
    pin.style.willChange = active ? 'transform' : '';
    const heroBg = document.querySelector('.lp-hero-bg');
    if (heroBg && gsap && active) {
      gsap.set(heroBg, { clearProps: 'transform,yPercent' });
    }
  }

  function snapProgressForIndex(index) {
    if (count <= 1) return 0;
    return index / (count - 1);
  }

  function scrollYForIndex(index) {
    if (count <= 1) return st.start;
    const progress = snapProgressForIndex(index);
    return st.start + progress * (st.end - st.start);
  }

  function applySlideVisuals(idx, prev, animate) {
    const dur = animate && prev !== idx ? BG_DUR : 0;

    phraseData.forEach((phrase, i) => {
      const on = i === idx;
      gsap.set(phrase.el, {
        xPercent: -50,
        yPercent: -50,
        y: 0,
        scale: 1,
      });
      if (dur > 0) {
        gsap.to(phrase.el, {
          opacity: on ? 1 : 0,
          duration: dur,
          ease: 'power2.out',
          overwrite: true,
        });
      } else {
        gsap.set(phrase.el, { opacity: on ? 1 : 0 });
      }
      setPhraseVisible(phrase, on);
    });

    if (hint) {
      if (dur > 0) {
        gsap.to(hint, {
          opacity: idx === 0 ? 1 : 0,
          duration: dur * 0.8,
          ease: 'power2.out',
          overwrite: true,
        });
      } else {
        gsap.set(hint, { opacity: idx === 0 ? 1 : 0 });
      }
    }
    rails.forEach((rail) => {
      rail.style.opacity = '0.55';
    });

    bgTween?.kill();
    bgTween = null;

    if (dur <= 0) {
      section.classList.remove('is-transitioning');
      bgImages.forEach((img, i) => {
        gsap.set(img, { opacity: i === idx ? 1 : 0 });
      });
      return;
    }

    section.classList.add('is-transitioning');
    bgTween = gsap.timeline({
      onComplete: () => {
        bgTween = null;
        section.classList.remove('is-transitioning');
      },
    });

    bgImages.forEach((img, i) => {
      if (i === idx) {
        bgTween.to(img, { opacity: 1, duration: BG_DUR, ease: 'power2.out' }, 0);
      } else if (i === prev) {
        bgTween.to(img, { opacity: 0, duration: BG_DUR * 0.85, ease: 'power2.in' }, 0);
      } else {
        gsap.set(img, { opacity: 0 });
      }
    });
  }

  function releaseLock() {
    locked = false;
    window.clearTimeout(unlockTimer);
    unlockTimer = 0;
    // Swallow leftover trackpad inertia so it cannot immediately step again.
    ignoreInputUntil = performance.now() + 180;
  }

  function armLock() {
    locked = true;
    window.clearTimeout(unlockTimer);
    unlockTimer = window.setTimeout(releaseLock, LOCK_DUR * 1000);
  }

  function inputBlocked() {
    return locked || performance.now() < ignoreInputUntil;
  }

  /**
   * Single entry for slide changes. While locked, new input is ignored so
   * fast wheel bursts cannot skip or kill the in-flight crossfade.
   */
  function goToSlide(index, { animate = true, force = false } = {}) {
    const idx = Math.min(count - 1, Math.max(0, index));
    if (!force && inputBlocked()) return false;
    if (idx === currentIndex && animate) return false;

    const prev = currentIndex;
    currentIndex = idx;

    if (animate && prev !== idx) armLock();
    applySlideVisuals(idx, prev, animate);

    // st may still be null while ScrollTrigger.create() is running (onRefresh/
    // onEnter fire synchronously). Never read st before assignment — that was
    // a TDZ ReferenceError that aborted init and broke the whole landing page.
    if (!st) return true;

    const y = scrollYForIndex(idx);
    scrollTween?.kill();
    if (animate && prev !== idx) {
      scrollTween = gsap.to(window, {
        scrollTo: { y, autoKill: false },
        duration: SCROLL_DUR,
        ease: 'power2.inOut',
        overwrite: true,
        onComplete: () => {
          scrollTween = null;
          ScrollTrigger.update();
        },
      });
    } else if (animate) {
      window.scrollTo(0, y);
      scrollTween = null;
    }
    return true;
  }

  applySlideVisuals(0, -1, false);

  // Use let (not const) so create-time callbacks can safely see st === null
  // instead of throwing "Cannot access 'st' before initialization".
  let st = null;
  st = ScrollTrigger.create({
    trigger: section,
    start: 'top top',
    end: () => `+=${Math.round(window.innerHeight * Math.max(count - 1, 1))}`,
    pin,
    pinSpacing: true,
    pinReparent: false,
    anticipatePin: 1,
    invalidateOnRefresh: true,
    // No ScrollTrigger.snap — it races native wheel and interrupts fades.
    onToggle: (self) => setSnapActive(self.isActive),
    onEnter() {
      // Visuals only — do not window.scrollTo here (fights pin/refresh).
      currentIndex = 0;
      applySlideVisuals(0, -1, false);
    },
    onEnterBack() {
      currentIndex = count - 1;
      applySlideVisuals(count - 1, -1, false);
    },
    onRefresh() {
      // Never scrollTo during refresh — that collapses pin spacing / hides
      // sections below. Just keep the current slide visuals in sync.
      applySlideVisuals(currentIndex, currentIndex, false);
    },
    onLeave: () => {
      bgTween?.kill();
      bgTween = null;
      scrollTween?.kill();
      scrollTween = null;
      releaseLock();
      section.classList.remove('is-transitioning');
      setSnapActive(false);
    },
    onLeaveBack: () => {
      bgTween?.kill();
      bgTween = null;
      scrollTween?.kill();
      scrollTween = null;
      releaseLock();
      section.classList.remove('is-transitioning');
      setSnapActive(false);
    },
  });

  if (st.isActive) setSnapActive(true);

  function step(direction) {
    if (!showcaseActive) return false;
    const next = currentIndex + direction;
    if (next < 0 || next > count - 1) return false;
    return goToSlide(next, { animate: true });
  }

  function onWheel(e) {
    if (!showcaseActive) return;

    const goingDown = e.deltaY > 0;
    const atLast = currentIndex >= count - 1;
    const atFirst = currentIndex <= 0;

    // At edges, allow native scroll to leave the pinned section.
    if (!locked) {
      if (goingDown && atLast) return;
      if (!goingDown && atFirst) return;
    }

    // Consume wheel inside the showcase (and while locked) so progress cannot
    // jump multiple snap points ahead of the visual transition.
    e.preventDefault();
    if (inputBlocked()) return;
    if (Math.abs(e.deltaY) < WHEEL_THRESHOLD) return;

    step(goingDown ? 1 : -1);
  }

  function onTouchStart(e) {
    if (!showcaseActive || !e.touches[0]) return;
    touchStartY = e.touches[0].clientY;
  }

  function onTouchMove(e) {
    if (!showcaseActive || touchStartY == null || !e.touches[0]) return;

    const dy = touchStartY - e.touches[0].clientY;
    if (Math.abs(dy) < TOUCH_THRESHOLD) return;

    const goingDown = dy > 0;
    const atLast = currentIndex >= count - 1;
    const atFirst = currentIndex <= 0;

    if (!locked) {
      if (goingDown && atLast) return;
      if (!goingDown && atFirst) return;
    }

    e.preventDefault();
    if (inputBlocked()) return;

    touchStartY = null;
    step(goingDown ? 1 : -1);
  }

  function onTouchEnd() {
    touchStartY = null;
  }

  function onKeyDown(e) {
    if (!showcaseActive || inputBlocked()) return;
    if (e.key === 'ArrowDown' || e.key === 'PageDown') {
      if (currentIndex >= count - 1) return;
      e.preventDefault();
      step(1);
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      if (currentIndex <= 0) return;
      e.preventDefault();
      step(-1);
    }
  }

  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('touchend', onTouchEnd, { passive: true });
  window.addEventListener('keydown', onKeyDown);

  section.classList.add('is-ready');

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      scheduleScrollRefresh(ScrollTrigger);
      if (st.isActive) {
        goToSlide(currentIndex, { animate: false, force: true });
      }
    }, 200);
  }, { passive: true });

  return st;
}

function setCountersStatic() {
  document.querySelectorAll('[data-count]').forEach((el) => {
    const raw = el.dataset.count;
    if (raw === 'live') return;
    const target = Number(raw);
    if (Number.isNaN(target)) return;
    el.textContent = `${target}${el.dataset.suffix || ''}`;
  });
}

/** Lighter hero reveal after preloader/welcome — visuals + copy, not a full replay. */
function prepareHeroHandoff(gsap) {
  gsap.set('.lp-hero-badge, .lp-hero-line, .lp-hero-sub, .lp-hero-cta > *, .lp-hero-tags > *, .lp-stat', {
    autoAlpha: 0,
    y: 18,
  });
  gsap.set('.lp-hero-rule', { scaleX: 0, transformOrigin: 'left center' });
  gsap.set('.lp-scroll-hint', { autoAlpha: 0, y: -6 });
  gsap.set('.lp-hero-bg', { scale: 1.05, transformOrigin: 'center center' });
}

function playHeroHandoff(gsap) {
  const tl = gsap.timeline({
    defaults: { ease: 'power2.out' },
    onComplete: () => {
      gsap.set('.lp-login-btn, .lp-nav-actions, .lp-hero-bg', { clearProps: 'visibility,opacity,transform,scale,clipPath' });
      gsap.set('.lp-hero-rule', { clearProps: 'transform' });
    },
  });

  tl.to('.lp-hero-bg', { scale: 1, duration: 1.05, ease: 'power1.out' }, 0)
    .to('.lp-hero-badge', { autoAlpha: 1, y: 0, duration: 0.48 }, '-=0.82')
    .to('.lp-hero-line', { autoAlpha: 1, y: 0, stagger: 0.07, duration: 0.52 }, '-=0.38')
    .to('.lp-hero-rule', { scaleX: 1, duration: 0.38, ease: 'power2.out' }, '-=0.42')
    .to('.lp-hero-sub', { autoAlpha: 1, y: 0, duration: 0.42 }, '-=0.3')
    .to('.lp-hero-cta > *', { autoAlpha: 1, y: 0, stagger: 0.06, duration: 0.38 }, '-=0.28')
    .to('.lp-hero-tags > *', { autoAlpha: 1, y: 0, stagger: 0.05, duration: 0.34 }, '-=0.24')
    .to('.lp-stat', { autoAlpha: 1, y: 0, stagger: 0.06, duration: 0.4 }, '-=0.22')
    .to('.lp-scroll-hint', { autoAlpha: 0.45, y: 0, duration: 0.32 }, '-=0.25');

  return tl;
}

function animateCountersHandoff(gsap) {
  document.querySelectorAll('[data-count]').forEach((el) => {
    const raw = el.dataset.count;
    if (raw === 'live') return;
    const target = Number(raw);
    if (Number.isNaN(target)) return;
    const suffix = el.dataset.suffix || '';
    const obj = { val: 0 };
    let lastShown = -1;
    gsap.to(obj, {
      val: target,
      duration: 1.1,
      delay: 0.35,
      ease: 'power2.out',
      onUpdate: () => {
        const next = Math.round(obj.val);
        if (next !== lastShown) {
          lastShown = next;
          el.textContent = `${next}${suffix}`;
        }
      },
    });
  });
}

let landingPageInitialized = false;
let scrollShowcaseMounted = false;

function mountScrollShowcase(gsap, ScrollTrigger) {
  if (scrollShowcaseMounted) return;
  scrollShowcaseMounted = true;
  const section = document.querySelector('.lp-scroll-section');
  if (!section) return;
  preloadScrollShowcaseImages(section).then(() => {
    initScrollShowcase(gsap, ScrollTrigger);
    scheduleScrollRefresh(ScrollTrigger);
    window.__lpRemeasureNav?.();
  }).catch((err) => {
    console.error('[landing] scroll showcase failed to init', err);
    section.classList.remove('is-pending-init');
    section.classList.add('is-ready');
  });
}

let scrollRefreshTimer = 0;

function scheduleScrollRefresh(ScrollTrigger) {
  if (!ScrollTrigger) return;
  window.clearTimeout(scrollRefreshTimer);
  scrollRefreshTimer = window.setTimeout(() => {
    ScrollTrigger.refresh();
    window.__lpRemeasureNav?.();
  }, 120);
}

function initMagneticButtons(gsap) {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  document.querySelectorAll('.lp-magnetic').forEach((btn) => {
    let pending = false;
    let lastX = 0;
    let lastY = 0;

    btn.addEventListener('mousemove', (e) => {
      const r = btn.getBoundingClientRect();
      lastX = (e.clientX - r.left - r.width / 2) * 0.12;
      lastY = (e.clientY - r.top - r.height / 2) * 0.12;
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        gsap.to(btn, { x: lastX, y: lastY, duration: 0.35, ease: 'power2.out', overwrite: 'auto' });
      });
    });
    btn.addEventListener('mouseleave', () => {
      gsap.to(btn, { x: 0, y: 0, duration: 0.5, ease: 'power2.out', overwrite: 'auto' });
    });
  });
}

function mountLandingScrollAnimations(gsap, ST) {
  const heroBg = document.querySelector('.lp-hero-bg');
  const hero = document.querySelector('.lp-hero');
  if (heroBg && ST && hero) {
    gsap.to(heroBg, {
      yPercent: 12,
      ease: 'none',
      force3D: true,
      scrollTrigger: {
        trigger: hero,
        start: 'top top',
        end: 'bottom top',
        scrub: 0.6,
        invalidateOnRefresh: true,
        onToggle: (self) => {
          hero.classList.toggle('is-parallax-active', self.isActive);
        },
      },
    });
  }

  gsap.from('.lp-trust-item', {
    y: 12,
    opacity: 0,
    stagger: 0.08,
    duration: 0.55,
    ease: 'power2.out',
    immediateRender: false,
    scrollTrigger: { trigger: '.lp-trust', start: 'top 96%', once: true },
  });

  gsap.utils.toArray('.lp-section-head').forEach((head) => {
    gsap.from(head.children, {
      y: 36,
      autoAlpha: 0,
      stagger: 0.1,
      duration: 0.7,
      ease: 'power3.out',
      scrollTrigger: { trigger: head, start: 'top 85%', once: true },
    });
  });

  gsap.from('.lp-facility-card', {
    y: 56,
    autoAlpha: 0,
    scale: 0.96,
    stagger: 0.1,
    duration: 0.75,
    ease: 'power3.out',
    scrollTrigger: { trigger: '.lp-facilities-grid', start: 'top 82%', once: true },
  });

  gsap.from('.lp-audience-card', {
    y: 32,
    autoAlpha: 0,
    stagger: 0.08,
    duration: 0.6,
    ease: 'power2.out',
    scrollTrigger: { trigger: '.lp-audience', start: 'top 85%', once: true },
  });

  gsap.from('.lp-team-head > *', {
    y: 28,
    autoAlpha: 0,
    stagger: 0.1,
    duration: 0.65,
    ease: 'power3.out',
    scrollTrigger: { trigger: '.lp-team', start: 'top 85%', once: true },
  });

  gsap.from('.lp-team-card', {
    y: 36,
    autoAlpha: 0,
    stagger: 0.1,
    duration: 0.6,
    ease: 'power2.out',
    scrollTrigger: { trigger: '.lp-team-grid', start: 'top 86%', once: true },
  });

  gsap.from('.lp-cta-band', {
    y: 40,
    autoAlpha: 0,
    duration: 0.7,
    ease: 'power3.out',
    scrollTrigger: { trigger: '.lp-cta-band', start: 'top 88%', once: true },
  });

  gsap.from('.lp-contact-card', {
    y: 24,
    autoAlpha: 0,
    stagger: 0.1,
    duration: 0.6,
    ease: 'power2.out',
    clearProps: 'transform,opacity,visibility',
    scrollTrigger: { trigger: '.lp-contact-cards', start: 'top 88%', once: true },
  });

  initMagneticButtons(gsap);
  mountScrollShowcase(gsap, ST);
  scheduleScrollRefresh(ST);
  if (document.fonts?.ready) {
    document.fonts.ready.then(() => scheduleScrollRefresh(ST)).catch(() => {});
  }
  window.addEventListener('load', () => scheduleScrollRefresh(ST), { once: true });
}

function buildLandingReveal(startHeroHandoff, finalize) {
  return () => {
    const heroTl = typeof startHeroHandoff === 'function' ? startHeroHandoff() : null;
    const runFinalize = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(finalize);
      });
    };

    if (heroTl?.then) {
      heroTl.then(runFinalize);
      return;
    }
    runFinalize();
  };
}

export async function initLandingPage(options = {}) {
  if (landingPageInitialized) return;
  landingPageInitialized = true;

  const { skipHeroEntrance = true } = options;
  initSmoothAnchors();
  initNavScroll(document.querySelector('.lp-nav'));
  initNavSpy();
  initMobileMenu();
  initHeroTypewriter();

  document.querySelectorAll('.lp-facility-card img').forEach((img) => {
    img.addEventListener('error', () => {
      img.style.display = 'none';
    }, { once: true });
  });

  if (prefersReducedMotion()) {
    return buildLandingReveal(null, () => {
      mountScrollShowcase(null, null);
      setCountersStatic();
      revealStatic();
    });
  }

  let revealTimer = null;
  if (!skipHeroEntrance) {
    revealTimer = window.setTimeout(revealStatic, 4500);
  }

  let gsap;
  try {
    gsap = await loadGsapWithScrollTrigger();
  } catch {
    return buildLandingReveal(null, () => {
      mountScrollShowcase(null, null);
      revealStatic();
    });
  }

  const ST = window.ScrollTrigger;

  let startHeroHandoff = null;

  prepareHeroHandoff(gsap);
  startHeroHandoff = () => {
    animateCountersHandoff(gsap);
    return playHeroHandoff(gsap);
  };

  return buildLandingReveal(startHeroHandoff, () => {
    mountLandingScrollAnimations(gsap, ST);
  });
}
