/**
 * Admin dashboard — calm, plain-language ops overview.
 */

import { getAdminSummary } from '/assets/js/services/api.js';
import { escapeHtml } from '/assets/js/features/reservation-shared.js';
import { animateCountUp, revealPageContent, staggerReveal } from '/assets/js/layout/animations.js';

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function waitingLabel(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 1) return 'Just now';
  if (hrs < 24) return `${hrs}h waiting`;
  return `${Math.floor(hrs / 24)}d waiting`;
}

function kindLabel(kind) {
  if (kind === 'venue') return 'Venue';
  if (kind === 'group') return 'Group';
  return 'Room';
}

function todayRows(rows, emptyText, href, mapRow) {
  if (!rows.length) {
    return `<p class="dashboard-today__empty">${escapeHtml(emptyText)}</p>`;
  }
  return `
    <ul class="dashboard-today__list">
      ${rows.slice(0, 3).map((row) => `
        <li>
          <a href="${escapeHtml(href)}" class="dashboard-today__row">
            <span class="dashboard-today__name">${escapeHtml(row.guest_name || 'Guest')}</span>
            <span class="dashboard-today__place">${escapeHtml(mapRow(row))}</span>
          </a>
        </li>`).join('')}
    </ul>
    ${rows.length > 3 ? `<p class="dashboard-more">+${rows.length - 3} more</p>` : ''}`;
}

function renderTodayBoard(board = {}) {
  const mount = document.getElementById('today-mount');
  if (!mount) return;

  const arriving = board.arriving || [];
  const departing = board.departing || [];
  const venues = board.venues || [];
  const total = arriving.length + departing.length + venues.length;

  setText('today-summary', total
    ? `${arriving.length} coming in · ${departing.length} leaving`
    : 'Nothing scheduled');

  mount.innerHTML = `
    <div class="dashboard-today">
      <div class="dashboard-today__col">
        <h3 class="dashboard-today__heading">Coming in</h3>
        ${todayRows(arriving, 'None today', 'calendar.html', (r) => r.label || 'Room')}
      </div>
      <div class="dashboard-today__col">
        <h3 class="dashboard-today__heading">Leaving</h3>
        ${todayRows(departing, 'None today', 'calendar.html', (r) => r.label || 'Room')}
      </div>
      <div class="dashboard-today__col">
        <h3 class="dashboard-today__heading">Events</h3>
        ${todayRows(
    venues,
    'None today',
    'calendar.html',
    (r) => r.when_label || r.label || 'Venue'
  )}
      </div>
    </div>`;
}

function renderActionQueue(items, kpis) {
  const mount = document.getElementById('action-queue-mount');
  if (!mount) return;

  const summary = document.getElementById('queue-summary');
  if (summary) {
    summary.textContent = kpis.pending
      ? `${kpis.pending} to review`
      : 'Nothing waiting';
  }

  if (!items?.length) {
    mount.innerHTML = `
      <div class="dashboard-empty">
        <p class="dashboard-empty__title">All caught up</p>
        <p class="dashboard-empty__text">No guest requests need your review right now.</p>
      </div>`;
    return;
  }

  const shown = items.slice(0, 5);
  mount.innerHTML = `
    <div class="dashboard-action-list">
      ${shown.map((item) => {
        const wait = waitingLabel(item.submitted_at);
        const urgent = item.submitted_at
          && (Date.now() - new Date(item.submitted_at).getTime()) >= 24 * 3600000;
        return `
          <a href="${escapeHtml(item.href || 'reservations.html')}" class="dashboard-action-item${urgent ? ' is-urgent' : ''}">
            <div class="dashboard-action-item__body">
              <div class="dashboard-action-item__head">
                <strong>${escapeHtml(item.guest_name || 'Guest')}</strong>
                <span class="dashboard-action-item__kind">${escapeHtml(kindLabel(item.kind))}</span>
              </div>
              <p class="dashboard-action-item__label">${escapeHtml(item.label || '')}</p>
              <p class="dashboard-action-item__meta">${escapeHtml(wait)}</p>
            </div>
          </a>`;
      }).join('')}
    </div>
    ${items.length > 5 ? `<p class="dashboard-more"><a href="reservations.html?tab=pending">See ${items.length - 5} more</a></p>` : ''}`;

  staggerReveal('.dashboard-action-item', mount).catch(() => {});
}

function renderHouse(kpis = {}, analytics = {}) {
  const mount = document.getElementById('house-mount');
  if (!mount) return;

  const ready = Number(kpis.availableRooms) || 0;
  const occupied = Number(kpis.occupiedRooms) || 0;
  const repair = Number(kpis.maintenanceRooms) || 0;
  const rate = Number(analytics.occupancyRate) || 0;
  const circumference = 2 * Math.PI * 42;
  const offset = circumference - (rate / 100) * circumference;

  mount.innerHTML = `
    <div class="dashboard-house">
      <div class="dashboard-house__ring" aria-label="${rate} percent of rooms are occupied">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle class="dashboard-house__track" cx="50" cy="50" r="42" />
          <circle class="dashboard-house__progress" cx="50" cy="50" r="42"
            stroke-dasharray="${circumference.toFixed(1)}"
            stroke-dashoffset="${offset.toFixed(1)}" />
        </svg>
        <div class="dashboard-house__ring-label">
          <strong>${rate}%</strong>
          <span>Full</span>
        </div>
      </div>
      <div class="dashboard-house__stats">
        <div class="dashboard-house__stat">
          <strong>${ready}</strong>
          <span>Ready</span>
        </div>
        <div class="dashboard-house__stat">
          <strong>${occupied}</strong>
          <span>In use</span>
        </div>
        <div class="dashboard-house__stat${repair ? ' is-warn' : ''}">
          <strong>${repair}</strong>
          <span>Repair</span>
        </div>
      </div>
    </div>`;
}

function renderHousekeepingLoad(days = [], analytics = {}) {
  const mount = document.getElementById('load-mount');
  if (!mount) return;

  const turns = Number(analytics.turnoverWeek) || 0;
  const peak = analytics.peakLoadDay;

  setText('load-summary', turns
    ? (peak ? `Busiest day: ${peak}` : 'Check-ins and check-outs')
    : 'A quiet week ahead');

  if (!days.length) {
    mount.innerHTML = '<p class="dashboard-muted">Nothing to show yet.</p>';
    return;
  }

  const max = Math.max(...days.map((d) => Number(d.turnover) || 0), 1);

  mount.innerHTML = `
    <div class="dashboard-load">
      ${days.map((day) => {
        const turnover = Number(day.turnover) || 0;
        const h = Math.round((turnover / max) * 100);
        return `
          <div class="dashboard-load__day${day.is_today ? ' is-today' : ''}"
            title="${escapeHtml(day.label)}: ${turnover} room move${turnover === 1 ? '' : 's'}">
            <div class="dashboard-load__bars" aria-hidden="true">
              <span class="dashboard-load__bar" style="height:${Math.max(h, turnover ? 14 : 3)}%"></span>
            </div>
            <p class="dashboard-load__total">${turnover}</p>
            <p class="dashboard-load__label">${escapeHtml(day.label)}</p>
          </div>`;
      }).join('')}
    </div>`;
}

function applyKpis(kpis, { animate = false } = {}) {
  const values = [
    ['kpi-pending', String(kpis.pending ?? 0)],
    ['kpi-arriving', String(kpis.arrivingToday ?? 0)],
    ['kpi-departing', String(kpis.departingToday ?? 0)],
    ['kpi-unpaid', String(kpis.unpaidInvoices ?? 0)],
  ];

  if (!animate) {
    values.forEach(([id, value]) => setText(id, value));
    return Promise.resolve();
  }

  return Promise.all(values.map(([id, value]) => animateCountUp(document.getElementById(id), value)));
}

export async function loadDashboard({ background = false } = {}) {
  const summary = await getAdminSummary();
  const { kpis, actionItems, todayBoard, weekOutlook, analytics } = summary;

  renderActionQueue(actionItems, kpis);
  renderTodayBoard(todayBoard);
  renderHouse(kpis, analytics || {});
  renderHousekeepingLoad(weekOutlook || [], analytics || {});

  if (background) {
    await applyKpis(kpis, { animate: false });
    return;
  }

  await applyKpis(kpis, { animate: true });
  revealPageContent();
}
