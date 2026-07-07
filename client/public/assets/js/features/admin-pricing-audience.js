/**
 * Shared audience subtabs for admin pricing panels (Guest, Category 1–2).
 */

export const PRICING_AUDIENCE_TABS = [
  { id: 'Guest', label: 'Guest', badge: 'Live' },
  { id: 'Category 1', label: 'Category 1' },
  { id: 'Category 2', label: 'Category 2' },
];

export function normalizeAudience(value) {
  const next = String(value ?? 'Guest').trim();
  if (next === 'Category 3') return 'Guest';
  return next || 'Guest';
}

export function rowAudience(row) {
  return normalizeAudience(row?.audience);
}

export function filterByAudience(items, audience) {
  const key = normalizeAudience(audience);
  return (items || []).filter((row) => rowAudience(row) === key);
}

export function countByAudience(items, { pricedOnly = false } = {}) {
  const counts = Object.fromEntries(PRICING_AUDIENCE_TABS.map((t) => [t.id, 0]));
  for (const row of items || []) {
    const audience = rowAudience(row);
    if (counts[audience] == null) continue;
    if (pricedOnly) {
      const hasPrice = row.rate != null
        || row.cells?.some((c) => c.rate != null)
        || row.regular_rate != null && row.regular_rate !== '';
      if (!hasPrice) continue;
    }
    counts[audience] += 1;
  }
  return counts;
}

export function renderPricingAudienceTabs(container, { active, counts = {} } = {}) {
  if (!container) return;
  container.className = 'fac-pricing-subtabs';
  container.setAttribute('role', 'tablist');
  container.setAttribute('aria-label', 'Rate category');
  container.innerHTML = PRICING_AUDIENCE_TABS.map((tab) => {
    const isActive = tab.id === normalizeAudience(active);
    const count = counts[tab.id] || 0;
    return `
      <button
        type="button"
        class="fac-pricing-subtab${isActive ? ' is-active' : ''}"
        role="tab"
        aria-selected="${isActive ? 'true' : 'false'}"
        data-pricing-audience="${tab.id}"
      >
        <span class="fac-pricing-subtab__label">${tab.label}</span>
        ${tab.badge ? `<span class="fac-pricing-subtab__badge">${tab.badge}</span>` : ''}
        ${count ? `<span class="fac-pricing-subtab__count">${count}</span>` : ''}
      </button>`;
  }).join('');
}

export function bindPricingAudienceTabs(container, onSelect) {
  if (!container || container.dataset.bound === '1') return;
  container.dataset.bound = '1';
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pricing-audience]');
    if (!btn) return;
    onSelect(btn.getAttribute('data-pricing-audience'));
  });
}

export function audienceTabHint(audience) {
  if (normalizeAudience(audience) === 'Guest') {
    return 'Rates in this tab are used for live bookings today (Guest · Adult · PHP).';
  }
  return 'Prepare rates for this internal category. They are stored but not charged on bookings until housing enables category rules.';
}
