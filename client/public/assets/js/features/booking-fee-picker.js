/**
 * Grouped catalog fee picker — main categories first, options expand below.
 * Used by guest booking extras and admin reservation wizards.
 */

import { escapeHtml, formatMoney, PER_PERSON_NIGHT_EXTRA_ITEM, servicesToQuickFees } from '/assets/js/features/reservation-shared.js';

const LAUNDRY_CATEGORIES = new Set(['Laundry', 'Laundry-Iron']);
export const LAUNDRY_GROUP_ID = 'laundry';

/** Housing-managed extras — not shown in guest self-booking UI. */
const GUEST_SELF_BOOK_EXCLUDED_CATEGORIES = new Set([
  'Corkage Fee',
  'Maid Service',
]);

const GUEST_SELF_BOOK_EXCLUDED_ITEMS = new Set([
  'Aircon',
]);

export function filterGuestSelfBookServices(services = []) {
  return (services || [])
    .filter((group) => !GUEST_SELF_BOOK_EXCLUDED_CATEGORIES.has(group.category))
    .map((group) => ({
      ...group,
      items: (group.items || []).filter((item) => !GUEST_SELF_BOOK_EXCLUDED_ITEMS.has(item.item)),
    }))
    .filter((group) => (group.items || []).length > 0);
}

/** Fee picker catalog for guest self-service flows (browse, modify) — admin wizards use the full catalog. */
export function getGuestSelfBookFeeCatalog(services = []) {
  const filtered = filterGuestSelfBookServices(services);
  return {
    feeGroups: buildFeeGroups(filtered),
    quickFees: servicesToQuickFees(filtered),
  };
}

const GROUP_LABELS = {
  'Corkage Fee': 'Corkage',
  'Maid Service': 'Maid Service',
  'Accommodation Extras': 'Room extras',
};

const GROUP_ICONS = {
  [LAUNDRY_GROUP_ID]: 'local_laundry_service',
  Laundry: 'local_laundry_service',
  'Laundry-Iron': 'iron',
  'Corkage Fee': 'restaurant',
  'Maid Service': 'cleaning_services',
  'Accommodation Extras': 'bed',
};

const FEE_ICONS = {
  Laundry: 'local_laundry_service',
  Corkage: 'wine_bar',
};

function feeIcon(name, category = '') {
  if (LAUNDRY_CATEGORIES.has(category)) return 'local_laundry_service';
  return FEE_ICONS[name] || GROUP_ICONS[category] || 'add_circle';
}

function groupLabel(category) {
  return GROUP_LABELS[category] || category;
}

function mapCatalogItem(group, row) {
  const name = row.item;
  const season = row.season && row.season !== 'N/A' ? row.season : '';
  return {
    name,
    label: season ? `${name} (${season})` : name,
    amount: Number(row.rate),
    category: group.category,
  };
}

/** Build top-level fee groups; laundry sub-items stay nested until expanded. */
export function buildFeeGroups(services = []) {
  const topLevel = [];
  const laundryItems = [];

  for (const group of services || []) {
    const items = (group.items || [])
      .filter((item) => !(
        group.category === 'Accommodation Extras'
        && item.item === PER_PERSON_NIGHT_EXTRA_ITEM
      ))
      .map((row) => mapCatalogItem(group, row));

    if (LAUNDRY_CATEGORIES.has(group.category)) {
      laundryItems.push(...items);
      continue;
    }

    if (!items.length) continue;

    if (items.length === 1) {
      const item = items[0];
      const genericName = /^(per person|per load|each)$/i.test(String(item.name).trim());
      topLevel.push({
        id: group.category,
        label: genericName ? groupLabel(group.category) : (item.label || item.name),
        icon: GROUP_ICONS[group.category] || feeIcon(item.name, group.category),
        type: 'single',
        item,
      });
    } else {
      topLevel.push({
        id: group.category,
        label: groupLabel(group.category),
        icon: GROUP_ICONS[group.category] || 'add_circle',
        type: 'expandable',
        items,
      });
    }
  }

  if (laundryItems.length) {
    topLevel.push({
      id: LAUNDRY_GROUP_ID,
      label: 'Laundry',
      icon: GROUP_ICONS[LAUNDRY_GROUP_ID],
      type: 'expandable',
      items: laundryItems,
    });
  }

  const singles = topLevel.filter((g) => g.type === 'single');
  const expandables = topLevel.filter((g) => g.type === 'expandable');
  return [...singles, ...expandables];
}

function renderSubmenuItem(item) {
  const label = item.label || item.name;
  return `
    <button type="button" class="guest-service-row" data-quick-fee="${escapeHtml(item.name)}" data-quick-amt="${item.amount}" data-quick-category="${escapeHtml(item.category || '')}">
      <span class="guest-service-row__name">${escapeHtml(label)}</span>
      <span class="guest-service-row__price">${formatMoney(item.amount)}</span>
      <span class="material-symbols-outlined guest-service-row__add" aria-hidden="true">add</span>
    </button>`;
}

function renderFeeSubmenu(group) {
  if (!group?.items?.length) return '';

  const renderSection = (title, items) => {
    if (!items.length) return '';
    return `
      <div class="guest-service-drawer__section">
        ${title ? `<p class="guest-service-drawer__section-label">${title}</p>` : ''}
        <div class="guest-service-drawer__list">
          ${items.map((item) => renderSubmenuItem(item)).join('')}
        </div>
      </div>`;
  };

  if (group.id === LAUNDRY_GROUP_ID) {
    const wash = group.items.filter((i) => i.category === 'Laundry');
    const iron = group.items.filter((i) => i.category === 'Laundry-Iron');
    return `
      <div class="guest-service-drawer__bar">
        <span class="guest-service-drawer__title">${escapeHtml(group.label)}</span>
        <button type="button" class="guest-service-drawer__done" data-fee-submenu-close>Done</button>
      </div>
      ${renderSection('Wash & dry', wash)}
      ${renderSection('Iron & press', iron)}`;
  }

  return `
    <div class="guest-service-drawer__bar">
      <span class="guest-service-drawer__title">${escapeHtml(group.label)}</span>
      <button type="button" class="guest-service-drawer__done" data-fee-submenu-close>Done</button>
    </div>
    ${renderSection('', group.items)}`;
}

function renderFeeChips(feeGroups, expandedGroupId) {
  if (!feeGroups.length) {
    return '<p class="res-hint">No extra services are configured in the catalog yet.</p>';
  }

  return feeGroups.map((group) => {
    const isExpanded = expandedGroupId === group.id;
    if (group.type === 'single') {
      const item = group.item;
      const itemLabel = item.label || item.name;
      return `
        <button type="button" class="guest-service-card" data-quick-fee="${escapeHtml(item.name)}" data-quick-amt="${item.amount}" data-quick-category="${escapeHtml(item.category || '')}">
          <span class="guest-service-card__icon" aria-hidden="true">
            <span class="material-symbols-outlined">${group.icon}</span>
          </span>
          <span class="guest-service-card__body">
            <span class="guest-service-card__title">${escapeHtml(group.label || itemLabel)}</span>
            <span class="guest-service-card__price">${formatMoney(item.amount)}</span>
          </span>
          <span class="material-symbols-outlined guest-service-card__add" aria-hidden="true">add</span>
        </button>`;
    }
    return `
      <button type="button" class="guest-service-card guest-service-card--expandable${isExpanded ? ' is-open' : ''}" data-fee-group="${escapeHtml(group.id)}" aria-expanded="${isExpanded ? 'true' : 'false'}">
        <span class="guest-service-card__icon" aria-hidden="true">
          <span class="material-symbols-outlined">${group.icon}</span>
        </span>
        <span class="guest-service-card__body">
          <span class="guest-service-card__title">${escapeHtml(group.label)}</span>
          <span class="guest-service-card__hint">${isExpanded ? 'Tap to close' : 'View options'}</span>
        </span>
        <span class="material-symbols-outlined guest-service-card__chevron" aria-hidden="true">${isExpanded ? 'expand_less' : 'chevron_right'}</span>
      </button>`;
  }).join('');
}

function renderSelectedFees(fees) {
  if (!fees.length) return '';
  return `
    <div class="guest-added-extras">
      <p class="guest-added-extras__label">Added extras <span class="guest-added-extras__count">${fees.length}</span></p>
      <ul class="guest-added-extras__list">
        ${fees.map((f, i) => `
          <li class="guest-added-extras__item">
            <span class="guest-added-extras__name">${escapeHtml(f.fee_name || f.name)}</span>
            <span class="guest-added-extras__amt">${formatMoney(f.amount)}</span>
            <button type="button" class="guest-added-extras__remove" data-fee-rm="${i}" aria-label="Remove ${escapeHtml(f.fee_name || f.name)}">
              <span class="material-symbols-outlined">close</span>
            </button>
          </li>`).join('')}
      </ul>
    </div>`;
}

/**
 * @param {object} opts
 * @param {Array} opts.feeGroups from buildFeeGroups
 * @param {string|null} opts.expandedGroupId
 * @param {Array<{fee_name:string,amount:number}>} opts.fees
 * @param {string} [opts.emptyMessage]
 * @param {boolean} [opts.showCustom]
 * @param {string} [opts.customNameInputId]
 * @param {string} [opts.customAmtInputId]
 * @param {string} [opts.customAddBtnId]
 */
export function renderWizardFeePicker({
  feeGroups = [],
  expandedGroupId = null,
  fees = [],
  emptyMessage = 'No extra services in the catalog yet — add a custom line below or configure fees under Facilities → Extra fees.',
  showCustom = true,
  customNameInputId = 'wiz-fee-name',
  customAmtInputId = 'wiz-fee-amt',
  customAddBtnId = 'wiz-add-fee',
  compact = false,
} = {}) {
  const expandedGroup = feeGroups.find((g) => g.id === expandedGroupId && g.type === 'expandable');
  const chipsHtml = feeGroups.length
    ? renderFeeChips(feeGroups, expandedGroupId)
    : `<p class="res-hint">${escapeHtml(emptyMessage)}</p>`;

  const submenuHtml = expandedGroup
    ? `<div class="guest-service-drawer" data-fee-submenu>${renderFeeSubmenu(expandedGroup)}</div>`
    : '';

  const customBlock = showCustom ? `
    <div class="res-fee-picker-custom">
      <p class="res-fee-picker-custom__label">Custom fee</p>
      <div class="res-row">
        <div><label class="res-label" for="${customNameInputId}">Fee name</label><input id="${customNameInputId}" class="res-input" placeholder="e.g. Extra mattress" /></div>
        <div><label class="res-label" for="${customAmtInputId}">Amount (₱)</label><input id="${customAmtInputId}" class="res-input" type="number" min="0" step="1" placeholder="0" /></div>
      </div>
      <button type="button" id="${customAddBtnId}" class="res-btn res-btn--secondary">Add custom fee</button>
    </div>` : '';

  const feesSubtotal = fees.length
    ? `<p class="res-meal-total">Fees subtotal: <strong>${formatMoney(fees.reduce((s, f) => s + Number(f.amount || 0), 0))}</strong></p>`
    : '';

  return `
    <div class="res-wizard-fee-picker${compact ? ' res-wizard-fee-picker--compact' : ''}" data-fee-picker>
      <div class="guest-service-grid" data-fee-chips>${chipsHtml}</div>
      ${submenuHtml}
      ${renderSelectedFees(fees)}
      ${customBlock}
      ${feesSubtotal}
    </div>`;
}

/**
 * Wire fee picker clicks inside a wizard step container.
 * @returns {boolean} true if the click was handled
 */
export function handleWizardFeePickerClick(e, {
  getExpandedGroupId,
  setExpandedGroupId,
  onAddFee,
  onRemoveFee,
}) {
  const closeBtn = e.target.closest('[data-fee-submenu-close]');
  if (closeBtn) {
    setExpandedGroupId(null);
    return true;
  }

  const groupBtn = e.target.closest('[data-fee-group]');
  if (groupBtn) {
    const id = groupBtn.dataset.feeGroup;
    setExpandedGroupId(getExpandedGroupId() === id ? null : id);
    return true;
  }

  const quickBtn = e.target.closest('[data-quick-fee]');
  if (quickBtn) {
    onAddFee({
      fee_name: quickBtn.dataset.quickFee,
      amount: Number(quickBtn.dataset.quickAmt),
    });
    return true;
  }

  const rmBtn = e.target.closest('[data-fee-rm]');
  if (rmBtn) {
    onRemoveFee(Number(rmBtn.dataset.feeRm));
    return true;
  }

  return false;
}
