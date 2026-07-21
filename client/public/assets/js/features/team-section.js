/**
 * Renders the Meet the team grid from config/team-members.js.
 * Variants: policies (light card layout) | landing (dark lp-team styles).
 */
import { TEAM_INTRO, TEAM_MEMBERS } from '/assets/js/config/team-members.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function avatarMarkup(member, variant) {
  const photo = member.photo?.trim();
  if (photo) {
    return `<img class="${variant === 'landing' ? 'lp-team-avatar' : 'policies-team-avatar'} policies-team-avatar--photo" src="${escapeHtml(photo)}" alt="" loading="lazy" decoding="async" />`;
  }
  const avatarClass = variant === 'landing' ? 'lp-team-avatar' : 'policies-team-avatar';
  return `<div class="${avatarClass}" aria-hidden="true">${escapeHtml(member.initials || member.name.charAt(0))}</div>`;
}

function cardMarkup(member, variant) {
  const cardClass = variant === 'landing' ? 'lp-team-card rounded-2xl p-6 text-center' : 'policies-team-card';
  const nameClass = variant === 'landing'
    ? 'font-bold text-white text-headline-sm mb-1'
    : 'policies-team-card__name';
  const roleClass = variant === 'landing'
    ? 'text-body-sm text-white/65'
    : 'policies-team-card__role';
  return `
    <article class="${cardClass}">
      ${avatarMarkup(member, variant)}
      <h3 class="${nameClass}">${escapeHtml(member.name)}</h3>
      <p class="${roleClass}">${escapeHtml(member.role)}</p>
    </article>`;
}

/**
 * @param {HTMLElement|null} mount - Container to fill (replaces children).
 * @param {{ variant?: 'policies' | 'landing' }} [options]
 */
export function renderTeamSection(mount, { variant = 'policies' } = {}) {
  if (!mount) return;

  const isLanding = variant === 'landing';
  const gridClass = isLanding
    ? 'lp-team-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5'
    : 'policies-team-grid';
  const labelClass = isLanding
    ? 'lp-section-label text-label-sm text-white/60 uppercase mb-3 tracking-widest'
    : 'policies-team__label';
  const titleClass = isLanding
    ? 'text-3xl lg:text-headline-lg font-bold text-white mb-4'
    : 'policies-team__title';
  const subtitleClass = isLanding
    ? 'text-body-lg text-white/70'
    : 'policies-team__subtitle';
  const headClass = isLanding
    ? 'lp-section-head lp-team-head text-center max-w-2xl mx-auto mb-14'
    : 'policies-team__head';
  const headingId = isLanding ? 'lp-team-heading' : 'meet-the-team-heading';

  mount.innerHTML = `
    <div class="${headClass}">
      <p class="${labelClass}">${escapeHtml(TEAM_INTRO.label)}</p>
      <h2 id="${headingId}" class="${titleClass}">${escapeHtml(TEAM_INTRO.title)}</h2>
      <p class="${subtitleClass}">${escapeHtml(TEAM_INTRO.subtitle)}</p>
    </div>
    <div class="${gridClass}">
      ${TEAM_MEMBERS.map((member) => cardMarkup(member, variant)).join('')}
    </div>`;
}
