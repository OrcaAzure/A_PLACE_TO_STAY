/**
 * Browse category mosaic — paints immediately after guest shell mounts.
 */
import {
  getBrowseCategories,
  getBrowseCategoryMeta,
  resolveBrowseCategory,
  readBrowseQuery,
} from '/assets/js/features/guest-booking-flow.js';
import { isInternalGuest } from '/assets/js/services/auth.js';
import { escapeHtml } from '/assets/js/features/reservation-shared.js';

const LAYOUT_CLASS = {
  hero: 'browse-category-card--hero',
  tall: 'browse-category-card--tall',
  standard: '',
};

export function buildBrowseCategoryCardsHtml(selectedCategory, isInternal = isInternalGuest()) {
  const categories = getBrowseCategories();
  return categories.map((cat) => {
    const meta = getBrowseCategoryMeta(cat.id, isInternal);
    const active = selectedCategory === cat.id;
    const tag = meta.tag
      ? `<span class="browse-category-card__tag">${escapeHtml(meta.tag)}</span>`
      : '';
    return `
      <button
        type="button"
        role="listitem"
        data-category="${escapeHtml(cat.id)}"
        class="browse-category-card ${LAYOUT_CLASS[cat.layout] || ''} ${active ? 'is-active' : ''}"
        aria-pressed="${active ? 'true' : 'false'}"
        aria-label="${escapeHtml(meta.label)}${active ? ' (selected)' : ''}"
      >
        <img src="${escapeHtml(cat.image)}" alt="" loading="lazy" />
        <span class="browse-category-card__icon material-symbols-outlined" aria-hidden="true">${escapeHtml(cat.icon || 'place')}</span>
        ${active ? '<span class="browse-category-card__selected" aria-hidden="true"><span class="material-symbols-outlined">check</span></span>' : ''}
        <div class="browse-category-card__body">
          ${tag}
          <strong class="browse-category-card__title">${escapeHtml(meta.label)}</strong>
          <span class="browse-category-card__blurb">${escapeHtml(meta.blurb || meta.description || '')}</span>
          <span class="browse-category-card__cta">
            ${escapeHtml(cat.cta || 'Browse')}
            <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
          </span>
        </div>
      </button>`;
  }).join('');
}

/**
 * Paint category cards as early as possible. Returns selected category id.
 */
export function paintBrowseCategoryCards({
  selectedCategory = resolveBrowseCategory(readBrowseQuery().category),
  isInternal = isInternalGuest(),
} = {}) {
  const mount = document.getElementById('browse-category-cards');
  if (!mount) return selectedCategory;
  mount.innerHTML = buildBrowseCategoryCardsHtml(selectedCategory, isInternal);
  return selectedCategory;
}
