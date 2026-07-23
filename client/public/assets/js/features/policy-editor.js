/**
 * Visual section-based editor for Policies & Guidelines (admin settings).
 */

import {
  parsePolicyMarkdown,
  serializePolicyMarkdown,
  renderPolicyDocument,
  policyCharacterCount,
} from '/assets/js/features/policy-markdown.js';
import { escapeHtml } from '/assets/js/features/reservation-shared.js';

const POLICY_KINDS = [
  { id: 'rooms', label: 'Rooms / Accommodation', icon: 'bed' },
  { id: 'venues', label: 'Venues / Facilities', icon: 'location_city' },
];

/** @type {{ rooms: import('./policy-markdown.js').PolicySection[], venues: import('./policy-markdown.js').PolicySection[] }} */
let state = { rooms: [], venues: [] };
let activeKind = 'rooms';
let viewMode = 'edit';
/** @type {HTMLElement | null} */
let root = null;
/** @type {(() => void) | null} */
let onChange = null;

function $(selector) {
  return root?.querySelector(selector) ?? null;
}

function currentSections() {
  return state[activeKind];
}

function setCurrentSections(sections) {
  state[activeKind] = sections;
  onChange?.();
}

function exportMarkdown(kind) {
  return serializePolicyMarkdown(state[kind]);
}

function totalCharacterCount() {
  return policyCharacterCount(exportMarkdown('rooms')) + policyCharacterCount(exportMarkdown('venues'));
}

function kindCharacterCount(kind) {
  return policyCharacterCount(exportMarkdown(kind));
}

function moveSection(index, direction) {
  const sections = [...currentSections()];
  const target = index + direction;
  if (target < 0 || target >= sections.length) return;
  [sections[index], sections[target]] = [sections[target], sections[index]];
  setCurrentSections(sections);
  render();
  focusSection(target);
}

function removeSection(index) {
  const sections = [...currentSections()];
  if (sections.length <= 1) return;
  sections.splice(index, 1);
  setCurrentSections(sections);
  render();
}

function addSection() {
  const sections = [...currentSections()];
  sections.push({
    title: 'New section',
    blocks: [{ type: 'paragraph', text: '' }],
  });
  setCurrentSections(sections);
  render();
  focusSection(sections.length - 1);
}

function focusSection(index) {
  requestAnimationFrame(() => {
    const input = root?.querySelector(`[data-policy-section-title="${index}"]`);
    input?.focus();
    input?.select();
  });
}

function updateSectionTitle(index, title) {
  const sections = [...currentSections()];
  sections[index] = { ...sections[index], title };
  setCurrentSections(sections);
  updateMeta();
}

function updateBlock(index, blockIndex, block) {
  const sections = [...currentSections()];
  const blocks = [...sections[index].blocks];
  blocks[blockIndex] = block;
  sections[index] = { ...sections[index], blocks };
  setCurrentSections(sections);
  updateMeta();
}

function addParagraphBlock(index) {
  const sections = [...currentSections()];
  sections[index] = {
    ...sections[index],
    blocks: [...sections[index].blocks, { type: 'paragraph', text: '' }],
  };
  setCurrentSections(sections);
  render();
}

function addListBlock(index) {
  const sections = [...currentSections()];
  sections[index] = {
    ...sections[index],
    blocks: [...sections[index].blocks, { type: 'list', items: [''] }],
  };
  setCurrentSections(sections);
  render();
}

function removeBlock(sectionIndex, blockIndex) {
  const sections = [...currentSections()];
  const blocks = sections[sectionIndex].blocks.filter((_, i) => i !== blockIndex);
  sections[sectionIndex] = {
    ...sections[sectionIndex],
    blocks: blocks.length ? blocks : [{ type: 'paragraph', text: '' }],
  };
  setCurrentSections(sections);
  render();
}

function blockLabel(type) {
  return type === 'list' ? 'Bullet list' : 'Paragraph';
}

function renderBlock(sectionIndex, block, blockIndex) {
  if (block.type === 'paragraph') {
    return `
      <div class="policy-block" data-block-index="${blockIndex}">
        <div class="policy-block__head">
          <span class="policy-block__label">${blockLabel('paragraph')}</span>
          <button type="button" class="policy-block__remove" data-action="remove-block" data-section="${sectionIndex}" data-block="${blockIndex}" aria-label="Remove paragraph">
            <span class="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </div>
        <textarea
          class="policy-block__textarea"
          rows="4"
          data-action="paragraph"
          data-section="${sectionIndex}"
          data-block="${blockIndex}"
          placeholder="Write the policy text guests will read…"
        >${escapeHtml(block.text || '')}</textarea>
      </div>`;
  }

  const items = (block.items?.length ? block.items : ['']).map((item, itemIndex) => `
    <div class="policy-list-item">
      <span class="policy-list-item__bullet" aria-hidden="true">•</span>
      <input
        type="text"
        class="policy-list-item__input"
        value="${escapeHtml(item || '')}"
        data-action="list-item"
        data-section="${sectionIndex}"
        data-block="${blockIndex}"
        data-item="${itemIndex}"
        placeholder="List item"
      />
      <button type="button" class="policy-list-item__remove" data-action="remove-list-item" data-section="${sectionIndex}" data-block="${blockIndex}" data-item="${itemIndex}" aria-label="Remove list item">
        <span class="material-symbols-outlined" aria-hidden="true">close</span>
      </button>
    </div>`).join('');

  return `
    <div class="policy-block" data-block-index="${blockIndex}">
      <div class="policy-block__head">
        <span class="policy-block__label">${blockLabel('list')}</span>
        <button type="button" class="policy-block__remove" data-action="remove-block" data-section="${sectionIndex}" data-block="${blockIndex}" aria-label="Remove bullet list">
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </div>
      <div class="policy-list">${items}</div>
      <button type="button" class="policy-inline-btn" data-action="add-list-item" data-section="${sectionIndex}" data-block="${blockIndex}">
        <span class="material-symbols-outlined" aria-hidden="true">add</span>
        Add bullet
      </button>
    </div>`;
}

function renderSection(section, index) {
  const blocks = (section.blocks?.length ? section.blocks : [{ type: 'paragraph', text: '' }])
    .map((block, blockIndex) => renderBlock(index, block, blockIndex))
    .join('');

  return `
    <article class="policy-section-card" data-section-index="${index}">
      <div class="policy-section-card__head">
        <label class="policy-section-card__title-label" for="policy-section-title-${activeKind}-${index}">Section heading</label>
        <div class="policy-section-card__actions">
          <button type="button" class="policy-icon-btn" data-action="move-up" data-section="${index}" aria-label="Move section up" ${index === 0 ? 'disabled' : ''}>
            <span class="material-symbols-outlined" aria-hidden="true">arrow_upward</span>
          </button>
          <button type="button" class="policy-icon-btn" data-action="move-down" data-section="${index}" aria-label="Move section down" ${index === currentSections().length - 1 ? 'disabled' : ''}>
            <span class="material-symbols-outlined" aria-hidden="true">arrow_downward</span>
          </button>
          <button type="button" class="policy-icon-btn policy-icon-btn--danger" data-action="remove-section" data-section="${index}" aria-label="Remove section" ${currentSections().length <= 1 ? 'disabled' : ''}>
            <span class="material-symbols-outlined" aria-hidden="true">delete</span>
          </button>
        </div>
      </div>
      <input
        id="policy-section-title-${activeKind}-${index}"
        type="text"
        class="policy-section-card__title"
        data-policy-section-title="${index}"
        data-action="section-title"
        data-section="${index}"
        value="${escapeHtml(section.title || '')}"
        maxlength="120"
        placeholder="e.g. Check-In and Check-Out"
      />
      <div class="policy-section-card__blocks">${blocks}</div>
      <div class="policy-section-card__add">
        <button type="button" class="policy-inline-btn" data-action="add-paragraph" data-section="${index}">
          <span class="material-symbols-outlined" aria-hidden="true">notes</span>
          Add paragraph
        </button>
        <button type="button" class="policy-inline-btn" data-action="add-list" data-section="${index}">
          <span class="material-symbols-outlined" aria-hidden="true">format_list_bulleted</span>
          Add bullet list
        </button>
      </div>
    </article>`;
}

function renderTabs() {
  return POLICY_KINDS.map((kind) => `
    <button
      type="button"
      class="policy-editor__tab${activeKind === kind.id ? ' is-active' : ''}"
      data-action="switch-kind"
      data-kind="${kind.id}"
      aria-selected="${activeKind === kind.id ? 'true' : 'false'}"
    >
      <span class="material-symbols-outlined" aria-hidden="true">${kind.icon}</span>
      ${escapeHtml(kind.label)}
    </button>`).join('');
}

function renderEditPane() {
  const sections = currentSections();
  return `
    <div class="policy-editor__edit${viewMode === 'edit' ? '' : ' hidden'}">
      <div class="policy-editor__toolbar">
        <button type="button" class="policy-editor__toolbar-btn" data-action="add-section">
          <span class="material-symbols-outlined" aria-hidden="true">add_circle</span>
          Add section
        </button>
        <p class="policy-editor__hint">Edit by section — no markdown symbols needed. Use paragraphs for regular text and bullet lists for schedules or contact details.</p>
      </div>
      <div class="policy-editor__sections">
        ${sections.map((section, index) => renderSection(section, index)).join('')}
      </div>
    </div>`;
}

function renderPreviewPane() {
  const previewMountId = `policy-preview-${activeKind}`;
  return `
    <div class="policy-editor__preview${viewMode === 'preview' ? '' : ' hidden'}">
      <p class="policy-editor__preview-note">This is how guests will see the ${activeKind === 'rooms' ? 'rooms' : 'venues'} policy on the public page.</p>
      <div class="policy-editor__preview-card">
        <div id="${previewMountId}" class="policy-document policy-document--preview" aria-live="polite"></div>
      </div>
    </div>`;
}

function renderShell() {
  if (!root) return;
  root.innerHTML = `
    <div class="policy-editor__meta">
      <p id="policies-last-updated" class="policy-editor__updated">—</p>
      <p id="policies-char-count" class="policy-editor__count">0 / 50,000 characters</p>
    </div>
    <div class="policy-editor__tabs" role="tablist" aria-label="Policy category">${renderTabs()}</div>
    <div class="policy-editor__mode">
      <button type="button" class="policy-editor__mode-btn${viewMode === 'edit' ? ' is-active' : ''}" data-action="view-edit" aria-pressed="${viewMode === 'edit'}">
        <span class="material-symbols-outlined" aria-hidden="true">edit_note</span>
        Edit
      </button>
      <button type="button" class="policy-editor__mode-btn${viewMode === 'preview' ? ' is-active' : ''}" data-action="view-preview" aria-pressed="${viewMode === 'preview'}">
        <span class="material-symbols-outlined" aria-hidden="true">visibility</span>
        Preview
      </button>
    </div>
    ${renderEditPane()}
    ${renderPreviewPane()}
  `;
  bindEvents();
  updateMeta();
  if (viewMode === 'preview') refreshPreview();
}

function render() {
  const scrollTop = root?.querySelector('.policy-editor__sections')?.scrollTop ?? 0;
  renderShell();
  const sectionsEl = root?.querySelector('.policy-editor__sections');
  if (sectionsEl) sectionsEl.scrollTop = scrollTop;
}

function updateMeta() {
  const countEl = document.getElementById('policies-char-count');
  const kindCount = kindCharacterCount(activeKind);
  if (countEl) {
    countEl.textContent = `${kindCount.toLocaleString()} characters in this tab · ${totalCharacterCount().toLocaleString()} total (max 50,000 each)`;
  }
}

function refreshPreview() {
  const mount = document.getElementById(`policy-preview-${activeKind}`);
  if (mount) renderPolicyDocument(mount, exportMarkdown(activeKind));
}

function readParagraphFromDom(sectionIndex, blockIndex) {
  const textarea = root?.querySelector(
    `[data-action="paragraph"][data-section="${sectionIndex}"][data-block="${blockIndex}"]`,
  );
  return String(textarea?.value || '');
}

function readListFromDom(sectionIndex, blockIndex) {
  const inputs = root?.querySelectorAll(
    `[data-action="list-item"][data-section="${sectionIndex}"][data-block="${blockIndex}"]`,
  );
  return [...(inputs || [])].map((input) => input.value.trim()).filter(Boolean);
}

function syncDomToState() {
  const sections = currentSections().map((section, sectionIndex) => {
    const titleInput = root?.querySelector(`[data-action="section-title"][data-section="${sectionIndex}"]`);
    const blocks = (section.blocks || []).map((block, blockIndex) => {
      if (block.type === 'list') {
        const items = readListFromDom(sectionIndex, blockIndex);
        return items.length ? { type: 'list', items } : { type: 'list', items: [''] };
      }
      return { type: 'paragraph', text: readParagraphFromDom(sectionIndex, blockIndex) };
    });
    return {
      title: titleInput?.value.trim() || section.title || 'Untitled section',
      blocks: blocks.length ? blocks : [{ type: 'paragraph', text: '' }],
    };
  });
  state[activeKind] = sections;
}

function bindEvents() {
  root?.querySelector('[data-action="switch-kind"]')?.closest('.policy-editor__tabs')
    ?.querySelectorAll('[data-action="switch-kind"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        syncDomToState();
        activeKind = btn.getAttribute('data-kind') || 'rooms';
        render();
        if (viewMode === 'preview') refreshPreview();
      });
    });

  root?.querySelector('[data-action="view-edit"]')?.addEventListener('click', () => {
    viewMode = 'edit';
    render();
  });

  root?.querySelector('[data-action="view-preview"]')?.addEventListener('click', () => {
    syncDomToState();
    viewMode = 'preview';
    render();
    refreshPreview();
  });

  root?.querySelector('[data-action="add-section"]')?.addEventListener('click', () => {
    syncDomToState();
    addSection();
  });

  root?.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target || !root?.contains(target)) return;

    const action = target.getAttribute('data-action');
    const sectionIndex = Number(target.getAttribute('data-section'));
    const blockIndex = Number(target.getAttribute('data-block'));
    const itemIndex = Number(target.getAttribute('data-item'));

    if (action === 'move-up') {
      syncDomToState();
      moveSection(sectionIndex, -1);
      return;
    }
    if (action === 'move-down') {
      syncDomToState();
      moveSection(sectionIndex, 1);
      return;
    }
    if (action === 'remove-section') {
      syncDomToState();
      removeSection(sectionIndex);
      return;
    }
    if (action === 'add-paragraph') {
      syncDomToState();
      addParagraphBlock(sectionIndex);
      return;
    }
    if (action === 'add-list') {
      syncDomToState();
      addListBlock(sectionIndex);
      return;
    }
    if (action === 'remove-block') {
      syncDomToState();
      removeBlock(sectionIndex, blockIndex);
      return;
    }
    if (action === 'add-list-item') {
      syncDomToState();
      const sections = [...currentSections()];
      const block = sections[sectionIndex].blocks[blockIndex];
      if (block?.type === 'list') {
        block.items = [...(block.items || []), ''];
        sections[sectionIndex].blocks[blockIndex] = block;
        setCurrentSections(sections);
        render();
      }
      return;
    }
    if (action === 'remove-list-item') {
      syncDomToState();
      const sections = [...currentSections()];
      const block = sections[sectionIndex].blocks[blockIndex];
      if (block?.type === 'list') {
        const items = [...(block.items || [])];
        items.splice(itemIndex, 1);
        block.items = items.length ? items : [''];
        sections[sectionIndex].blocks[blockIndex] = block;
        setCurrentSections(sections);
        render();
      }
    }
  });

  root?.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.matches('[data-action="section-title"]')) {
      updateSectionTitle(Number(target.getAttribute('data-section')), target.value);
      return;
    }

    if (target.matches('[data-action="paragraph"]')) {
      updateBlock(
        Number(target.getAttribute('data-section')),
        Number(target.getAttribute('data-block')),
        { type: 'paragraph', text: target.value },
      );
      return;
    }

    if (target.matches('[data-action="list-item"]')) {
      const s = Number(target.getAttribute('data-section'));
      const b = Number(target.getAttribute('data-block'));
      const i = Number(target.getAttribute('data-item'));
      const sections = [...currentSections()];
      const block = sections[s].blocks[b];
      if (block?.type === 'list') {
        const items = [...(block.items || [])];
        items[i] = target.value;
        block.items = items;
        sections[s].blocks[b] = block;
        setCurrentSections(sections);
      }
    }
  });
}

/**
 * @param {HTMLElement} mount
 * @param {{ onChange?: () => void }} [options]
 */
export function initPolicyEditor(mount, options = {}) {
  root = mount;
  onChange = options.onChange || null;
  activeKind = 'rooms';
  viewMode = 'edit';
  render();
}

/** @param {{ rooms?: string, venues?: string, updated_at?: string | null }} policies */
export function setPolicyEditorContent(policies) {
  state = {
    rooms: parsePolicyMarkdown(policies?.rooms || ''),
    venues: parsePolicyMarkdown(policies?.venues || ''),
  };
  const updated = document.getElementById('policies-last-updated');
  if (updated) {
    updated.textContent = policies?.updated_at
      ? `Last published ${new Date(policies.updated_at).toLocaleString('en-PH', {
        month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
      })}`
      : 'Using the initial published policy content';
  }
  if (root) render();
}

export function getPolicyEditorContent() {
  syncDomToState();
  return {
    rooms: exportMarkdown('rooms'),
    venues: exportMarkdown('venues'),
  };
}
