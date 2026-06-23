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
  return `<span class="px-2.5 py-1 rounded-full ${map[status] || map.pending} text-[10px] font-bold uppercase tracking-wider">${label}</span>`;
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
    pending: { bg: 'bg-blue-50 text-blue-600', icon: 'person' },
    approved: { bg: 'bg-emerald-50 text-emerald-700', icon: 'verified' },
    rejected: { bg: 'bg-rose-50 text-rose-600', icon: 'cancel' },
    cancelled: { bg: 'bg-slate-50 text-slate-500', icon: 'event_busy' },
  };
  return map[status] || map.pending;
}

export async function loadDashboard() {
  const summary = await getAdminSummary();
  const { kpis, buildingUsage, recentActivity } = summary;

  setText('kpi-upcoming', kpis.upcoming);
  setText('kpi-pending-count', kpis.pending);
  setText('kpi-approved', kpis.approved);
  setText('kpi-approval-rate', `${kpis.approvalRate}% Rate`);
  setText('kpi-total-rooms', kpis.totalRooms);
  setText('kpi-rooms-available-label', `${kpis.availableRooms} available`);
  setText('kpi-occupancy', `${kpis.occupancyPct}%`);
  setText('kpi-maintenance-label', `${kpis.maintenanceRooms} in maint.`);
  setText('kpi-revenue', formatPHP(kpis.paidRevenue));

  renderBuildingChart(buildingUsage);
  renderRecentActivity(recentActivity);
  await renderQueue();
}

function renderBuildingChart(buildingUsage) {
  const mount = document.getElementById('building-chart-mount');
  if (!mount) return;

  if (!buildingUsage?.length) {
    mount.innerHTML = '<p class="text-xs text-slate-400 absolute inset-0 flex items-center justify-center">No building data available.</p>';
    return;
  }

  const max = Math.max(...buildingUsage.map((b) => Number(b.booking_count)), 1);
  const colors = ['bg-blue-600', 'bg-teal-700', 'bg-amber-700', 'bg-blue-400', 'bg-emerald-500', 'bg-slate-400'];

  mount.innerHTML = buildingUsage.map((row, i) => {
    const height = Math.round((Number(row.booking_count) / max) * 140);
    const color = colors[i % colors.length];
    return `
      <div class="flex-1 flex flex-col items-center gap-2 group relative z-10 min-w-0">
        <div class="w-full bg-slate-100/70 rounded-t-lg relative overflow-hidden h-[180px]">
          <div class="chart-bar absolute bottom-0 w-full ${color} rounded-t-lg transition-all duration-1000 ease-out" style="height: 0px;" data-height="${height}px" title="${row.booking_count} approved (30d)"></div>
        </div>
        <span class="text-xs font-semibold text-slate-500 truncate max-w-full px-1">${row.building_name}</span>
        <span class="text-[10px] text-slate-400">${row.booking_count}</span>
      </div>`;
  }).join('');

  mount.querySelectorAll('.chart-bar').forEach((bar) => {
    setTimeout(() => {
      bar.style.height = bar.getAttribute('data-height') || '0px';
    }, 100);
  });
}

function renderRecentActivity(bookingsRaw) {
  const mount = document.getElementById('recent-activity-mount');
  if (!mount) return;

  if (!bookingsRaw?.length) {
    mount.innerHTML = '<p class="text-xs text-slate-400">No recent activity.</p>';
    return;
  }

  mount.innerHTML = bookingsRaw.slice(0, 5).map((b) => {
    const norm = normalizeBooking(b);
    const status = norm.status;
    const { bg, icon } = activityIcon(status);
    const facility = norm.facilityLabel;
    const action = status === 'pending'
      ? `<span class="font-bold text-slate-800">${b.guest_name}</span> requested <span class="font-semibold text-blue-600">${facility}</span>`
      : status === 'approved'
        ? `<span class="font-bold text-slate-800">${b.guest_name}</span> — <span class="font-semibold text-emerald-600">${facility}</span> approved`
        : status === 'rejected'
          ? `<span class="font-bold text-slate-800">Request denied:</span> ${facility} (${b.guest_name})`
          : `<span class="font-bold text-slate-800">${b.guest_name}</span> — ${facility} ${status}`;

    return `
      <div class="flex gap-4">
        <div class="w-9 h-9 rounded-full ${bg} flex items-center justify-center shrink-0">
          <span class="material-symbols-outlined text-[18px]">${icon}</span>
        </div>
        <div>
          <p class="text-xs text-slate-700 leading-normal">${action}</p>
          <p class="text-[10px] text-slate-400 mt-0.5">${relativeTime(b.updated_at || b.created_at)} • ${b.guest_role || 'Guest'}</p>
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
    tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-8 text-center text-xs text-slate-400">No reservations in queue.</td></tr>';
    return;
  }

  tbody.innerHTML = queue.map((b) => {
    const norm = normalizeBooking(b);
    const isPending = norm.status === 'pending';

    return `
      <tr class="hover:bg-slate-50/40 transition-colors" data-booking-id="${b.id}">
        <td class="px-6 py-4">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xs font-bold">${initials(b.guest_name)}</div>
            <span class="text-xs font-semibold text-slate-800">${b.guest_name || 'Unknown'}</span>
          </div>
        </td>
        <td class="px-6 text-xs text-slate-600 py-4">${norm.facilityLabel}</td>
        <td class="px-6 text-xs text-slate-600 py-4">${formatDateRange(norm.startDate, norm.endDate)}</td>
        <td class="px-6 text-xs text-slate-600 py-4">${norm.guestCount || 1}</td>
        <td class="px-6 py-4">${statusPill(norm.status)}</td>
        <td class="px-6 text-right py-4">
          ${isPending ? `
            <div class="flex justify-end gap-1.5">
              <button type="button" class="queue-approve p-1 text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors" title="Approve" data-id="${b.id}">
                <span class="material-symbols-outlined text-[20px]">check_circle</span>
              </button>
              <button type="button" class="queue-reject p-1 text-rose-600 hover:bg-rose-50 rounded-md transition-colors" title="Reject" data-id="${b.id}">
                <span class="material-symbols-outlined text-[20px]">cancel</span>
              </button>
            </div>` : `<span class="text-[10px] text-slate-400">#APT-${b.id}</span>`}
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
