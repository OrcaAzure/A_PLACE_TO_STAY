/**
 * AptSpace landing page — GSAP entrance + scroll animations
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

function initHeroImageFallbacks() {
  const fallback = '/images/Garden.jpg';
  document.querySelectorAll('.lp-hero-visual img, .lp-hero-float img, .lp-hero-mobile-visual img').forEach((img) => {
    img.addEventListener('error', () => {
      if (img.dataset.fallbackApplied) return;
      img.dataset.fallbackApplied = '1';
      img.src = fallback;
    }, { once: true });
  });
}

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
    window.gsap.set('.lp-hero-badge, .lp-hero-line, .lp-hero-rule, .lp-hero-sub, .lp-hero-cta > *, .lp-hero-tags > *, .lp-stat, .lp-hero-visual, .lp-hero-mobile-visual, .lp-hero-float, .lp-hero-booking-card, .lp-scroll-hint', {
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

  const onScroll = () => {
    nav.classList.toggle('is-scrolled', window.scrollY > 12);
  };

  nav.classList.add('lp-nav-is-visible');
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

function initNavSpy() {
  const sectionIds = ['hero', 'facilities', 'contact'];
  const links = document.querySelectorAll('[data-nav-section]');
  const scroller = document.querySelector('.lp-section-scroller');
  if (!links.length) return;

  const setActive = (id) => {
    if (!sectionIds.includes(id)) return;
    links.forEach((link) => {
      link.classList.toggle('is-active', link.dataset.navSection === id);
    });
    scroller?.classList.toggle('is-on-light', id !== 'hero');
  };

  const resolveSection = () => {
    const marker = window.scrollY + window.innerHeight * 0.38;
    let current = sectionIds[0];

    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el && el.offsetTop <= marker) current = id;
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

  resolveSection();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });

  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', () => {
      const id = link.getAttribute('href')?.slice(1);
      if (id && sectionIds.includes(id)) {
        window.setTimeout(() => setActive(id), 80);
      }
    });
  });
}

function initSmoothAnchors() {
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const id = link.getAttribute('href');
      if (!id || id === '#') return;
      if (id === '#hero') {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

function smoothStep(t) {
  const p = Math.min(Math.max(t, 0), 1);
  return p * p * (3 - 2 * p);
}

function easeOutCubic(t) {
  const p = Math.min(Math.max(t, 0), 1);
  return 1 - (1 - p) ** 3;
}

function applyScrollCharProgress(chars, progress) {
  const p = easeOutCubic(Math.min(Math.max(progress, 0), 1));
  const spread = (1 - p) * 0.14;

  chars.forEach((charEl) => {
    const distance = Number(charEl.dataset.distance) || 0;
    const x = distance * 10 * spread;
    const opacity = 0.5 + p * 0.5;

    charEl.style.opacity = String(opacity);
    charEl.style.transform = x ? `translate3d(${x}px, 0, 0)` : 'none';
  });
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
    const chars = line ? splitScrollTextLine(line) : [];
    return { el: phraseEl, chars };
  });

  function showSlide(index, { animateChars = false } = {}) {
    const idx = Math.min(count - 1, Math.max(0, index));

    phraseData.forEach((phrase, i) => {
      const on = i === idx;
      gsap.set(phrase.el, {
        opacity: on ? 1 : 0,
        xPercent: -50,
        yPercent: -50,
        y: on ? 0 : 24,
        scale: on ? 1 : 0.96,
        pointerEvents: on ? 'auto' : 'none',
      });
      applyScrollCharProgress(phrase.chars, on ? 1 : 0);
    });

    bgImages.forEach((img, i) => {
      const on = i === idx;
      gsap.set(img, { opacity: on ? 1 : 0 });
      img.classList.toggle('is-active', on);
    });

    if (hint) hint.style.opacity = idx === 0 ? '1' : '0';
    rails.forEach((rail) => {
      rail.style.opacity = '0.55';
    });

    if (animateChars && phraseData[idx]?.chars.length) {
      applyScrollCharProgress(phraseData[idx].chars, 0);
      const proxy = { p: 0 };
      gsap.to(proxy, {
        p: 1,
        duration: 0.45,
        ease: 'power2.out',
        onUpdate: () => applyScrollCharProgress(phraseData[idx].chars, proxy.p),
      });
    }

    return idx;
  }

  if (prefersReducedMotion() || !ScrollTrigger) {
    showSlide(0);
    if (hint) hint.style.display = 'none';
    return;
  }

  const SNAP_MS = 0.42;
  const WHEEL_STEP = 52;
  const WHEEL_RESET_MS = 180;
  const WHEEL_COOLDOWN_MS = 520;

  let currentIndex = 0;
  let isAnimating = false;
  let activeTween = null;
  let wheelAccum = 0;
  let wheelTimer = null;
  let lastWheelNavAt = 0;
  let scrollSyncTimer = null;

  function setSnapActive(active) {
    document.body.classList.toggle('lp-scroll-snap-active', active);
    document.documentElement.classList.toggle('lp-scroll-snap-active', active);
  }

  function snapProgressForIndex(index) {
    if (count <= 1) return 0;
    return index / (count - 1);
  }

  function progressToIndex(progress) {
    if (count <= 1) return 0;
    const steps = count - 1;
    return Math.min(steps, Math.max(0, Math.round(progress * steps)));
  }

  function crossfadeToSlide(fromIdx, toIdx, { light = false } = {}) {
    const dur = light ? SNAP_MS * 0.85 : SNAP_MS;
    const tl = gsap.timeline();

    if (fromIdx !== toIdx && bgImages[fromIdx]) {
      tl.to(bgImages[fromIdx], { opacity: 0, duration: dur * 0.4, ease: 'power1.in' }, 0);
    }
    if (bgImages[toIdx]) {
      tl.fromTo(bgImages[toIdx],
        { opacity: 0 },
        { opacity: 1, duration: dur * 0.55, ease: 'power1.out' },
        dur * 0.08);
      bgImages.forEach((img, i) => img.classList.toggle('is-active', i === toIdx));
    }

    phraseData.forEach((phrase, i) => {
      const on = i === toIdx;
      if (light) {
        gsap.set(phrase.el, {
          opacity: on ? 1 : 0,
          xPercent: -50,
          yPercent: -50,
          y: 0,
          scale: 1,
          pointerEvents: on ? 'auto' : 'none',
        });
        if (on) applyScrollCharProgress(phrase.chars, 1);
        return;
      }

      if (i === fromIdx && fromIdx !== toIdx) {
        tl.to(phrase.el, { opacity: 0, y: -12, duration: dur * 0.3, ease: 'power1.in' }, 0);
      }
    });

    if (!light) {
      const incoming = phraseData[toIdx];
      if (incoming) {
        gsap.set(incoming.el, { opacity: 0, xPercent: -50, yPercent: -50, y: 20, scale: 0.98 });
        tl.to(incoming.el, { opacity: 1, y: 0, scale: 1, duration: dur * 0.5, ease: 'power2.out' }, dur * 0.12);
        tl.call(() => applyScrollCharProgress(incoming.chars, 1), null, dur * 0.2);
      }
    }

    if (hint) tl.to(hint, { opacity: toIdx === 0 ? 1 : 0, duration: 0.15 }, 0);
    return tl;
  }

  function scrollYForIndex(index) {
    if (count <= 1) return st.start;
    const progress = snapProgressForIndex(index);
    return st.start + progress * (st.end - st.start);
  }

  function scheduleScrollSync() {
    if (scrollSyncTimer) return;
    scrollSyncTimer = window.setTimeout(() => {
      scrollSyncTimer = null;
      if (!st.isActive || isAnimating) return;
      if (Date.now() - lastWheelNavAt < WHEEL_COOLDOWN_MS) return;
      const idx = progressToIndex(st.progress);
      const y = scrollYForIndex(idx);
      if (idx !== currentIndex) {
        crossfadeToSlide(currentIndex, idx, { light: true });
        currentIndex = idx;
      }
      if (Math.abs(window.scrollY - y) > 6) {
        gsap.to(window, {
          scrollTo: { y, autoKill: false },
          duration: 0.22,
          ease: 'power2.out',
          overwrite: true,
        });
      }
    }, 140);
  }

  function normalizeWheelDelta(e) {
    let delta = e.deltaY;
    if (e.deltaMode === 1) delta *= 16;
    else if (e.deltaMode === 2) delta *= window.innerHeight;
    return delta;
  }

  function resetWheelAccum() {
    wheelAccum = 0;
    if (wheelTimer) {
      window.clearTimeout(wheelTimer);
      wheelTimer = null;
    }
  }

  function scheduleWheelReset() {
    if (wheelTimer) window.clearTimeout(wheelTimer);
    wheelTimer = window.setTimeout(resetWheelAccum, WHEEL_RESET_MS);
  }

  function applySlideVisuals(index, { animateChars = false } = {}) {
    currentIndex = showSlide(index, { animateChars });
    return currentIndex;
  }

  function goToSlide(nextIndex, { fromWheel = false } = {}) {
    if (nextIndex < 0 || nextIndex >= count || isAnimating) return false;
    if (nextIndex === currentIndex) return true;

    if (fromWheel && Date.now() - lastWheelNavAt < WHEEL_COOLDOWN_MS) return false;

    activeTween?.kill();
    isAnimating = true;
    resetWheelAccum();

    const fromIdx = currentIndex;
    const targetY = scrollYForIndex(nextIndex);
    const light = fromWheel;

    activeTween = gsap.timeline({
      onComplete: () => {
        applySlideVisuals(nextIndex);
        isAnimating = false;
        activeTween = null;
        const y = scrollYForIndex(nextIndex);
        if (Math.abs(window.scrollY - y) > 2) {
          window.scrollTo(0, y);
        }
        ScrollTrigger.update();
      },
    });

    activeTween.add(crossfadeToSlide(fromIdx, nextIndex, { light }), 0);
    activeTween.to(window, {
      scrollTo: { y: targetY, autoKill: false },
      duration: light ? SNAP_MS * 0.9 : SNAP_MS,
      ease: 'power2.inOut',
      overwrite: true,
    }, 0);

    currentIndex = nextIndex;
    if (fromWheel) lastWheelNavAt = Date.now();
    return true;
  }

  const st = ScrollTrigger.create({
    trigger: section,
    start: 'top top',
    end: () => `+=${Math.round(window.innerHeight * Math.max(count - 1, 1) + 24)}`,
    pin,
    pinSpacing: true,
    pinReparent: false,
    anticipatePin: 0,
    invalidateOnRefresh: true,
    fastScrollEnd: false,
    onToggle: (self) => setSnapActive(self.isActive),
    onEnter(self) {
      resetWheelAccum();
      if (!isAnimating) {
        applySlideVisuals(progressToIndex(self.progress));
      }
    },
    onEnterBack(self) {
      resetWheelAccum();
      if (!isAnimating) {
        applySlideVisuals(progressToIndex(self.progress));
      }
    },
    onUpdate() {
      scheduleScrollSync();
    },
    onLeave: () => {
      activeTween?.kill();
      isAnimating = false;
      resetWheelAccum();
      setSnapActive(false);
    },
    onLeaveBack: () => {
      activeTween?.kill();
      isAnimating = false;
      resetWheelAccum();
      setSnapActive(false);
    },
  });

  function onWheel(e) {
    if (!st.isActive) return;

    const delta = normalizeWheelDelta(e);
    if (!delta) return;

    const goingDown = delta > 0;
    const atLast = currentIndex >= count - 1;
    const atFirst = currentIndex <= 0;

    if (isAnimating) {
      e.preventDefault();
      return;
    }

    // Let native scroll leave the section at first/last slide
    if (goingDown && atLast) return;
    if (!goingDown && atFirst) return;

    e.preventDefault();
    wheelAccum += delta;
    scheduleWheelReset();
    if (Math.abs(wheelAccum) < WHEEL_STEP) return;

    const direction = wheelAccum > 0 ? 1 : -1;
    resetWheelAccum();
    goToSlide(currentIndex + direction, { fromWheel: true });
  }

  let touchStartY = 0;
  let touchStartX = 0;

  function onTouchStart(e) {
    if (!st.isActive) return;
    touchStartY = e.touches[0].clientY;
    touchStartX = e.touches[0].clientX;
  }

  function onTouchEnd(e) {
    if (!st.isActive || isAnimating) return;
    const dy = touchStartY - e.changedTouches[0].clientY;
    const dx = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(dy) < 44 || Math.abs(dy) < Math.abs(dx)) return;

    if (dy > 0 && currentIndex < count - 1) goToSlide(currentIndex + 1, { fromWheel: true });
    else if (dy < 0 && currentIndex > 0) goToSlide(currentIndex - 1, { fromWheel: true });
  }

  function onKeyDown(e) {
    if (!st.isActive || isAnimating) return;
    if (e.key === 'ArrowDown' || e.key === 'PageDown') {
      if (currentIndex >= count - 1) return;
      e.preventDefault();
      goToSlide(currentIndex + 1, { fromWheel: true });
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      if (currentIndex <= 0) return;
      e.preventDefault();
      goToSlide(currentIndex - 1, { fromWheel: true });
    }
  }

  window.addEventListener('wheel', onWheel, { passive: false, capture: true });
  pin.addEventListener('touchstart', onTouchStart, { passive: true });
  pin.addEventListener('touchend', onTouchEnd, { passive: true });
  window.addEventListener('keydown', onKeyDown);

  applySlideVisuals(0);

  window.addEventListener('resize', () => {
    ScrollTrigger.refresh();
    if (st.isActive && !isAnimating) {
      const y = scrollYForIndex(currentIndex);
      if (Math.abs(window.scrollY - y) > 4) {
        window.scrollTo(0, y);
      }
    }
  }, { passive: true });

  return st;
}

function animateCounters(gsap) {
  document.querySelectorAll('[data-count]').forEach((el) => {
    const raw = el.dataset.count;
    if (raw === 'live') return;
    const target = Number(raw);
    if (Number.isNaN(target)) return;
    const suffix = el.dataset.suffix || '';
    const obj = { val: 0 };
    gsap.to(obj, {
      val: target,
      duration: 1.4,
      delay: 0.65,
      ease: 'power2.out',
      onUpdate: () => { el.textContent = `${Math.round(obj.val)}${suffix}`; },
    });
  });
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
  gsap.set('.lp-hero-visual', {
    autoAlpha: 0,
    scale: 1.06,
    clipPath: 'inset(14% 0% 0% 0%)',
  });
  gsap.set('.lp-hero-float', { autoAlpha: 0, scale: 0.9, y: 14 });
  gsap.set('.lp-hero-booking-card', { autoAlpha: 0, y: 18 });
  gsap.set('.lp-hero-mobile-visual', { autoAlpha: 0, y: 16 });
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
    .to('.lp-hero-visual', {
      autoAlpha: 1,
      scale: 1,
      clipPath: 'inset(0% 0% 0% 0%)',
      duration: 0.9,
      ease: 'power3.out',
    }, '-=0.72')
    .to('.lp-hero-float', {
      autoAlpha: 1,
      scale: 1,
      y: 0,
      stagger: 0.11,
      duration: 0.52,
      ease: 'back.out(1.15)',
    }, '-=0.58')
    .to('.lp-hero-booking-card', { autoAlpha: 1, y: 0, duration: 0.45, ease: 'power2.out' }, '-=0.42')
    .to('.lp-hero-mobile-visual', { autoAlpha: 1, y: 0, duration: 0.45 }, '-=0.55')
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
    gsap.to(obj, {
      val: target,
      duration: 1.1,
      delay: 0.35,
      ease: 'power2.out',
      onUpdate: () => { el.textContent = `${Math.round(obj.val)}${suffix}`; },
    });
  });
}

let landingPageInitialized = false;
let scrollShowcaseMounted = false;

function mountScrollShowcase(gsap, ScrollTrigger) {
  if (scrollShowcaseMounted) return;
  scrollShowcaseMounted = true;
  initScrollShowcase(gsap, ScrollTrigger);
  requestAnimationFrame(() => {
    ScrollTrigger?.refresh(true);
    window.addEventListener('load', () => ScrollTrigger?.refresh(true), { once: true });
  });
}

function buildLandingReveal(startHeroHandoff, finalize) {
  return () => {
    if (typeof startHeroHandoff === 'function') startHeroHandoff();
    requestAnimationFrame(() => {
      requestAnimationFrame(finalize);
    });
  };
}

export async function initLandingPage(options = {}) {
  if (landingPageInitialized) return;
  landingPageInitialized = true;

  const { skipHeroEntrance = false } = options;
  initSmoothAnchors();
  initNavScroll(document.querySelector('.lp-nav'));
  initNavSpy();
  initMobileMenu();
  initHeroTypewriter();
  initHeroImageFallbacks();

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

  if (skipHeroEntrance) {
    prepareHeroHandoff(gsap);
    startHeroHandoff = () => {
      animateCountersHandoff(gsap);
      return playHeroHandoff(gsap);
    };
  } else {
    /* Hero — nav stays hidden until the user scrolls */
    const heroTl = gsap.timeline({
      defaults: { ease: 'power3.out' },
      onComplete: () => {
        if (revealTimer) window.clearTimeout(revealTimer);
        gsap.set('.lp-login-btn, .lp-nav-actions', { clearProps: 'visibility,opacity,transform' });
      },
    });

    heroTl
      .from('.lp-hero-badge', { y: 20, autoAlpha: 0, duration: 0.5 })
      .from('.lp-hero-line', { y: 48, autoAlpha: 0, stagger: 0.12, duration: 0.75 }, '-=0.15')
      .from('.lp-hero-rule', { scaleX: 0, transformOrigin: 'left center', duration: 0.45, ease: 'power2.out' }, '-=0.45')
      .from('.lp-hero-sub', { y: 24, autoAlpha: 0, duration: 0.55 }, '-=0.35')
      .from('.lp-hero-cta > *', { y: 20, autoAlpha: 0, stagger: 0.1, duration: 0.5 }, '-=0.25')
      .from('.lp-hero-tags > *', { y: 14, autoAlpha: 0, stagger: 0.07, duration: 0.4 }, '-=0.3')
      .from('.lp-stat', { y: 28, autoAlpha: 0, stagger: 0.08, duration: 0.55 }, '-=0.2')
      .from('.lp-hero-mobile-visual', { y: 20, autoAlpha: 0, duration: 0.55 }, '-=0.35')
      .from('.lp-hero-visual', {
        autoAlpha: 0,
        clipPath: 'inset(100% 0% 0% 0%)',
        scale: 1.08,
        duration: 1.1,
        ease: 'power4.out',
      }, '-=0.85')
      .from('.lp-hero-float', { scale: 0.8, autoAlpha: 0, stagger: 0.15, duration: 0.6, ease: 'back.out(1.4)' }, '-=0.5')
      .from('.lp-hero-booking-card', { y: 20, autoAlpha: 0, duration: 0.55, ease: 'power2.out' }, '-=0.35')
      .from('.lp-scroll-hint', { y: -8, autoAlpha: 0, duration: 0.4 }, '-=0.2');

    animateCounters(gsap);
  }

  const heroBg = document.querySelector('.lp-hero-bg');
  if (heroBg && ST) {
    gsap.to(heroBg, {
      yPercent: 18,
      ease: 'none',
      scrollTrigger: {
        trigger: '.lp-hero',
        start: 'top top',
        end: 'bottom top',
        scrub: true,
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
    scrollTrigger: { trigger: '.lp-trust', start: 'top 96%' },
  });

  gsap.utils.toArray('.lp-section-head').forEach((head) => {
    gsap.from(head.children, {
      y: 36,
      autoAlpha: 0,
      stagger: 0.1,
      duration: 0.7,
      ease: 'power3.out',
      scrollTrigger: { trigger: head, start: 'top 85%' },
    });
  });

  gsap.from('.lp-facility-card', {
    y: 56,
    autoAlpha: 0,
    scale: 0.96,
    stagger: 0.1,
    duration: 0.75,
    ease: 'power3.out',
    scrollTrigger: { trigger: '.lp-facilities-grid', start: 'top 82%' },
  });

  gsap.from('.lp-audience-card', {
    y: 32,
    autoAlpha: 0,
    stagger: 0.08,
    duration: 0.6,
    ease: 'power2.out',
    scrollTrigger: { trigger: '.lp-audience', start: 'top 85%' },
  });

  gsap.from('.lp-team-head > *', {
    y: 28,
    autoAlpha: 0,
    stagger: 0.1,
    duration: 0.65,
    ease: 'power3.out',
    scrollTrigger: { trigger: '.lp-team', start: 'top 85%' },
  });

  gsap.from('.lp-team-card', {
    y: 36,
    autoAlpha: 0,
    stagger: 0.1,
    duration: 0.6,
    ease: 'power2.out',
    scrollTrigger: { trigger: '.lp-team-grid', start: 'top 86%' },
  });

  gsap.from('.lp-cta-band', {
    y: 40,
    autoAlpha: 0,
    duration: 0.7,
    ease: 'power3.out',
    scrollTrigger: { trigger: '.lp-cta-band', start: 'top 88%' },
  });

  gsap.from('.lp-contact-card', {
    y: 24,
    autoAlpha: 0,
    stagger: 0.1,
    duration: 0.6,
    ease: 'power2.out',
    clearProps: 'transform,opacity,visibility',
    scrollTrigger: { trigger: '.lp-contact-cards', start: 'top 88%' },
  });

  document.querySelectorAll('.lp-magnetic').forEach((btn) => {
    btn.addEventListener('mousemove', (e) => {
      const r = btn.getBoundingClientRect();
      const x = (e.clientX - r.left - r.width / 2) * 0.12;
      const y = (e.clientY - r.top - r.height / 2) * 0.12;
      gsap.to(btn, { x, y, duration: 0.35, ease: 'power2.out' });
    });
    btn.addEventListener('mouseleave', () => {
      gsap.to(btn, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1, 0.5)' });
    });
  });

  return buildLandingReveal(startHeroHandoff, () => {
    mountScrollShowcase(gsap, ST);
  });
}
