/**
 * Composes public + guest landing main content from shared HTML partials.
 */

import { LANDING_AMENITY_IMAGE } from '/assets/js/features/facility-display.js';

const PARTIALS = {
  heroPublic: '/components/landing-hero-public.html',
  heroGuest: '/components/landing-hero-guest.html',
  sections: '/components/landing-sections.html',
};

const AMENITY_TOKENS = {
  GARDEN_IMG: LANDING_AMENITY_IMAGE.garden,
  PRAYER_TOWER_IMG: LANDING_AMENITY_IMAGE.prayerTower,
  PRAYER_MOUNTAIN_IMG: LANDING_AMENITY_IMAGE.prayerMountain,
  RECREATION_IMG: LANDING_AMENITY_IMAGE.recreation,
  CHAPEL_GARDEN_IMG: LANDING_AMENITY_IMAGE.prayerTower,
};

const VARIANT_TOKENS = {
  public: {
    ...AMENITY_TOKENS,
    FACILITIES_INTRO: 'Lodging at the Global Missions Center plus campus venues — bookable after you sign in.',
    LINK_GMC: '/login.html',
    GMC_IMG: '/images/PrayerTowerPreview.webp',
    GMC_ALT: 'GMC room interior',
    GMC_TITLE: 'Rooms',
    LINK_CONF: '/login.html',
    LINK_CHAPEL: '/login.html',
    LINK_PRAYER: '/login.html',
    LINK_SPORTS: '/login.html',
    CTA_SUBTITLE: 'Sign in to request GMC lodging or a campus venue — availability updates in real time.',
    CTA_HREF: '/login.html',
    CTA_LABEL: 'Get started now',
    CTA_BTN_CLASS_SUFFIX: '',
  },
  guest: {
    ...AMENITY_TOKENS,
    FACILITIES_INTRO: 'Every bookable space on the APTS campus — from overnight stays to function rooms and outdoor venues.',
    LINK_GMC: '/guest/facilities.html?category=guest-houses',
    GMC_IMG: '/images/RoomsPreview.webp',
    GMC_ALT: 'GMC guest houses',
    GMC_TITLE: 'Guest Houses',
    LINK_CONF: '/guest/facilities.html?category=conference-classrooms',
    LINK_CHAPEL: '/guest/facilities.html?category=chapel-garden',
    LINK_PRAYER: '/guest/facilities.html?category=prayer-mountain',
    LINK_SPORTS: '/guest/facilities.html?category=sports-rec',
    CTA_SUBTITLE: 'Browse GMC lodging or a campus venue — availability updates in real time.',
    CTA_HREF: '/guest/facilities.html?category=guest-houses',
    CTA_LABEL: 'Start booking',
    CTA_BTN_CLASS_SUFFIX: ' js-requires-write',
  },
};

/** @type {Map<string, Promise<string>>} */
const partialCache = new Map();

async function fetchPartial(url) {
  if (!partialCache.has(url)) {
    partialCache.set(url, (async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to load ${url}`);
      return res.text();
    })());
  }
  return partialCache.get(url);
}

function applyTokens(html, tokens) {
  let out = html;
  for (const [key, value] of Object.entries(tokens)) {
    out = out.split(`{{${key}}}`).join(value ?? '');
  }
  return out;
}

/**
 * @param {{ variant?: 'public'|'guest', firstName?: string }} [options]
 * @returns {Promise<string>}
 */
export async function buildLandingContent({ variant = 'public', firstName = 'Guest' } = {}) {
  const tokens = {
    ...VARIANT_TOKENS[variant],
    FIRST_NAME: firstName,
  };
  const heroUrl = variant === 'guest' ? PARTIALS.heroGuest : PARTIALS.heroPublic;
  const [hero, sections] = await Promise.all([
    fetchPartial(heroUrl),
    fetchPartial(PARTIALS.sections),
  ]);
  return applyTokens(hero, tokens) + applyTokens(sections, tokens);
}

/** Mount public landing sections into #lp-main-mount (index.html). */
export async function mountPublicLandingContent() {
  const mount = document.getElementById('lp-main-mount');
  if (!mount || mount.dataset.landingMounted === '1') return mount;
  mount.innerHTML = await buildLandingContent({ variant: 'public' });
  mount.dataset.landingMounted = '1';
  return mount;
}
