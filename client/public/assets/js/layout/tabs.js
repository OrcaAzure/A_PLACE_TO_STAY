/**
 * Tab switching for guest & admin surfaces (instant, no animation).
 */

const TAB_BTN_ACTIVE = 'app-tab-active';
const PANEL_HIDDEN = 'is-tab-hidden';

function setTabButtonsActive(tabs, activeId, tabAttr) {
  tabs.forEach((tab) => {
    const active = tab.getAttribute(tabAttr) === activeId;
    tab.classList.toggle(TAB_BTN_ACTIVE, active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
    if (active) tab.setAttribute('tabindex', '0');
    else tab.setAttribute('tabindex', '-1');
  });
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

/** Instantly show the selected tab panel. */
export function switchTabPanel({
  tabs,
  panels,
  activeId,
  tabAttr = 'data-app-tab',
  panelAttr = 'data-app-panel',
  useHiddenClass = true,
}) {
  const next = [...panels].find((p) => p.getAttribute(panelAttr) === activeId);
  if (!next) return;

  const current = [...panels].find((p) => !p.classList.contains(PANEL_HIDDEN) && !p.classList.contains('hidden'));
  if (current === next) return;

  setTabButtonsActive(tabs, activeId, tabAttr);

  panels.forEach((p) => {
    const show = p.getAttribute(panelAttr) === activeId;
    p.classList.toggle(PANEL_HIDDEN, !show);
    if (useHiddenClass) p.classList.toggle('hidden', !show);
  });
}
