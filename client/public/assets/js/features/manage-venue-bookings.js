/** Venue / facility bookings list for admin. */

import {
  getFacilityBookings, updateFacilityBooking, normalizeFacilityBooking,
} from '/assets/js/services/api.js';
import {
  escapeHtml, formatDateLong, formatMoney, debounce, normStatus, statusBadge,
} from '/assets/js/features/reservation-shared.js';
import { closeVenueBookingWizard, openVenueBookingWizard } from '/assets/js/features/venue-booking-wizard.js';

let initialized = false;
let isOpen = false;
let list = [];
let filtered = [];
let filter = { search: '', category: 'all' };
let loading = false;

function $(id) { return document.getElementById(id); }

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function bookingCategory(row) {
  const s = normStatus(row.status);
  if (s === 'cancelled' || s === 'rejected') return 'cancelled';
  if (s === 'pending') return 'pending';
  if (row.eventDate === todayStr()) return 'today';
  if (row.eventDate >= todayStr()) return 'upcoming';
  return 'past';
}

function applyFilter() {
  const q = filter.search.trim().toLowerCase();
  filtered = list.filter((item) => {
    const cat = bookingCategory(item);
    if (filter.category === 'today' && cat !== 'today') return false;
    if (filter.category === 'upcoming' && !['upcoming', 'today'].includes(cat)) return false;
    if (filter.category === 'pending' && cat !== 'pending') return false;
    if (filter.category === 'cancelled' && cat !== 'cancelled') return false;
    if (!q) return true;
    return item._search.includes(q);
  });
}

function renderList() {
  const mount = $('manage-venue-bookings-list');
  if (!mount) return;
  if (loading) {
    mount.innerHTML = '<div class="res-empty-box">Loading venue bookings…</div>';
    return;
  }
  if (!filtered.length) {
    mount.innerHTML = '<div class="res-empty-box">No venue bookings found. Tap <strong>New venue booking</strong> to reserve a chapel, commons, or other space.</div>';
    return;
  }

  mount.innerHTML = filtered.map((item) => {
    const pending = normStatus(item.status) === 'pending';
    return `<article class="res-list-card" role="listitem">
      <div class="res-list-card-head">
        <div class="res-list-meta">
          <span class="res-list-id">VEN-${item.id}</span>
          <span class="res-pill res-pill--group">Venue</span>
        </div>
        <div class="res-list-badges">${statusBadge(item.status)}</div>
      </div>
      <h3 class="res-list-title">${escapeHtml(item.guestName || 'Guest')}</h3>
      <p class="res-list-detail">${escapeHtml(item.venueCategory)} — ${escapeHtml(item.venueName)}</p>
      <dl class="res-list-dates res-list-dates--triple">
        <div>
          <dt>Date</dt>
          <dd>${formatDateLong(item.eventDate)}</dd>
        </div>
        <div>
          <dt>Time</dt>
          <dd>${escapeHtml(item.startLabel)} – ${escapeHtml(item.endLabel)}</dd>
        </div>
        <div>
          <dt>Guests</dt>
          <dd>${item.guestCount}</dd>
        </div>
      </dl>
      ${item.totalAmount ? `<p class="res-list-detail" style="margin-top:0.5rem;">${formatMoney(item.totalAmount)} estimated</p>` : ''}
      <div class="res-list-actions">
        ${pending ? `
          <button type="button" class="res-btn res-btn--primary res-btn--wide" data-vb-approve="${item.id}">
            <span class="material-symbols-outlined">check</span> Approve
          </button>
          <button type="button" class="res-btn res-btn--reject res-btn--wide" data-vb-decline="${item.id}">
            <span class="material-symbols-outlined">close</span> Decline
          </button>` : `
          <button type="button" class="res-btn res-btn--reject res-btn--wide" data-vb-cancel="${item.id}">
            <span class="material-symbols-outlined">cancel</span> Cancel booking
          </button>`}
      </div>
    </article>`;
  }).join('');

  $('manage-venue-bookings-footer-count').textContent =
    `${filtered.length} booking${filtered.length === 1 ? '' : 's'} shown`;
}

async function load() {
  loading = true;
  renderList();
  try {
    const rows = await getFacilityBookings();
    list = rows.map((r) => {
      const n = normalizeFacilityBooking(r);
      n._search = [
        n.id, n.guestName, n.venueCategory, n.venueName, n.eventDate,
      ].join(' ').toLowerCase();
      return n;
    }).sort((a, b) => `${a.eventDate}${a.startTime}`.localeCompare(`${b.eventDate}${b.startTime}`));
    applyFilter();
  } finally {
    loading = false;
    renderList();
  }
}

function show() {
  $('manage-venue-bookings-overlay')?.classList.remove('hidden');
  $('manage-venue-bookings-modal')?.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function hide() {
  $('manage-venue-bookings-overlay')?.classList.add('hidden');
  $('manage-venue-bookings-modal')?.classList.add('hidden');
  document.body.style.overflow = '';
}

export function isManageVenueBookingsModalOpen() { return isOpen; }

export async function openManageVenueBookingsModal() {
  if (isOpen) return;
  isOpen = true;
  show();
  await load();
}

export function closeManageVenueBookingsModal() {
  if (!isOpen) return;
  isOpen = false;
  hide();
}

async function setStatus(id, status) {
  await updateFacilityBooking(id, { status });
  window.dispatchEvent(new CustomEvent('booking:updated'));
  await load();
}

function onClick(e) {
  if (e.target.closest('[data-open-venue-booking-wizard]')) {
    e.preventDefault();
    closeManageVenueBookingsModal();
    openVenueBookingWizard();
    return;
  }
  const approve = e.target.closest('[data-vb-approve]');
  if (approve) { setStatus(Number(approve.dataset.vbApprove), 'Approved'); return; }
  const decline = e.target.closest('[data-vb-decline]');
  if (decline) {
    if (!window.confirm('Decline this venue booking request?')) return;
    setStatus(Number(decline.dataset.vbDecline), 'Rejected');
    return;
  }
  const cancel = e.target.closest('[data-vb-cancel]');
  if (cancel) {
    if (!window.confirm('Cancel this venue booking?')) return;
    setStatus(Number(cancel.dataset.vbCancel), 'Cancelled');
  }
}

export function initManageVenueBookingsModal() {
  if (initialized) return;
  initialized = true;

  const debounced = debounce((v) => { filter.search = v; applyFilter(); renderList(); });

  $('manage-venue-bookings-close')?.addEventListener('click', closeManageVenueBookingsModal);
  $('manage-venue-bookings-close-btn')?.addEventListener('click', closeManageVenueBookingsModal);
  $('manage-venue-bookings-overlay')?.addEventListener('click', closeManageVenueBookingsModal);
  $('manage-venue-bookings-search')?.addEventListener('input', (e) => debounced(e.target.value));
  $('manage-venue-bookings-status-filter')?.addEventListener('change', (e) => {
    filter.category = e.target.value;
    applyFilter();
    renderList();
  });
  $('manage-venue-bookings-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'manage-venue-bookings-modal') closeManageVenueBookingsModal();
    else onClick(e);
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-manage-venue-bookings]')) {
      e.preventDefault();
      openManageVenueBookingsModal();
    }
  });

  window.addEventListener('booking:updated', () => { if (isOpen) load(); });
}
