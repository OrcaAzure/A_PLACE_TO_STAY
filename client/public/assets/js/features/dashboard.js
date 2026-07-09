/**
 * Admin dashboard — KPIs, activity feed, action queue, and building chart.
 */

import {
  getAdminSummary, getBookings, getGroups,
  normalizeBooking, normalizeManageRequest, normalizeManageGroupRequest,
} from '/assets/js/services/api.js';
import { approveRequest, rejectRequest } from '/assets/js/features/booking-actions.js';
import { showAlertModal } from '/assets/js/layout/ui.js';
import { normStatus, escapeHtml, stayNights, formatDateLong } from '/assets/js/features/reservation-shared.js';
import { animateStatCards, animateChartBars, staggerReveal, animateCountUp, revealPageContent } from '/assets/js/layout/animations.js';

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function formatPHP(amount) {
  return `₱${Number(amount || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
}

function dateOnly(value) {
  if (!value) return '';
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function initials(name) {
  if (!name) return '?';
  return name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

function formatDateRange(start, end) {
  const a = formatDateLong(dateOnly(start));
  const b = formatDateLong(dateOnly(end));
  return `${a} – ${b}`;
}

function statusPill(status) {
  const s = normStatus(status);
  const map = {
    pending: 'dashboard-pill dashboard-pill--pending',
    approved: 'dashboard-pill dashboard-pill--approved',
    rejected: 'dashboard-pill dashboard-pill--rejected',
    cancelled: 'dashboard-pill dashboard-pill--cancelled',
  };
  const label = s.charAt(0).toUpperCase() + s.slice(1);
  return `<span class="${map[s] || map.pending}">${escapeHtml(label)}</span>`;
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
  if (b.kind === 'venue' || b.facility_name) {
    return [b.facility_category, b.facility_name].filter(Boolean).join(' — ') || 'Venue space';
  }
  const norm = normalizeBooking(b);
  if (norm.facilityLabel && norm.facilityLabel !== `Booking #${norm.id}`) return norm.facilityLabel;
  if (b.room_number || b.building_name) {
    return b.room_number ? `Room ${b.room_number}` : (b.building_name || 'Room pending');
  }
  return 'Room not assigned yet';
}

function activityDateLabel(b) {
  if (b.kind === 'venue' || b.event_date) {
    return formatDateLong(String(b.event_date).slice(0, 10));
  }
  return formatDateRange(b.check_in, b.check_out);
}

function activityActionText(b, status, facility) {
  const name = escapeHtml(b.guest_name || 'Guest');
  const place = escapeHtml(facility);
  const dates = escapeHtml(activityDateLabel(b));
  if (status === 'pending') {
    return `<span class="font-bold text-on-surface">${name}</span> requested <span class="font-semibold text-primary">${place}</span>`;
  }
  if (status === 'approved') {
    return `<span class="font-bold text-on-surface">${name}</span> — <span class="font-semibold text-emerald-700">${place}</span> approved`;
  }
  if (status === 'cancelled') {
    return `<span class="font-bold text-on-surface">${name}</span> cancelled <span class="font-semibold text-slate-600 line-through">${place}</span> <span class="text-on-surface-variant">(${dates})</span>`;
  }
  if (status === 'rejected') {
    return `<span class="font-bold text-on-surface">Request denied:</span> ${place} (${name})`;
  }
  return `<span class="font-bold text-on-surface">${name}</span> — ${place} ${escapeHtml(status)}`;
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
      submittedAt: b.created_at || b.updated_at,
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
      role: 'Group',
      facility: `${g.rooms_requested ?? '?'} rooms requested`,
      checkIn: g.check_in,
      checkOut: g.check_out,
      guests: g.total_guests || 1,
      status: g.status,
      submittedAt: g.created_at || g.updated_at,
    }));

  return [...singles, ...groups]
    .sort((a, b) => {
      if (a.pending !== b.pending) return a.pending ? -1 : 1;
      return a.sortDate.localeCompare(b.sortDate);
    });
}

function renderQueueItem(item) {
  const nights = stayNights(item.checkIn, item.checkOut);

  return `
    <article class="dashboard-queue-item${item.pending ? ' is-pending' : ''}" data-queue-key="${escapeHtml(item.key)}">
      <div class="dashboard-queue-item__main">
        <div class="dashboard-queue-item__avatar" aria-hidden="true">${escapeHtml(initials(item.name))}</div>
        <div class="dashboard-queue-item__body">
          <div class="dashboard-queue-item__head">
            <h3 class="dashboard-queue-item__name">${escapeHtml(item.name)}</h3>
            ${statusPill(item.status)}
          </div>
          <p class="dashboard-queue-item__facility">
            <span class="material-symbols-outlined" aria-hidden="true">meeting_room</span>
            ${escapeHtml(item.facility)}
          </p>
          <div class="dashboard-queue-item__meta">
            <span><span class="material-symbols-outlined" aria-hidden="true">calendar_month</span>${escapeHtml(formatDateRange(item.checkIn, item.checkOut))}</span>
            <span><span class="material-symbols-outlined" aria-hidden="true">group</span>${escapeHtml(String(item.guests))} guest${item.guests === 1 ? '' : 's'}${nights ? ` · ${nights} night${nights === 1 ? '' : 's'}` : ''}</span>
          </div>
        </div>
      </div>
      <div class="dashboard-queue-item__actions">
        ${item.pending ? `
          <button type="button" class="dashboard-queue-btn dashboard-queue-btn--approve queue-approve" data-queue-key="${escapeHtml(item.key)}" title="Approve request">
            <span class="material-symbols-outlined" aria-hidden="true">check_circle</span>
            Approve
          </button>
          <button type="button" class="dashboard-queue-btn dashboard-queue-btn--decline queue-reject" data-queue-key="${escapeHtml(item.key)}" title="Decline request">
            <span class="material-symbols-outlined" aria-hidden="true">cancel</span>
            Decline
          </button>
          <a href="reservations.html" class="dashboard-queue-btn dashboard-queue-btn--ghost">Review</a>
        ` : `
          <span class="dashboard-queue-item__upcoming-label">Upcoming stay</span>
          <a href="reservations.html" class="dashboard-queue-btn dashboard-queue-btn--ghost">View</a>
        `}
      </div>
    </article>`;
}

export async function loadDashboard({ background = false } = {}) {
  const summary = await getAdminSummary();
  const { kpis, bookingUsage, recentActivity } = summary;

  setText('kpi-upcoming-label', 'Approved');
  setText('kpi-rooms-available-label', `${kpis.availableRooms} ready`);
  setText('kpi-maintenance-label', `${kpis.maintenanceRooms} in repair`);
  setText('kpi-approval-rate', `${kpis.approvalRate}% rate`);

  if (background) {
    setText('kpi-upcoming', String(kpis.upcoming));
    setText('kpi-pending-count', String(kpis.pending));
    setText('kpi-approved', String(kpis.approved));
    setText('kpi-total-rooms', String(kpis.totalRooms));
    setText('kpi-occupancy', `${kpis.occupancyPct}%`);
    setText('kpi-revenue', formatPHP(kpis.paidRevenue));
    await renderBookingUsageChart(bookingUsage);
    renderRecentActivity(recentActivity);
    setText('chart-period-label', 'Last 30 days · rooms & venues');
    return;
  }

  await animateStatCards();

  await Promise.all([
    animateCountUp(document.getElementById('kpi-upcoming'), String(kpis.upcoming)),
    animateCountUp(document.getElementById('kpi-pending-count'), String(kpis.pending)),
    animateCountUp(document.getElementById('kpi-approved'), String(kpis.approved)),
    animateCountUp(document.getElementById('kpi-total-rooms'), String(kpis.totalRooms)),
    animateCountUp(document.getElementById('kpi-occupancy'), `${kpis.occupancyPct}%`),
    animateCountUp(document.getElementById('kpi-revenue'), formatPHP(kpis.paidRevenue)),
  ]);

  await renderBookingUsageChart(bookingUsage);
  renderRecentActivity(recentActivity);

  setText('chart-period-label', 'Last 30 days · rooms & venues');
  revealPageContent();
}

async function renderBookingUsageChart(bookingUsage) {
  const mount = document.getElementById('booking-usage-chart-mount');
  if (!mount) return;

  if (!bookingUsage?.length) {
    mount.innerHTML = '<p class="text-body-sm text-on-surface-variant absolute inset-0 flex items-center justify-center px-6 text-center">No room or facility bookings in the last 30 days yet.</p>';
    return;
  }

  const max = Math.max(...bookingUsage.map((b) => Number(b.booking_count)), 1);

  mount.innerHTML = bookingUsage.map((row) => {
    const height = Math.round((Number(row.booking_count) / max) * 140);
    const isRoom = row.kind === 'room';
    const color = isRoom ? 'bg-primary' : 'bg-emerald-600';
    const kindLabel = isRoom ? 'Rooms' : 'Venue';
    const label = row.label || (isRoom ? 'Lodging' : 'Facility');
    return `
      <div class="flex-none w-[5.5rem] sm:flex-1 sm:min-w-0 flex flex-col items-center gap-2 group relative z-10">
        <div class="w-full bg-surface-container rounded-t-lg relative overflow-hidden h-[180px]">
          <div class="chart-bar absolute bottom-0 w-full ${color} rounded-t-lg" style="height: 0px;" data-height="${height}px" title="${row.booking_count} approved (30d)"></div>
        </div>
        <span class="text-[0.6875rem] font-bold uppercase tracking-wide ${isRoom ? 'text-primary' : 'text-emerald-700'}">${kindLabel}</span>
        <span class="text-body-sm font-semibold text-on-surface-variant truncate max-w-full px-1 text-center" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
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

  mount.innerHTML = bookingsRaw.slice(0, 6).map((b) => {
    const status = normStatus(b.status);
    const { bg, icon } = activityIcon(status);
    const facility = facilityLabelForBooking(b);
    const action = activityActionText(b, status, facility);
    const typeNote = b.kind === 'venue' ? ' · Venue' : '';

    return `
      <div class="flex gap-4${status === 'cancelled' ? ' opacity-90' : ''}">
        <div class="w-11 h-11 rounded-full ${bg} flex items-center justify-center shrink-0">
          <span class="material-symbols-outlined text-[1.35rem]">${icon}</span>
        </div>
        <div>
          <p class="text-body-sm text-on-surface leading-relaxed">${action}</p>
          <p class="text-body-sm text-on-surface-variant mt-1">${relativeTime(b.updated_at || b.created_at)}${typeNote}${status === 'cancelled' ? ' · <span class="font-semibold text-slate-600">Cancelled</span>' : ''}</p>
        </div>
      </div>`;
  }).join('');

  staggerReveal('#recent-activity-mount > div', document).catch(() => {});
}

async function renderQueue(kpis = {}) {
  const mount = document.getElementById('queue-mount');
  if (!mount) return;

  mount.innerHTML = '<p class="dashboard-queue-loading">Loading reservation queue…</p>';

  let bookingsRaw = [];
  let groupsRaw = [];
  try {
    [bookingsRaw, groupsRaw] = await Promise.all([getBookings(), getGroups()]);
  } catch (err) {
    mount.innerHTML = `<p class="dashboard-queue-error">${escapeHtml(err.message || 'Could not load reservations.')}</p>`;
    return;
  }

  const queue = buildQueueItems(bookingsRaw, groupsRaw);
  const pending = queue.filter((q) => q.pending);
  const upcoming = queue.filter((q) => !q.pending);

  setText('queue-pending-count', String(pending.length));
  setText('queue-upcoming-count', String(upcoming.length));

  const summaryEl = document.getElementById('queue-summary');
  if (summaryEl) {
    if (!queue.length) {
      summaryEl.textContent = 'No pending requests or upcoming stays right now.';
    } else if (pending.length) {
      summaryEl.textContent = `${pending.length} request${pending.length === 1 ? '' : 's'} need your approval · ${upcoming.length} upcoming approved stay${upcoming.length === 1 ? '' : 's'}`;
    } else {
      summaryEl.textContent = `${upcoming.length} upcoming approved stay${upcoming.length === 1 ? '' : 's'} — nothing waiting for approval`;
    }
  }

  if (!queue.length) {
    mount.innerHTML = `
      <div class="dashboard-queue-empty">
        <span class="material-symbols-outlined" aria-hidden="true">event_available</span>
        <p class="dashboard-queue-empty__title">All clear</p>
        <p class="dashboard-queue-empty__text">There are no pending guest requests and no upcoming approved stays on the calendar.</p>
        <a href="reservations.html" class="btn-primary">Open Reservations</a>
      </div>`;
    return;
  }

  const sections = [];

  if (pending.length) {
    sections.push(`
      <div class="dashboard-queue-section">
        <h3 class="dashboard-queue-section__title">
          <span class="material-symbols-outlined" aria-hidden="true">assignment_late</span>
          Needs approval (${pending.length})
        </h3>
        <div class="dashboard-queue-list">
          ${pending.map(renderQueueItem).join('')}
        </div>
      </div>`);
  }

  if (upcoming.length) {
    sections.push(`
      <div class="dashboard-queue-section">
        <h3 class="dashboard-queue-section__title dashboard-queue-section__title--muted">
          <span class="material-symbols-outlined" aria-hidden="true">upcoming</span>
          Upcoming approved (${upcoming.length})
        </h3>
        <div class="dashboard-queue-list">
          ${upcoming.map(renderQueueItem).join('')}
        </div>
      </div>`);
  }

  mount.innerHTML = sections.join('');

  const queueByKey = Object.fromEntries(queue.map((q) => [q.key, q]));

  mount.querySelectorAll('.queue-approve').forEach((btn) => {
    btn.addEventListener('click', () => handleQueueApprove(queueByKey[btn.dataset.queueKey]));
  });
  mount.querySelectorAll('.queue-reject').forEach((btn) => {
    btn.addEventListener('click', () => handleQueueReject(queueByKey[btn.dataset.queueKey]));
  });
}

async function handleQueueApprove(item) {
  if (!item) return;
  try {
    const request = item.type === 'group'
      ? normalizeManageGroupRequest(item.raw)
      : normalizeManageRequest(item.raw);
    const approved = await approveRequest(request);
    if (!approved) return;
    await loadDashboard();
    window.dispatchEvent(new CustomEvent('booking:updated'));
  } catch (err) {
    await showAlertModal('Could not approve request', err.message || 'Could not approve this request.');
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
    await showAlertModal('Could not decline request', err.message || 'Could not decline this request.');
  }
}
