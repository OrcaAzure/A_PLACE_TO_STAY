/**
 * Admin dashboard — loads live KPIs, activity feed, queue, and building chart from /api/stats/summary.
 */

import { getAdminSummary, getBookings, updateBooking, normalizeBooking } from '/assets/js/services/api.js';

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function formatPHP(amount) {
  return `₱${Number(amount || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
}

function initials(name) {
  if (!name) return '?';
  return name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

function formatDateRange(start, end) {
  const opts = { month: 'short', day: 'numeric', year: 'numeric' };
  const a = new Date(`${start}T00:00:00`).toLocaleDateString('en-US', opts);
  const b = new Date(`${end}T00:00:00`).toLocaleDateString('en-US', opts);
  return `${a} – ${b}`;
}

function statusPill(status) {
  const map = {
    pending: 'bg-amber-50 text-amber-700',
    approved: 'bg-emerald-50 text-emerald-700',
    rejected: 'bg-rose-50 text-rose-600',
    cancelled: 'bg-slate-100 text-slate-500',
  };
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return `<span class="px-3 py-1 rounded-full ${map[status] || map.pending} text-xs font-bold uppercase tracking-wide">${label}</span>`;
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
  const map = {
    pending: { bg: 'bg-primary/10 text-primary', icon: 'person' },
    approved: { bg: 'bg-emerald-50 text-emerald-700', icon: 'verified' },
    rejected: { bg: 'bg-rose-50 text-rose-600', icon: 'cancel' },
    cancelled: { bg: 'bg-slate-50 text-slate-500', icon: 'event_busy' },
  };
  return map[status] || map.pending;
}

export async function loadDashboard() {
  const summary = await getAdminSummary();
  const { kpis, buildingUsage, recentActivity } = summary;

  setText('kpi-upcoming-label', 'Live');
  setText('kpi-rooms-available-label', `${kpis.availableRooms} available`);
  setText('kpi-maintenance-label', `${kpis.maintenanceRooms} in maint.`);
  setText('kpi-approval-rate', `${kpis.approvalRate}% Rate`);

  await Promise.all([
    (async () => { document.getElementById('kpi-upcoming') && (document.getElementById('kpi-upcoming').textContent = String(kpis.upcoming)); })(),
    (async () => { document.getElementById('kpi-pending-count') && (document.getElementById('kpi-pending-count').textContent = String(kpis.pending)); })(),
    (async () => { document.getElementById('kpi-approved') && (document.getElementById('kpi-approved').textContent = String(kpis.approved)); })(),
    (async () => { document.getElementById('kpi-total-rooms') && (document.getElementById('kpi-total-rooms').textContent = String(kpis.totalRooms)); })(),
    (async () => { document.getElementById('kpi-occupancy') && (document.getElementById('kpi-occupancy').textContent = `${kpis.occupancyPct}%`); })(),
    (async () => { document.getElementById('kpi-revenue') && (document.getElementById('kpi-revenue').textContent = formatPHP(kpis.paidRevenue)); })(),
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
          <div class="chart-bar absolute bottom-0 w-full ${color} rounded-t-lg" style="height: ${height}px;" title="${row.booking_count} approved (30d)"></div>
        </div>
        <span class="text-body-sm font-semibold text-on-surface-variant truncate max-w-full px-1">${row.building_name}</span>
        <span class="text-body-sm text-on-surface-variant">${row.booking_count}</span>
      </div>`;
  }).join('');
}

function renderRecentActivity(bookingsRaw) {
  const mount = document.getElementById('recent-activity-mount');
  if (!mount) return;

  if (!bookingsRaw?.length) {
    mount.innerHTML = '<p class="text-body-sm text-on-surface-variant">No recent activity.</p>';
    return;
  }

  mount.innerHTML = bookingsRaw.slice(0, 5).map((b) => {
    const norm = normalizeBooking(b);
    const status = norm.status;
    const { bg, icon } = activityIcon(status);
    const facility = norm.facilityLabel;
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
}

async function renderQueue() {
  const tbody = document.getElementById('queue-tbody');
  if (!tbody) return;

  const bookingsRaw = await getBookings();
  const queue = bookingsRaw
    .filter((b) => ['Pending', 'Approved'].includes(b.status))
    .sort((a, b) => new Date(a.check_in) - new Date(b.check_in))
    .slice(0, 10);

  if (!queue.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-on-surface-variant">No reservations in queue.</td></tr>';
    return;
  }

  tbody.innerHTML = queue.map((b) => {
    const norm = normalizeBooking(b);
    const isPending = norm.status === 'pending';

    return `
      <tr class="hover:bg-surface-container-low transition-colors" data-booking-id="${b.id}">
        <td>
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">${initials(b.guest_name)}</div>
            <span class="text-body-sm font-semibold text-on-surface">${b.guest_name || 'Unknown'}</span>
          </div>
        </td>
        <td class="text-body-sm text-on-surface-variant">${norm.facilityLabel}</td>
        <td class="text-body-sm text-on-surface-variant">${formatDateRange(norm.startDate, norm.endDate)}</td>
        <td class="text-body-sm text-on-surface-variant">${norm.guestCount || 1}</td>
        <td>${statusPill(norm.status)}</td>
        <td class="text-right">
          ${isPending ? `
            <div class="flex justify-end gap-2">
              <button type="button" class="queue-approve p-2 min-h-[2.75rem] min-w-[2.75rem] text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors" title="Approve booking" aria-label="Approve" data-id="${b.id}">
                <span class="material-symbols-outlined text-[1.35rem]">check_circle</span>
              </button>
              <button type="button" class="queue-reject p-2 min-h-[2.75rem] min-w-[2.75rem] text-secondary hover:bg-secondary/10 rounded-lg transition-colors" title="Reject booking" aria-label="Reject" data-id="${b.id}">
                <span class="material-symbols-outlined text-[1.35rem]">cancel</span>
              </button>
            </div>` : `<span class="text-body-sm text-on-surface-variant">#APT-${b.id}</span>`}
        </td>
      </tr>`;
  }).join('');

  tbody.querySelectorAll('.queue-approve').forEach((btn) => {
    btn.addEventListener('click', () => handleQueueAction(btn.dataset.id, 'Approved'));
  });
  tbody.querySelectorAll('.queue-reject').forEach((btn) => {
    btn.addEventListener('click', () => handleQueueAction(btn.dataset.id, 'Rejected'));
  });
}

async function handleQueueAction(id, status) {
  try {
    await updateBooking(id, { status });
    await loadDashboard();
    window.dispatchEvent(new CustomEvent('booking:updated'));
  } catch (err) {
    alert(err.message || 'Action failed');
  }
}
