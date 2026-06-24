/**
 * Smooth, responsive tab switching for guest & admin surfaces.
 */

import { prefersReducedMotion } from '/assets/js/layout/animations.js';

const TAB_BTN_ACTIVE = 'app-tab-active';
const PANEL_HIDDEN = 'is-tab-hidden';
const PANEL_LEAVING = 'is-tab-leaving';
const PANEL_ENTERING = 'is-tab-entering';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setTabButtonsActive(tabs, activeId, tabAttr) {
  tabs.forEach((tab) => {
    const active = tab.getAttribute(tabAttr) === activeId;
    tab.classList.toggle(TAB_BTN_ACTIVE, active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
    if (active) tab.setAttribute('tabindex', '0');
    else tab.setAttribute('tabindex', '-1');
  });
}

function findVisiblePanel(panels) {
  return [...panels].find((p) => !p.classList.contains(PANEL_HIDDEN) && !p.classList.contains('hidden'));
}

/**
 * @param {object} options
 * @param {ParentNode} [options.root]
 * @param {string} [options.tabAttr] - attribute on tab buttons, default data-app-tab
 * @param {string} [options.panelAttr] - attribute on panels, default data-app-panel
 * @param {string} [options.tabsSelector] - optional container selector for tab bar
 * @param {string} [options.panelsSelector] - optional container selector for panels
 * @param {boolean} [options.useHiddenClass] - also toggle Tailwind `hidden` (legacy panels)
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

  const switchTo = (id) => switchTabPanel({
    tabs,
    panels,
    activeId: id,
    tabAttr,
    panelAttr,
    useHiddenClass,
  });

  tabs.forEach((tab) => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      switchTo(tab.getAttribute(tabAttr));
    });
  });

  return { switchTo, tabs, panels };
}

/**
 * Crossfade between tab panels with hover-friendly tab button states.
 */
export async function switchTabPanel({
  tabs,
  panels,
  activeId,
  tabAttr = 'data-app-tab',
  panelAttr = 'data-app-panel',
  useHiddenClass = true,
}) {
  const next = [...panels].find((p) => p.getAttribute(panelAttr) === activeId);
  if (!next) return;

  const current = findVisiblePanel(panels);
  if (current === next) return;

  setTabButtonsActive(tabs, activeId, tabAttr);

  if (prefersReducedMotion()) {
    panels.forEach((p) => {
      const show = p.getAttribute(panelAttr) === activeId;
      p.classList.toggle(PANEL_HIDDEN, !show);
      if (useHiddenClass) p.classList.toggle('hidden', !show);
    });
    return;
  }

  const duration = 320;

  if (current) {
    current.classList.add(PANEL_LEAVING);
    await sleep(duration);
    current.classList.add(PANEL_HIDDEN);
    current.classList.remove(PANEL_LEAVING);
    if (useHiddenClass) current.classList.add('hidden');
  }

  next.classList.remove(PANEL_HIDDEN);
  if (useHiddenClass) next.classList.remove('hidden');
  next.classList.add(PANEL_ENTERING);
  await sleep(20);
  next.classList.remove(PANEL_ENTERING);

  panels.forEach((p) => {
    if (p !== next) {
      p.classList.add(PANEL_HIDDEN);
      if (useHiddenClass) p.classList.add('hidden');
    }
  });
}
