/**
 * AptSpace landing page — GSAP entrance + scroll animations
 */

const GSAP_URL = 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js';
const ST_URL   = 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js';

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
  if (window.gsap?.registerPlugin && window.ScrollTrigger) {
    window.gsap.registerPlugin(window.ScrollTrigger);
  }
  return window.gsap;
}

/** Ensure all content is visible if GSAP fails or is skipped */
function revealStatic() {
  document.querySelectorAll('.lp-trust-item').forEach((el) => {
    el.style.opacity = '1';
    el.style.transform = 'none';
  });
  document.querySelector('.lp-nav')?.style.removeProperty('visibility');
  document.querySelector('.lp-nav')?.style.removeProperty('opacity');
  document.querySelectorAll('.lp-login-btn').forEach((el) => {
    el.style.visibility = 'visible';
    el.style.opacity = '1';
  });
  if (window.gsap) {
    window.gsap.set('.lp-hero-badge, .lp-hero-line, .lp-hero-sub, .lp-hero-cta > *, .lp-stat, .lp-hero-visual, .lp-hero-mobile-visual, .lp-hero-float, .lp-scroll-hint', {
      clearProps: 'all',
    });
  }
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

function initLandingSearch() {
  const inputs = [
    document.getElementById('landing-search'),
    document.getElementById('landing-search-mobile'),
  ].filter(Boolean);

  if (!inputs.length) return;

  const cards = () => document.querySelectorAll('.lp-facility-card');
  const emptyEl = document.getElementById('lp-facilities-empty');
  const gridEl = document.querySelector('.lp-facilities-grid');

  const applyFilter = (query) => {
    const q = query.trim().toLowerCase();
    let visible = 0;
    cards().forEach((card) => {
      const hay = `${card.dataset.facilityName || ''} ${card.textContent}`.toLowerCase();
      const match = !q || hay.includes(q);
      card.classList.toggle('hidden', !match);
      card.style.removeProperty('opacity');
      if (match) visible += 1;
    });
    const noResults = Boolean(q) && visible === 0;
    emptyEl?.classList.toggle('hidden', !noResults);
    gridEl?.classList.toggle('hidden', noResults);
  };

  const syncAndFilter = (value, source) => {
    inputs.forEach((el) => {
      if (el !== source) el.value = value;
    });
    applyFilter(value);
  };

  inputs.forEach((input) => {
    input.addEventListener('input', () => syncAndFilter(input.value, input));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('facilities')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        syncAndFilter(input.value, input);
        document.getElementById('lp-mobile-menu')?.classList.add('hidden');
      }
    });
  });
}

export function initNavScroll(nav) {
  if (!nav) return;
  const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 24);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

function initSmoothAnchors() {
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const id = link.getAttribute('href');
      if (!id || id === '#') return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
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

export async function initLandingPage() {
  initSmoothAnchors();
  initNavScroll(document.querySelector('.lp-nav'));
  initMobileMenu();
  initLandingSearch();

  document.querySelectorAll('.lp-facility-card img').forEach((img) => {
    img.addEventListener('error', () => {
      img.style.display = 'none';
    }, { once: true });
  });

  if (prefersReducedMotion()) {
    revealStatic();
    return;
  }

  // Safety net — never leave hero/nav invisible if GSAP stalls or CDN is blocked.
  window.setTimeout(revealStatic, 4500);

  let gsap;
  try {
    gsap = await loadGsapWithScrollTrigger();
  } catch {
    revealStatic();
    return;
  }

  const ST = window.ScrollTrigger;

  /* Hero — never hide the nav (Safari loses Log In if autoAlpha sticks on header) */
  const heroTl = gsap.timeline({
    defaults: { ease: 'power3.out' },
    onComplete: () => {
      gsap.set('.lp-login-btn, .lp-nav, .lp-nav-actions', { clearProps: 'visibility,opacity,transform' });
    },
  });

  heroTl
    .from('.lp-nav-inner', { y: -16, duration: 0.45 })
    .from('.lp-hero-badge', { y: 20, autoAlpha: 0, duration: 0.5 }, '-=0.2')
    .from('.lp-hero-line', { y: 48, autoAlpha: 0, stagger: 0.12, duration: 0.75 }, '-=0.15')
    .from('.lp-hero-sub', { y: 24, autoAlpha: 0, duration: 0.55 }, '-=0.35')
    .from('.lp-hero-cta > *', { y: 20, autoAlpha: 0, stagger: 0.1, duration: 0.5 }, '-=0.25')
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
    .from('.lp-scroll-hint', { y: -8, autoAlpha: 0, duration: 0.4 }, '-=0.2');

  animateCounters(gsap);

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

  document.querySelectorAll('.lp-facility-card').forEach((card) => {
    card.addEventListener('mouseenter', () => {
      gsap.to(card, { y: -6, duration: 0.35, ease: 'power2.out' });
    });
    card.addEventListener('mouseleave', () => {
      gsap.to(card, { y: 0, duration: 0.45, ease: 'power2.out' });
    });
  });

  gsap.from('.lp-step-card', {
    y: 40,
    autoAlpha: 0,
    stagger: 0.15,
    duration: 0.65,
    ease: 'power3.out',
    scrollTrigger: { trigger: '.lp-steps', start: 'top 82%' },
  });

  gsap.utils.toArray('.lp-step-card').forEach((card) => {
    ST?.create({
      trigger: card,
      start: 'top 88%',
      onEnter: () => card.classList.add('is-active'),
    });
  });

  gsap.from('.lp-audience-card', {
    y: 32,
    autoAlpha: 0,
    stagger: 0.08,
    duration: 0.6,
    ease: 'power2.out',
    scrollTrigger: { trigger: '.lp-audience', start: 'top 85%' },
  });

  gsap.from('.lp-cta-band', {
    y: 40,
    autoAlpha: 0,
    duration: 0.7,
    ease: 'power3.out',
    scrollTrigger: { trigger: '.lp-cta-band', start: 'top 88%' },
  });

  gsap.from('.lp-contact-card', {
    x: (i) => (i % 2 === 0 ? -24 : 24),
    autoAlpha: 0,
    stagger: 0.12,
    duration: 0.65,
    ease: 'power2.out',
    scrollTrigger: { trigger: '.lp-contact', start: 'top 85%' },
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

  ST?.refresh();
}
