/**
 * Pricing category picker for admin booking flows (Guest, Category 1, Category 2).
 */

export const ADMIN_PRICING_CATEGORIES = [
  { id: 'Guest', label: 'Guest', hint: 'Standard rate — used for public guests' },
  { id: 'Category 1', label: 'Category 1', hint: 'Internal rate tier 1' },
  { id: 'Category 2', label: 'Category 2', hint: 'Internal rate tier 2' },
];

export function normalizePricingCategory(value) {
  const next = String(value ?? 'Guest').trim();
  if (next === 'Category 3') return 'Guest';
  return ADMIN_PRICING_CATEGORIES.some((c) => c.id === next) ? next : 'Guest';
}

export function pricingCategoryLabel(value) {
  const key = normalizePricingCategory(value);
  return ADMIN_PRICING_CATEGORIES.find((c) => c.id === key)?.label || key;
}

export function renderPricingCategoryField({
  id = 'pricing-category',
  value = 'Guest',
  label = 'Pricing category',
  hint = 'Housing assigns the rate tier. Totals update when you change this.',
  compact = false,
} = {}) {
  const selected = normalizePricingCategory(value);
  const options = ADMIN_PRICING_CATEGORIES.map((cat) => `
    <option value="${cat.id}"${cat.id === selected ? ' selected' : ''}>${cat.label}</option>`).join('');

  if (compact) {
    return `
      <div class="res-pricing-category res-pricing-category--compact">
        <label class="res-label" for="${id}">${label}</label>
        <select id="${id}" class="res-input res-pricing-category__select" data-pricing-category>
          ${options}
        </select>
      </div>`;
  }

  return `
    <div class="res-pricing-category">
      <label class="res-label" for="${id}">${label}</label>
      <p class="res-hint res-pricing-category__hint">${hint}</p>
      <select id="${id}" class="res-input res-pricing-category__select" data-pricing-category>
        ${options}
      </select>
      <p class="res-pricing-category__active-hint" data-pricing-category-active-hint>
        ${ADMIN_PRICING_CATEGORIES.find((c) => c.id === selected)?.hint || ''}
      </p>
    </div>`;
}

export function readPricingCategory(root = document, fallback = 'Guest') {
  const el = root.querySelector?.('[data-pricing-category]') || root;
  if (el?.matches?.('[data-pricing-category]')) {
    return normalizePricingCategory(el.value || fallback);
  }
  const select = root.querySelector?.('[data-pricing-category]');
  return normalizePricingCategory(select?.value || fallback);
}

export function bindPricingCategoryField(root, onChange) {
  const select = root?.querySelector?.('[data-pricing-category]');
  if (!select || select.dataset.bound === '1') return;
  select.dataset.bound = '1';
  const hint = root.querySelector?.('[data-pricing-category-active-hint]');
  const syncHint = () => {
    if (!hint) return;
    const cat = ADMIN_PRICING_CATEGORIES.find((c) => c.id === normalizePricingCategory(select.value));
    hint.textContent = cat?.hint || '';
  };
  select.addEventListener('change', () => {
    syncHint();
    onChange?.(normalizePricingCategory(select.value));
  });
  syncHint();
}

export function renderApprovePricingCategoryModalBody({ guestName, estimatedTotal, isGroup = false } = {}) {
  const who = guestName ? `<strong>${guestName}</strong>` : 'this guest';
  const estimate = estimatedTotal != null
    ? `<p class="res-hint">Current estimate (guest rates): <strong>${estimatedTotal}</strong></p>`
    : '';
  return `
    <p class="res-lead">Choose the pricing category for ${who}${isGroup ? '\'s group' : ''} before approving. The guest will receive the final total by email.</p>
    ${estimate}
    ${renderPricingCategoryField({ id: 'approve-pricing-category', value: 'Guest' })}
  `;
}
