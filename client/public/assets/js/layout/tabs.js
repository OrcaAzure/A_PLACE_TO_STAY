/**
 * Smooth, responsive tab switching for guest & admin surfaces.
 */

import { prefersReducedMotion } from '/assets/js/layout/animations.js';

const TAB_BTN_ACTIVE = 'app-tab-active';
const PANEL_HIDDEN = 'is-tab-hidden';
const PANEL_LEAVING = 'is-tab-leaving';
const PANEL_ENTERING = 'is-tab-entering';
const PANELS_SWITCHING = 'is-tab-switching';

const DURATION_MS = 320;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getVisiblePanel(panels) {
  return [...panels].find((p) => !p.classList.contains(PANEL_HIDDEN));
}

function setTabButtonsActive(tabs, activeId, tabAttr) {
  tabs.forEach((tab) => {
    const active = tab.getAttribute(tabAttr) === activeId;
    tab.classList.toggle(TAB_BTN_ACTIVE, active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
    tab.setAttribute('tabindex', active ? '0' : '-1');
  });
}

function clearPanelMotionClasses(panel) {
  panel.classList.remove(PANEL_LEAVING, PANEL_ENTERING);
}

/**
 * @param {object} options
 * @param {ParentNode} [options.root]
 * @param {string} [options.tabAttr]
 * @param {string} [options.panelAttr]
 * @param {string} [options.tabsSelector]
 * @param {string} [options.panelsSelector]
 * @param {boolean} [options.useHiddenClass]
 */
export function initTabGroup(options = {}) {
  const {
    root = document,
    tabAttr = 'data-app-tab',
    panelAttr = 'data-app-panel',
    tabsSelector = null,
    panelsSelector = null,
    useHiddenClass = true,
  } = options;

  const tabRoot = tabsSelector ? root.querySelector(tabsSelector) : root;
  const panelRoot = panelsSelector ? root.querySelector(panelsSelector) : root;
  if (!tabRoot || !panelRoot) return null;

  const tabs = tabRoot.querySelectorAll(`[${tabAttr}]`);
  const panels = panelRoot.querySelectorAll(`[${panelAttr}]`);
  if (!tabs.length || !panels.length) return null;

  const panelsContainer = panels[0]?.parentElement;

  tabs.forEach((tab, i) => {
    tab.setAttribute('role', 'tab');
    if (tab.tagName === 'BUTTON' && !tab.hasAttribute('type')) {
      tab.setAttribute('type', 'button');
    }
    if (!tab.hasAttribute('tabindex')) tab.setAttribute('tabindex', i === 0 ? '0' : '-1');
  });

  panels.forEach((panel) => {
    panel.setAttribute('role', 'tabpanel');
    panel.classList.add('app-tab-panel');
    if (panel.classList.contains('hidden')) {
      panel.classList.add(PANEL_HIDDEN);
      panel.classList.remove('hidden');
    }
  });

  let switching = false;

  const switchTo = async (id) => {
    if (switching) return;
    switching = true;
    try {
      await switchTabPanel({
        tabs,
        panels,
        panelsContainer,
        activeId: id,
        tabAttr,
        panelAttr,
        useHiddenClass,
      });
    } finally {
      switching = false;
    }
  };

  tabs.forEach((tab) => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      switchTo(tab.getAttribute(tabAttr));
    });
  });

  tabRoot.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const list = [...tabs];
    const idx = list.findIndex((t) => t.classList.contains(TAB_BTN_ACTIVE));
    if (idx < 0) return;
    const nextIdx = e.key === 'ArrowRight'
      ? (idx + 1) % list.length
      : (idx - 1 + list.length) % list.length;
    e.preventDefault();
    list[nextIdx].focus();
    switchTo(list[nextIdx].getAttribute(tabAttr));
  });

  return { switchTo, tabs, panels };
}

/**
 * Crossfade between tab panels with optional height smoothing.
 */
export async function switchTabPanel({
  tabs,
  panels,
  panelsContainer,
  activeId,
  tabAttr = 'data-app-tab',
  panelAttr = 'data-app-panel',
  useHiddenClass = true,
}) {
  const next = [...panels].find((p) => p.getAttribute(panelAttr) === activeId);
  if (!next) return;

  const current = getVisiblePanel(panels);
  if (current === next) return;

  setTabButtonsActive(tabs, activeId, tabAttr);

  const container = panelsContainer || next.parentElement;
  if (!container) return;

  if (prefersReducedMotion()) {
    panels.forEach((p) => {
      const show = p.getAttribute(panelAttr) === activeId;
      clearPanelMotionClasses(p);
      p.classList.toggle(PANEL_HIDDEN, !show);
      if (useHiddenClass) p.classList.toggle('hidden', !show);
    });
    container.classList.remove(PANELS_SWITCHING);
    container.style.minHeight = '';
    return;
  }

  container.classList.add(PANELS_SWITCHING);
  const fromHeight = container.offsetHeight;
  container.style.minHeight = `${fromHeight}px`;

  if (current) {
    clearPanelMotionClasses(current);
    current.classList.add(PANEL_LEAVING);
  }

  clearPanelMotionClasses(next);
  next.classList.remove(PANEL_HIDDEN);
  if (useHiddenClass) next.classList.remove('hidden');
  next.classList.add(PANEL_ENTERING);

  await sleep(16);
  next.classList.remove(PANEL_ENTERING);

  const toHeight = next.offsetHeight;
  container.style.minHeight = `${Math.max(fromHeight, toHeight)}px`;

  await sleep(DURATION_MS);

  if (current) {
    current.classList.add(PANEL_HIDDEN);
    current.classList.remove(PANEL_LEAVING);
    if (useHiddenClass) current.classList.add('hidden');
  }

  container.style.minHeight = `${toHeight}px`;
  await sleep(DURATION_MS);

  container.style.minHeight = '';
  container.classList.remove(PANELS_SWITCHING);

  panels.forEach((p) => {
    if (p.getAttribute(panelAttr) !== activeId) {
      clearPanelMotionClasses(p);
      p.classList.add(PANEL_HIDDEN);
      if (useHiddenClass) p.classList.add('hidden');
    }
  });
}
