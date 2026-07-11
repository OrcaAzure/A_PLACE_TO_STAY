/**
 * In-app notification bell — feed from GET /api/notifications.
 */

import { getNotifications } from '/assets/js/services/api.js';
import { createBookingPoll } from '/assets/js/layout/booking-poll.js';

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function levelClass(level) {
  if (level === 'warn') return 'notif-item--warn';
  if (level === 'critical') return 'notif-item--critical';
  return 'notif-item--info';
}

export function renderNotificationItems(items = []) {
  if (!items.length) {
    return '<div class="p-4 text-body-sm text-on-surface-variant text-center">No notifications right now.</div>';
  }

  return items.map((item) => {
    const inner = `
      <div class="notif-item ${levelClass(item.level)} p-4 border-b border-outline-variant/30 hover:bg-surface-container-low/50 flex items-start gap-3">
        <span class="material-symbols-outlined text-[18px] text-on-surface-variant mt-0.5 shrink-0">${escapeHtml(item.icon || 'notifications')}</span>
        <div class="min-w-0">
          <p class="text-body-sm font-medium text-on-surface">${escapeHtml(item.title)}</p>
          <p class="text-[11px] text-on-surface-variant mt-0.5">${escapeHtml(item.subtitle || '')}</p>
        </div>
      </div>`;
    if (item.href) {
      return `<a href="${escapeHtml(item.href)}" class="notif-item-link no-underline text-inherit block">${inner}</a>`;
    }
    return inner;
  }).join('');
}

export function syncNotificationDot(unreadCount = 0, { admin = false } = {}) {
  const selector = admin ? '.admin-notif-dot' : '.guest-notif-dot';
  document.querySelectorAll(selector).forEach((dot) => {
    dot.classList.toggle('hidden', Number(unreadCount) <= 0);
  });
}

export async function refreshNotificationFeed({ admin = false } = {}) {
  const list = document.getElementById('notifications-list');
  if (!list) return null;

  list.innerHTML = '<div class="p-4 text-body-sm text-on-surface-variant text-center">Loading…</div>';

  try {
    const data = await getNotifications();
    list.innerHTML = renderNotificationItems(data.items || []);
    syncNotificationDot(data.unreadCount || 0, { admin });
    return data;
  } catch {
    list.innerHTML = '<div class="p-4 text-body-sm text-error text-center">Could not load notifications.</div>';
    syncNotificationDot(0, { admin });
    return null;
  }
}

export async function syncNotificationDotFromApi({ admin = false } = {}) {
  try {
    const data = await getNotifications();
    syncNotificationDot(data.unreadCount || 0, { admin });
    return data;
  } catch {
    syncNotificationDot(0, { admin });
    return null;
  }
}

let stopPoll = null;
let bellBound = false;

export function bindNotificationBell({ isGuest = false } = {}) {
  if (bellBound) return;
  bellBound = true;
  const admin = !isGuest;
  const btn = document.getElementById('notifications-btn');
  const panel = document.getElementById('notifications-panel');
  const closeBtn = document.getElementById('close-notifications');

  btn?.addEventListener('click', async () => {
    if (!panel) return;
    const opening = panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !opening);
    if (opening) await refreshNotificationFeed({ admin });
  });

  closeBtn?.addEventListener('click', () => {
    panel?.classList.add('hidden');
  });

  syncNotificationDotFromApi({ admin });
  stopPoll?.();
  stopPoll = createBookingPoll(() => syncNotificationDotFromApi({ admin }));

  if (admin) {
    window.addEventListener('booking:updated', () => syncNotificationDotFromApi({ admin: true }));
  } else {
    window.addEventListener('booking:updated', () => syncNotificationDotFromApi({ admin: false }));
  }
}

export function teardownNotificationBell() {
  stopPoll?.();
  stopPoll = null;
  bellBound = false;
}
