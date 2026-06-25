/**
 * Admin dashboard — loads live KPIs, activity feed, queue, and building chart from /api/stats/summary.
 */

import {
  getAdminSummary, getBookings, getGroups,
  normalizeBooking, normalizeManageRequest, normalizeManageGroupRequest,
} from '/assets/js/services/api.js';
import { approveRequest, rejectRequest } from '/assets/js/features/booking-actions.js';
import { normStatus } from '/assets/js/features/reservation-shared.js';
import { animateStatCards, animateChartBars, staggerReveal, animateCountUp } from '/assets/js/layout/animations.js';

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function formatPHP(amount) {
  return `₱${Number(amount || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
}

function dateOnly(value) {
  return String(value || '').slice(0, 10);
}

function initials(name) {
  if (!name) return '?';
  return name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

function formatDateRange(start, end) {
  const opts = { month: 'short', day: 'numeric', year: 'numeric' };
  const a = new Date(`${dateOnly(start)}T00:00:00`).toLocaleDateString('en-US', opts);
  const b = new Date(`${dateOnly(end)}T00:00:00`).toLocaleDateString('en-US', opts);
  return `${a} – ${b}`;
}

function statusPill(status) {
  const s = normStatus(status);
  const map = {
    pending: 'bg-amber-50 text-amber-700',
    approved: 'bg-emerald-50 text-emerald-700',
    rejected: 'bg-rose-50 text-rose-600',
    cancelled: 'bg-slate-100 text-slate-500',
  };
  const label = s.charAt(0).toUpperCase() + s.slice(1);
  return `<span class="px-3 py-1 rounded-full ${map[s] || map.pending} text-xs font-bold uppercase tracking-wide">${label}</span>`;
}

function relativeTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function activityIcon(status) {
  const s = normStatus(status);
  const map = {
    pending: { bg: 'bg-primary/10 text-primary', icon: 'person' },
    approved: { bg: 'bg-emerald-50 text-emerald-700', icon: 'verified' },
    rejected: { bg: 'bg-rose-50 text-rose-600', icon: 'cancel' },
    cancelled: { bg: 'bg-slate-50 text-slate-500', icon: 'event_busy' },
  };
  return map[s] || map.pending;
}

function facilityLabelForBooking(b) {
  const norm = normalizeBooking(b);
  if (norm.facilityLabel && norm.facilityLabel !== `Booking #${norm.id}`) return norm.facilityLabel;
  if (b.room_number || b.building_name) {
    return [b.building_name, b.room_number].filter(Boolean).join(' ') || 'Room pending';
  }
  return 'Room not assigned yet';
}

function buildQueueItems(bookingsRaw, groupsRaw) {
  const today = dateOnly(new Date());

  const singles = (bookingsRaw || [])
    .filter((b) => !b.group_id)
    .filter((b) => {
      const s = normStatus(b.status);
      if (s === 'pending') return true;
      if (s === 'approved' && dateOnly(b.check_out) >= today) return true;
      return false;
    })
    .map((b) => ({
      key: `b-${b.id}`,
      type: 'single',
      raw: b,
      sortDate: dateOnly(b.check_in),
      pending: normStatus(b.status) === 'pending',
      name: b.guest_name || 'Unknown guest',
      facility: facilityLabelForBooking(b),
      checkIn: b.check_in,
      checkOut: b.check_out,
      guests: b.guest_count || 1,
      status: b.status,
    }));

  const groups = (groupsRaw || [])
    .filter((g) => {
      const s = normStatus(g.status);
      if (s === 'pending') return true;
      if (s === 'approved' && dateOnly(g.check_out) >= today) return true;
      return false;
    })
    .map((g) => ({
      key: `g-${g.id}`,
      type: 'group',
      raw: g,
      sortDate: dateOnly(g.check_in),
      pending: normStatus(g.status) === 'pending',
      name: g.group_name || g.contact_name || 'Group stay',
      facility: `Group · ${g.rooms_requested ?? '?'} rooms`,
      checkIn: g.check_in,
      checkOut: g.check_out,
      guests: g.total_guests || 1,
      status: g.status,
    }));

  return [...singles, ...groups]
    .sort((a, b) => {
      if (a.pending !== b.pending) return a.pending ? -1 : 1;
      return a.sortDate.localeCompare(b.sortDate);
    })
    .slice(0, 12);
}

export async function loadDashboard() {
  const summary = await getAdminSummary();
  const { kpis, buildingUsage, recentActivity } = summary;

  setText('kpi-upcoming-label', 'Live');
  setText('kpi-rooms-available-label', `${kpis.availableRooms} available`);
  setText('kpi-maintenance-label', `${kpis.maintenanceRooms} in maint.`);
  setText('kpi-approval-rate', `${kpis.approvalRate}% Rate`);

  await animateStatCards();

  await Promise.all([
    animateCountUp(document.getElementById('kpi-upcoming'), String(kpis.upcoming)),
    animateCountUp(document.getElementById('kpi-pending-count'), String(kpis.pending)),
    animateCountUp(document.getElementById('kpi-approved'), String(kpis.approved)),
    animateCountUp(document.getElementById('kpi-total-rooms'), String(kpis.totalRooms)),
    animateCountUp(document.getElementById('kpi-occupancy'), `${kpis.occupancyPct}%`),
    animateCountUp(document.getElementById('kpi-revenue'), formatPHP(kpis.paidRevenue)),
  ]);

  await renderBuildingChart(buildingUsage);
  renderRecentActivity(recentActivity);
  await renderQueue();

  setText('chart-period-label', 'Last 30 days · approved bookings');
}

async function renderBuildingChart(buildingUsage) {
  const mount = document.getElementById('building-chart-mount');
  if (!mount) return;

  if (!buildingUsage?.length) {
    mount.innerHTML = '<p class="text-body-sm text-on-surface-variant absolute inset-0 flex items-center justify-center">No building data available.</p>';
    return;
  }

  const max = Math.max(...buildingUsage.map((b) => Number(b.booking_count)), 1);
  const colors = ['bg-primary', 'bg-primary-container', 'bg-secondary', 'bg-blue-400', 'bg-emerald-600', 'bg-neutral'];

  mount.innerHTML = buildingUsage.map((row, i) => {
    const height = Math.round((Number(row.booking_count) / max) * 140);
    const color = colors[i % colors.length];
    return `
      <div class="flex-1 flex flex-col items-center gap-2 group relative z-10 min-w-0">
        <div class="w-full bg-surface-container rounded-t-lg relative overflow-hidden h-[180px]">
          <div class="chart-bar absolute bottom-0 w-full ${color} rounded-t-lg" style="height: 0px;" data-height="${height}px" title="${row.booking_count} approved (30d)"></div>
        </div>
        <span class="text-body-sm font-semibold text-on-surface-variant truncate max-w-full px-1">${row.building_name}</span>
        <span class="text-body-sm text-on-surface-variant">${row.booking_count}</span>
      </div>`;
  }).join('');

  await animateChartBars('.chart-bar', mount);
}

function renderRecentActivity(bookingsRaw) {
  const mount = document.getElementById('recent-activity-mount');
  if (!mount) return;

  if (!bookingsRaw?.length) {
    mount.innerHTML = '<p class="text-body-sm text-on-surface-variant">No recent activity.</p>';
    return;
  }

  mount.innerHTML = bookingsRaw.slice(0, 5).map((b) => {
    const status = normStatus(b.status);
    const { bg, icon } = activityIcon(status);
    const facility = facilityLabelForBooking(b);
    const action = status === 'pending'
      ? `<span class="font-bold text-on-surface">${b.guest_name}</span> requested <span class="font-semibold text-primary">${facility}</span>`
      : status === 'approved'
        ? `<span class="font-bold text-on-surface">${b.guest_name}</span> — <span class="font-semibold text-emerald-700">${facility}</span> approved`
        : status === 'rejected'
          ? `<span class="font-bold text-on-surface">Request denied:</span> ${facility} (${b.guest_name})`
          : `<span class="font-bold text-on-surface">${b.guest_name}</span> — ${facility} ${status}`;

    return `
      <div class="flex gap-4">
        <div class="w-11 h-11 rounded-full ${bg} flex items-center justify-center shrink-0">
          <span class="material-symbols-outlined text-[1.35rem]">${icon}</span>
        </div>
        <div>
          <p class="text-body-sm text-on-surface leading-relaxed">${action}</p>
          <p class="text-body-sm text-on-surface-variant mt-1">${relativeTime(b.updated_at || b.created_at)} · ${b.guest_role || 'Guest'}</p>
        </div>
      </div>`;
  }).join('');

  staggerReveal('#recent-activity-mount > div', document).catch(() => {});
}

async function renderQueue() {
  const tbody = document.getElementById('queue-tbody');
  if (!tbody) return;

  const [bookingsRaw, groupsRaw] = await Promise.all([getBookings(), getGroups()]);
  const queue = buildQueueItems(bookingsRaw, groupsRaw);

  if (!queue.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-on-surface-variant">No pending or upcoming reservations right now.</td></tr>';
    return;
  }

  tbody.innerHTML = queue.map((item) => {
    const isPending = item.pending;
    const typeBadge = item.type === 'group'
      ? '<span class="ml-2 text-[10px] font-bold uppercase tracking-wide text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full">Group</span>'
      : '';

    return `
      <tr class="hover:bg-surface-container-low transition-colors" data-queue-key="${item.key}">
        <td>
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">${initials(item.name)}</div>
            <span class="text-body-sm font-semibold text-on-surface">${item.name}${typeBadge}</span>
          </div>
        </td>
        <td class="text-body-sm text-on-surface-variant">${item.facility}</td>
        <td class="text-body-sm text-on-surface-variant whitespace-nowrap">${formatDateRange(item.checkIn, item.checkOut)}</td>
        <td class="text-body-sm text-on-surface-variant">${item.guests}</td>
        <td>${statusPill(item.status)}</td>
        <td class="text-right">
          ${isPending ? `
            <div class="flex justify-end gap-2">
              <button type="button" class="queue-approve p-2 min-h-[2.75rem] min-w-[2.75rem] text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors" title="Approve" aria-label="Approve" data-queue-key="${item.key}">
                <span class="material-symbols-outlined text-[1.35rem]">check_circle</span>
              </button>
              <button type="button" class="queue-reject p-2 min-h-[2.75rem] min-w-[2.75rem] text-secondary hover:bg-secondary/10 rounded-lg transition-colors" title="Decline" aria-label="Decline" data-queue-key="${item.key}">
                <span class="material-symbols-outlined text-[1.35rem]">cancel</span>
              </button>
            </div>` : `<span class="text-body-sm text-on-surface-variant font-mono">${item.type === 'group' ? `#GRP-${item.raw.id}` : `#APT-${item.raw.id}`}</span>`}
        </td>
      </tr>`;
  }).join('');

  const queueByKey = Object.fromEntries(queue.map((q) => [q.key, q]));

  tbody.querySelectorAll('.queue-approve').forEach((btn) => {
    btn.addEventListener('click', () => handleQueueApprove(queueByKey[btn.dataset.queueKey]));
  });
  tbody.querySelectorAll('.queue-reject').forEach((btn) => {
    btn.addEventListener('click', () => handleQueueReject(queueByKey[btn.dataset.queueKey]));
  });
}

async function handleQueueApprove(item) {
  if (!item) return;
  try {
    const request = item.type === 'group'
      ? normalizeManageGroupRequest(item.raw)
      : normalizeManageRequest(item.raw);
    await approveRequest(request);
    await loadDashboard();
    window.dispatchEvent(new CustomEvent('booking:updated'));
  } catch (err) {
    alert(err.message || 'Could not approve this request.');
  }
}

async function handleQueueReject(item) {
  if (!item) return;
  const name = item.name;
  if (!window.confirm(`Decline this request for ${name}?`)) return;
  try {
    const request = item.type === 'group'
      ? normalizeManageGroupRequest(item.raw)
      : normalizeManageRequest(item.raw);
    await rejectRequest(request, '');
    await loadDashboard();
    window.dispatchEvent(new CustomEvent('booking:updated'));
  } catch (err) {
    alert(err.message || 'Could not decline this request.');
  }
}
