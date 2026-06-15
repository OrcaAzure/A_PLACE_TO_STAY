/**
 * AptSpace UI Shell — layout injection + UI chrome only (no API/auth logic)
 */

const ADMIN_NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', href: './dashboard.html' },
  { id: 'reservations', label: 'Reservations', icon: 'calendar_month', href: './reservations.html' },
  { id: 'facilities', label: 'Facilities', icon: 'domain', href: './facilities.html' },
  { id: 'residents', label: 'Residents', icon: 'groups', href: './residents.html' },
  { id: 'payments', label: 'Payments', icon: 'payments', href: './payments.html' },
  { id: 'reports', label: 'Reports', icon: 'assessment', href: './reports.html' },
  { id: 'settings', label: 'Settings', icon: 'settings', href: './settings.html' },
];

const PROPERTY_NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', href: './dashboard.html' },
  { id: 'properties', label: 'Properties', icon: 'apartment', href: './properties.html' },
  { id: 'units', label: 'Units', icon: 'door_front', href: './units.html' },
  { id: 'occupancy', label: 'Occupancy', icon: 'hotel', href: './occupancy.html' },
  { id: 'maintenance', label: 'Maintenance', icon: 'build', href: './maintenance.html' },
  { id: 'projects', label: 'Projects', icon: 'engineering', href: './projects.html' },
  { id: 'budgets', label: 'Budgets', icon: 'account_balance', href: './budgets.html' },
  { id: 'analytics', label: 'Analytics', icon: 'analytics', href: './analytics.html' },
];

function assetBase() {
  return window.location.pathname.includes('/admin/') || window.location.pathname.includes('/property/')
    ? '../'
    : './';
}

async function loadPartial(url) {
  const res = await fetch(url);
  return res.text();
}

function navHtml(items, active) {
  return items.map((item) => {
    const cls = item.id === active
      ? 'flex items-center gap-md px-md py-sm transition-colors duration-200 text-primary font-bold bg-primary-container/10 rounded-lg'
      : 'flex items-center gap-md px-md py-sm transition-colors duration-200 hover:bg-surface-variant/50 text-on-surface-variant rounded-lg';
    return `<a class="${cls}" href="${item.href}"><span class="material-symbols-outlined">${item.icon}</span><span class="font-body-md">${item.label}</span></a>`;
  }).join('');
}

export async function initShell({ portal = 'admin', active = 'dashboard', title = 'Mission Control', subtitle = 'Operations Center' } = {}) {
  const base = assetBase();
  const nav = portal === 'property' ? PROPERTY_NAV : ADMIN_NAV;
  const portalLabel = portal === 'admin' ? 'Seminary Admin' : 'Property Management';
  const swapHref = portal === 'admin' ? `${base}property/dashboard.html` : `${base}admin/dashboard.html`;
  const swapLabel = portal === 'admin' ? 'Property Portal' : 'Admin Portal';
  const quickReserveHref = portal === 'admin' ? './reservations.html' : './dashboard.html';

  const saved = document.getElementById('page-content')?.innerHTML || '';

  const [sidebar, header, drawer, modal, notifications] = await Promise.all([
    loadPartial(`${base}components/sidebar.html`),
    loadPartial(`${base}components/header.html`),
    loadPartial(`${base}components/drawer.html`),
    loadPartial(`${base}components/modal.html`),
    loadPartial(`${base}components/notifications.html`),
  ]);

  document.body.className = 'bg-[#f1f5f9] text-on-surface font-body-md h-screen overflow-hidden flex relative';

  document.body.innerHTML = `
    ${sidebar
      .replace('{{NAV_ITEMS}}', navHtml(nav, active))
      .replace('{{PORTAL_LABEL}}', portalLabel)
      .replace('{{QUICK_RESERVE_HREF}}', quickReserveHref)
      .replace('{{SWAP_HREF}}', swapHref)
      .replace('{{SWAP_LABEL}}', swapLabel)}
    <main class="flex-1 flex flex-col overflow-hidden h-full">
      ${header
        .replace('{{TITLE}}', title)
        .replace('{{SUBTITLE}}', subtitle)
        .replace('{{USER_NAME}}', 'Admin User')
        .replace('{{USER_ROLE}}', 'Ops Commander')
        .replace('{{USER_INITIAL}}', 'A')}
      <div id="page-content" class="flex-1 overflow-y-auto p-6 space-y-6">${saved}</div>
    </main>
    ${drawer}
    ${modal}
    ${notifications}
    <div id="sidebar-overlay" class="hidden fixed inset-0 bg-black/40 z-[45]"></div>
  `;

  bindChrome();
}

function bindChrome() {
  document.getElementById('drawer-close')?.addEventListener('click', closeDrawer);
  document.getElementById('drawerOverlay')?.addEventListener('click', closeDrawer);
  document.getElementById('modal-close')?.addEventListener('click', closeModal);
  document.getElementById('modal-overlay')?.addEventListener('click', closeModal);
  document.getElementById('notifications-btn')?.addEventListener('click', () => {
    document.getElementById('notifications-panel')?.classList.toggle('hidden');
  });
  document.getElementById('close-notifications')?.addEventListener('click', () => {
    document.getElementById('notifications-panel')?.classList.add('hidden');
  });
  document.getElementById('menu-toggle')?.addEventListener('click', () => {
    document.getElementById('app-sidebar')?.classList.add('sidebar-open');
    document.getElementById('sidebar-overlay')?.classList.remove('hidden');
  });
  document.getElementById('sidebar-overlay')?.addEventListener('click', () => {
    document.getElementById('app-sidebar')?.classList.remove('sidebar-open');
    document.getElementById('sidebar-overlay')?.classList.add('hidden');
  });
  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-tab');
      document.querySelectorAll('[data-tab]').forEach((b) => {
        const on = b.getAttribute('data-tab') === id;
        b.classList.toggle('border-primary', on);
        b.classList.toggle('text-primary', on);
        b.classList.toggle('border-transparent', !on);
        b.classList.toggle('text-on-surface-variant', !on);
      });
      document.querySelectorAll('[data-tab-content]').forEach((el) => {
        el.classList.toggle('hidden', el.getAttribute('data-tab-content') !== id);
      });
    });
  });
  document.querySelectorAll('[data-open-drawer]').forEach((el) => {
    el.addEventListener('click', () => {
      openDrawer(el.dataset.drawerId || '#APT-0000', el.dataset.drawerTitle || 'Details');
    });
  });
  const scrollers = document.querySelectorAll('.timeline-scroll');
  scrollers.forEach((c) => {
    c.addEventListener('scroll', () => {
      scrollers.forEach((o) => { if (o !== c) o.scrollLeft = c.scrollLeft; });
    });
  });
  if (scrollers.length) {
    scrollers.forEach((c) => { c.scrollLeft = 80 * 7; });
  }
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeDrawer(); closeModal(); }
  });
}

export function openDrawer(id, title) {
  document.getElementById('drawerID').textContent = id;
  document.getElementById('drawerTitle').textContent = title;
  document.getElementById('managementDrawer')?.classList.remove('translate-x-full');
  document.getElementById('drawerOverlay')?.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

export function closeDrawer() {
  document.getElementById('managementDrawer')?.classList.add('translate-x-full');
  document.getElementById('drawerOverlay')?.classList.add('hidden');
  document.body.style.overflow = '';
}

export function closeModal() {
  document.getElementById('app-modal')?.classList.add('hidden');
  document.getElementById('modal-overlay')?.classList.add('hidden');
}
