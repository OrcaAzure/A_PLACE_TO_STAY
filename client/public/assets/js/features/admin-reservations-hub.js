/**
 * Admin Reservations page — unified pending banner + tabbed inline lists.
 */

import {
  getBookings, getGroups, getFacilityBookings, deleteBooking, deleteGroup,
  updateFacilityBooking,
  normalizeManageRequest, normalizeManageGroupRequest, normalizeFacilityBooking,
} from '/assets/js/services/api.js';
import {
  approveRequest, rejectRequest, openModifyRequestWizard, requestKey, parseRequestKey,
  notifyBookingUpdated,
} from '/assets/js/features/booking-actions.js';
import {
  escapeHtml, formatDateLong, formatMoney, formatSubmittedAt, statusBadge, debounce,
  normStatus, stayNights, getReservationCategory, lifecyclePhaseForBooking, lifecyclePhaseBadge,
  canAdminCancelVenueBooking,
} from '/assets/js/features/reservation-shared.js';
import { createBookingPoll } from '/assets/js/layout/booking-poll.js';

const TABS = [
  { id: 'pending', label: 'Pending' },
  { id: 'rooms', label: 'Room stays' },
  { id: 'groups', label: 'Group stays' },
  { id: 'venues', label: 'Venues' },
];

const SEARCH_PLACEHOLDERS = {
  pending: 'Search by guest name, email, or ID…',
  rooms: 'Search by guest name, room, or ID…',
  groups: 'Search by group name, contact, or ID…',
  venues: 'Search by guest name, venue, or ID…',
};

const state = {
  tab: 'pending',
  loading: false,
  search: '',
  filter: 'all',
  guestUserId: null,
  guestName: '',
  roomRequests: [],
  groupRequests: [],
  roomStays: [],
  groupStays: [],
  venueBookings: [],
  approvingKey: null,
  saving: false,
  expandedKeys: new Set(),
};

let eventsBound = false;
/** @type {(() => void) | null} */
let onBookingUpdatedRes = null;
/** @type {(() => void) | null} */
let stopBookingPoll = null;

function $(id) { return document.getElementById(id); }

function readInitialTab() {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get('tab');
  if (tab && TABS.some((t) => t.id === tab)) return tab;
  if (params.get('guest')) return 'rooms';
  return 'pending';
}

function readInitialGuestFilter() {
  const params = new URLSearchParams(window.location.search);
  const guest = params.get('guest');
  state.guestUserId = guest && /^\d+$/.test(guest) ? guest : null;
  state.guestName = params.get('guestName')?.trim() || '';
}

function itemUserId(item) {
  return item?.userId ?? item?.user_id ?? null;
}

function matchesGuestUser(item) {
  if (!state.guestUserId) return true;
  const uid = itemUserId(item);
  return uid != null && String(uid) === String(state.guestUserId);
}

function guestFilterBannerHtml() {
  if (!state.guestUserId) return '';
  const name = escapeHtml(state.guestName || `Guest #${state.guestUserId}`);
  const clearHref = `reservations.html?tab=${encodeURIComponent(state.tab)}`;
  return `<p class="res-hub-guest-filter">Showing bookings for <strong>${name}</strong>. <a href="${clearHref}" class="res-hub-link">View all guests</a></p>`;
}

function setTab(tab, { pushUrl = true } = {}) {
  state.tab = tab;
  TABS.forEach(({ id }) => {
    document.querySelector(`[data-res-tab="${id}"]`)?.classList.toggle('is-active', id === tab);
  });
  if (pushUrl) {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.replaceState({}, '', url);
  }
  renderActivePanel();
}

function pendingRoomGroups() {
  return [
    ...state.roomRequests.filter((r) => normStatus(r.status) === 'pending'),
    ...state.groupRequests.filter((r) => normStatus(r.status) === 'pending'),
  ];
}

function pendingVenues() {
  return state.venueBookings.filter((b) => normStatus(b.status) === 'pending');
}

function pendingCounts() {
  const rooms = pendingRoomGroups().length;
  const venues = pendingVenues().length;
  return { rooms, venues, total: rooms + venues };
}

function renderTabBadges() {
  const { rooms, venues } = pendingCounts();
  const pendingBadge = document.querySelector('[data-res-tab-badge="pending"]');
  if (pendingBadge) {
    const n = rooms + venues;
    pendingBadge.textContent = String(n);
    pendingBadge.classList.toggle('hidden', n === 0);
  }
  const venueBadge = document.querySelector('[data-res-tab-badge="venues"]');
  if (venueBadge) {
    venueBadge.textContent = String(venues);
    venueBadge.classList.toggle('hidden', venues === 0);
  }
}

function matchesSearch(hay) {
  const q = state.search.trim().toLowerCase();
  return !q || hay.includes(q);
}

function formatMealsSummary(meals) {
  if (!meals?.length) return null;
  const items = meals
    .filter((m) => Number(m.quantity) > 0)
    .map((m) => `${m.meal_type} × ${m.quantity}`);
  return items.length ? items.join(', ') : null;
}

function formatFeesSummary(fees) {
  if (!fees?.length) return null;
  return fees.map((f) => `${f.fee_name} (${formatMoney(f.amount)})`).join(', ');
}

function factRow(label, value, { mono = false } = {}) {
  const display = value != null && String(value).trim() !== '' ? String(value) : '—';
  const ddClass = mono ? ' class="res-request-mono"' : '';
  return `<div class="res-request-fact">
    <dt>${escapeHtml(label)}</dt>
    <dd${ddClass}>${escapeHtml(display)}</dd>
  </div>`;
}

function renderSection(title, rowsHtml) {
  if (!rowsHtml) return '';
  return `<section class="res-request-section">
    <h4 class="res-request-section-title">${escapeHtml(title)}</h4>
    <div class="res-request-facts">${rowsHtml}</div>
  </section>`;
}

function renderNotes(notes) {
  const text = notes?.trim();
  if (!text) return '';
  return `<section class="res-request-section">
    <h4 class="res-request-section-title">Notes from guest</h4>
    <p class="res-request-notes">${escapeHtml(text)}</p>
  </section>`;
}

function renderMealAllergenNotes(notes) {
  const text = notes?.trim();
  if (!text) return '';
  return renderSection('Meal allergens & dietary notes', factRow('Notes', text));
}

function renderDatesTriple(cells) {
  return `<dl class="res-list-dates res-list-dates--triple">
    ${cells.map(({ label, value }) => `<div><dt>${escapeHtml(label)}</dt><dd>${value}</dd></div>`).join('')}
  </dl>`;
}

function renderExpandableCard({
  cardKey, title, badgesHtml, subtitle, submitted, summaryHtml, detailsHtml, linksHtml, actionsHtml,
}) {
  const expanded = state.expandedKeys.has(cardKey);
  return `
    <article class="res-list-card res-request-card${expanded ? ' is-expanded' : ''}" role="listitem">
      <div class="res-list-card-top">
        <h3 class="res-list-title">${title}</h3>
        ${badgesHtml ? `<div class="res-list-badges">${badgesHtml}</div>` : ''}
      </div>
      ${subtitle ? `<p class="res-list-detail">${subtitle}</p>` : ''}
      ${submitted ? `<p class="res-request-submitted">${submitted}</p>` : ''}
      ${summaryHtml || ''}
      <button type="button" class="res-card-toggle" data-toggle-details="${escapeHtml(cardKey)}" aria-expanded="${expanded}">
        <span class="material-symbols-outlined res-card-toggle__icon" aria-hidden="true">${expanded ? 'expand_less' : 'expand_more'}</span>
        ${expanded ? 'Hide details' : 'View full details'}
      </button>
      <div class="res-request-body res-request-body--collapsible"${expanded ? '' : ' hidden'}>${detailsHtml}</div>
      ${linksHtml || ''}
      ${actionsHtml || ''}
    </article>`;
}

function renderSingleRequestDetails(r) {
  const building = r.facility?.building || '';
  const room = r.facility?.roomNumber || '';
  const type = r.facility?.roomType || '';
  const roomLabel = [`${building} ${room}`.trim(), type].filter(Boolean).join(' · ') || 'Not specified';
  const nights = stayNights(r.schedule?.checkIn, r.schedule?.checkOut);
  const meals = formatMealsSummary(r.meals);
  const fees = formatFeesSummary(r.fees);
  const addonRows = [
    meals ? factRow('Meals ordered', meals) : '',
    fees ? factRow('Extra services', fees) : '',
  ].filter(Boolean).join('');

  return `
    ${renderSection('Contact person', [
      factRow('Name', r.requester?.name),
      factRow('Email', r.requester?.email),
      factRow('Phone', r.contactPhone),
      factRow('Role', r.requester?.role),
    ].join(''))}
    ${renderSection('Room requested', factRow('Room', roomLabel))}
    ${renderSection('Stay dates', [
      factRow('Check-in', formatDateLong(r.schedule?.checkIn)),
      factRow('Check-out', formatDateLong(r.schedule?.checkOut)),
      factRow('Length of stay', nights ? `${nights} night${nights === 1 ? '' : 's'}` : null),
      factRow('Guests in room', r.guestCount != null ? String(r.guestCount) : null),
    ].join(''))}
    ${renderSection('Pricing estimate', [
      factRow('Estimated total', r.totalAmount != null ? formatMoney(r.totalAmount) : null),
      factRow('Season', r.season),
      factRow('Rate type', r.occupancyItem),
    ].join(''))}
    ${addonRows ? renderSection('Meals & extras', addonRows) : ''}
    ${renderMealAllergenNotes(r.mealAllergenNotes)}
    ${renderNotes(r.notes)}
  `;
}

function renderGroupRequestDetails(r) {
  const nights = stayNights(r.schedule?.checkIn, r.schedule?.checkOut);
  const roomsLabel = r.roomsRequested != null
    ? `${r.roomsRequested} room${Number(r.roomsRequested) === 1 ? '' : 's'} requested`
    : 'Not specified';

  let assignedSection = '';
  if (r.assignedBookings?.length) {
    const rows = r.assignedBookings.map((b) => {
      const label = [`${b.building} ${b.roomNumber}`.trim(), b.roomType].filter(Boolean).join(' · ');
      const detail = b.guestCount != null ? `${b.guestCount} guest${b.guestCount === 1 ? '' : 's'}` : '';
      const cost = b.totalAmount != null ? formatMoney(b.totalAmount) : '';
      return factRow(label || 'Room', [detail, cost].filter(Boolean).join(' · '));
    }).join('');
    assignedSection = renderSection('Rooms already assigned', rows);
  }

  const pricingSection = r.grandTotal != null && r.grandTotal > 0
    ? renderSection('Pricing estimate', factRow('Estimated total', formatMoney(r.grandTotal)))
    : '';

  return `
    ${renderSection('Contact person', [
      factRow('Contact name', r.requester?.name),
      factRow('Email', r.contactEmail || r.requester?.email),
      factRow('Phone', r.contactPhone),
    ].join(''))}
    ${renderSection('Stay details', [
      factRow('Check-in', formatDateLong(r.schedule?.checkIn)),
      factRow('Check-out', formatDateLong(r.schedule?.checkOut)),
      factRow('Length of stay', nights ? `${nights} night${nights === 1 ? '' : 's'}` : null),
      factRow('Total guests', r.totalGuests != null ? String(r.totalGuests) : null),
      factRow('Rooms needed', roomsLabel),
    ].join(''))}
    ${assignedSection}
    ${pricingSection}
    ${renderMealAllergenNotes(r.mealAllergenNotes)}
    ${renderNotes(r.notes)}
  `;
}

function renderSingleStayDetails(item) {
  const building = item.building_name || '';
  const room = item.room_number || '';
  const type = item.room_type || '';
  const roomLabel = [`${building} ${room}`.trim(), type].filter(Boolean).join(' · ') || 'Not specified';
  const nights = stayNights(item.check_in, item.check_out);
  const meals = formatMealsSummary(item.meals);
  const fees = formatFeesSummary(item.fees);
  const addonRows = [
    meals ? factRow('Meals ordered', meals) : '',
    fees ? factRow('Extra services', fees) : '',
  ].filter(Boolean).join('');

  return `
    ${renderSection('Contact person', [
      factRow('Name', item.guest_name),
      factRow('Email', item.guest_email),
      factRow('Phone', item.contact_phone),
      factRow('Role', item.guest_role),
    ].join(''))}
    ${renderSection('Room', factRow('Assigned room', roomLabel))}
    ${renderSection('Stay dates', [
      factRow('Check-in', formatDateLong(item.check_in)),
      factRow('Check-out', formatDateLong(item.check_out)),
      factRow('Length of stay', nights ? `${nights} night${nights === 1 ? '' : 's'}` : null),
      factRow('Guests in room', item.guest_count != null ? String(item.guest_count) : null),
    ].join(''))}
    ${renderSection('Pricing', [
      factRow('Total amount', item.total_amount != null ? formatMoney(item.total_amount) : null),
      factRow('Season', item.season),
      factRow('Rate type', item.occupancy_item),
    ].join(''))}
    ${addonRows ? renderSection('Meals & extras', addonRows) : ''}
    ${renderHousingPaymentSection(item)}
    ${renderMealAllergenNotes(item.meal_allergen_notes)}
    ${renderNotes(item.notes)}
  `;
}

function renderGroupStayDetails(item) {
  const nights = stayNights(item.check_in, item.check_out);
  const roomsLabel = item.rooms_requested != null
    ? `${item.rooms_requested} room${Number(item.rooms_requested) === 1 ? '' : 's'} requested`
    : 'Not specified';

  let assignedSection = '';
  if (item.bookings?.length) {
    const rows = item.bookings.map((b) => {
      const label = [`${b.building_name} ${b.room_number}`.trim(), b.room_type].filter(Boolean).join(' · ');
      const detail = b.guest_count != null ? `${b.guest_count} guest${b.guest_count === 1 ? '' : 's'}` : '';
      const cost = b.total_amount != null ? formatMoney(b.total_amount) : '';
      return factRow(label || 'Room', [detail, cost].filter(Boolean).join(' · '));
    }).join('');
    assignedSection = renderSection('Assigned rooms', rows);
  }

  const pricingSection = item.grand_total != null && item.grand_total > 0
    ? renderSection('Pricing', factRow('Grand total', formatMoney(item.grand_total)))
    : '';

  const housingSection = renderHousingPaymentSection(item);

  return `
    ${renderSection('Contact person', [
      factRow('Contact name', item.contact_name),
      factRow('Email', item.contact_email),
      factRow('Phone', item.contact_phone),
    ].join(''))}
    ${renderSection('Stay details', [
      factRow('Check-in', formatDateLong(item.check_in)),
      factRow('Check-out', formatDateLong(item.check_out)),
      factRow('Length of stay', nights ? `${nights} night${nights === 1 ? '' : 's'}` : null),
      factRow('Total guests', item.total_guests != null ? String(item.total_guests) : null),
      factRow('Rooms', `${item.room_count || 0} assigned · ${roomsLabel}`),
    ].join(''))}
    ${assignedSection}
    ${pricingSection}
    ${housingSection}
    ${renderMealAllergenNotes(item.meal_allergen_notes)}
    ${renderNotes(item.notes)}
  `;
}

function paymentStatusBadge(item) {
  const status = normStatus(item.status);
  if (status !== 'approved') return '';

  if (item.kind === 'group' || item.bookings?.length) {
    const bookings = item.bookings || [];
    const withInvoice = bookings.filter((b) => b.invoice);
    const unpaid = withInvoice.filter((b) => b.invoice?.status === 'Pending');
    const paid = withInvoice.filter((b) => b.invoice?.status === 'Paid');
    if (unpaid.length) return `<span class="res-pill res-pill--pending">Housing unpaid (${unpaid.length})</span>`;
    if (paid.length && paid.length === withInvoice.length) return '<span class="res-pill res-pill--approved">Housing paid</span>';
    if (!withInvoice.length) return '<span class="res-pill res-pill--pending">Invoice pending</span>';
    return '';
  }

  const inv = item.invoice;
  if (!inv) return '<span class="res-pill res-pill--pending">Invoice pending</span>';
  if (inv.status === 'Paid') return '<span class="res-pill res-pill--approved">Housing paid</span>';
  return '<span class="res-pill res-pill--pending">Housing unpaid</span>';
}

function renderHousingPaymentSection(item) {
  const status = normStatus(item.status);
  if (status !== 'approved') return '';

  if (item.bookings?.length) {
    const rows = item.bookings.map((b) => {
      const label = [`${b.building_name} ${b.room_number}`.trim(), b.room_type].filter(Boolean).join(' · ');
      const inv = b.invoice;
      if (!inv) return factRow(label, 'Invoice not created yet');
      if (inv.status === 'Paid') return factRow(label, `Paid · ${formatMoney(inv.amount)}`);
      return factRow(label, `Unpaid · ${formatMoney(inv.amount)} due`);
    }).join('');
    return renderSection('Housing payment', rows);
  }

  const inv = item.invoice;
  if (!inv) {
    return renderSection('Housing payment', factRow('Status', 'Invoice will appear after approval'));
  }
  const line = inv.status === 'Paid'
    ? `Paid · ${formatMoney(inv.amount)}${inv.method ? ` via ${inv.method}` : ''}`
    : `Unpaid · ${formatMoney(inv.amount)} due — room stay is still confirmed`;
  return renderSection('Housing payment', factRow('Invoice', line));
}

function renderVenueDetails(item) {
  return `
    ${renderSection('Contact person', [
      factRow('Name', item.guestName),
      factRow('Email', item.guestEmail),
    ].join(''))}
    ${renderSection('Event details', [
      factRow('Venue', `${item.venueCategory} — ${item.venueName}`),
      factRow('Date', formatDateLong(item.eventDate)),
      factRow('Time', `${item.startLabel} – ${item.endLabel}`),
      factRow('Guest count', item.guestCount != null ? String(item.guestCount) : null),
    ].join(''))}
    ${renderSection('Pricing estimate', [
      factRow('Estimated total', item.totalAmount != null ? formatMoney(item.totalAmount) : null),
      factRow('Season', item.season),
      item.packageName ? factRow('Package', item.packageName) : '',
    ].filter(Boolean).join(''))}
    ${renderNotes(item.notes)}
  `;
}

function renderPendingRequestCard(r) {
  const isGroup = r.kind === 'group';
  const key = requestKey(r);
  const isApproving = state.approvingKey === key;
  const title = isGroup
    ? escapeHtml(r.groupName || r.requester?.name || 'Unnamed group')
    : escapeHtml(r.requester?.name || 'Unknown guest');
  const subtitle = isGroup
    ? `Contact: ${escapeHtml(r.requester?.name || '—')}`
    : escapeHtml([r.facility?.building, r.facility?.roomNumber].filter(Boolean).join(' ') || 'Room pending assignment');
  const body = isGroup ? renderGroupRequestDetails(r) : renderSingleRequestDetails(r);
  const nights = stayNights(r.schedule?.checkIn, r.schedule?.checkOut);
  const summaryHtml = renderDatesTriple([
    { label: 'Check-in', value: formatDateLong(r.schedule?.checkIn) },
    { label: 'Check-out', value: formatDateLong(r.schedule?.checkOut) },
    {
      label: isGroup ? 'Guests' : 'Stay',
      value: isGroup
        ? (r.totalGuests != null ? String(r.totalGuests) : '—')
        : (nights ? `${nights} night${nights === 1 ? '' : 's'}` : '—'),
    },
  ]);

  return renderExpandableCard({
    cardKey: key,
    title,
    badgesHtml: statusBadge(r.status),
    subtitle,
    submitted: `Submitted ${formatSubmittedAt(r.submittedAt)}`,
    summaryHtml,
    detailsHtml: body,
    actionsHtml: `
      <div class="res-list-actions res-list-actions--triple">
        <button type="button" class="res-btn res-btn--approve res-btn--wide" data-approve="${key}" ${isApproving || state.saving ? 'disabled' : ''}>
          <span class="material-symbols-outlined">${isApproving ? 'hourglass_top' : 'check_circle'}</span>
          ${isApproving ? 'Approving…' : 'Approve'}
        </button>
        <button type="button" class="res-btn res-btn--modify res-btn--wide" data-modify="${key}" ${isApproving || state.saving ? 'disabled' : ''}>
          <span class="material-symbols-outlined">edit</span> Modify
        </button>
        <button type="button" class="res-btn res-btn--reject res-btn--wide" data-reject="${key}" ${isApproving || state.saving ? 'disabled' : ''}>
          <span class="material-symbols-outlined">cancel</span> Decline
        </button>
      </div>`,
  });
}

function renderVenueCard(item, { pendingActions = false } = {}) {
  const pending = normStatus(item.status) === 'pending';
  const canCancel = canAdminCancelVenueBooking(item);
  const lifecycleBadge = lifecyclePhaseBadge(lifecyclePhaseForBooking(item));
  const calLink = `calendar.html?date=${encodeURIComponent(item.eventDate)}&q=${encodeURIComponent(item.venueName || '')}`;
  const cardKey = `ven-${item.id}`;
  const summaryHtml = `
    ${renderDatesTriple([
      { label: 'Date', value: formatDateLong(item.eventDate) },
      { label: 'Time', value: `${escapeHtml(item.startLabel)} – ${escapeHtml(item.endLabel)}` },
      { label: 'Guests', value: String(item.guestCount ?? '—') },
    ])}
    ${item.totalAmount ? `<p class="res-list-detail res-list-detail--inline">${formatMoney(item.totalAmount)} estimated</p>` : ''}`;

  return renderExpandableCard({
    cardKey,
    title: escapeHtml(item.guestName || 'Guest'),
    badgesHtml: `${lifecycleBadge}${statusBadge(item.status)}`,
    subtitle: `${escapeHtml(item.venueCategory)} — ${escapeHtml(item.venueName)}`,
    submitted: item.submittedAt ? `Submitted ${formatSubmittedAt(item.submittedAt)}` : '',
    summaryHtml,
    detailsHtml: renderVenueDetails(item),
    linksHtml: `
      <div class="res-hub-card-links">
        <a href="${calLink}" class="res-hub-link">View on calendar →</a>
        <a href="facilities.html?tab=venue-spaces&amp;date=${encodeURIComponent(item.eventDate)}" class="res-hub-link">See space snapshot →</a>
      </div>`,
    actionsHtml: `
      <div class="res-list-actions">
        ${pendingActions && pending ? `
          <button type="button" class="res-btn res-btn--approve res-btn--wide" data-vb-approve="${item.id}">
            <span class="material-symbols-outlined">check</span> Approve
          </button>
          <button type="button" class="res-btn res-btn--reject res-btn--wide" data-vb-decline="${item.id}">
            <span class="material-symbols-outlined">close</span> Decline
          </button>` : ''}
        ${!pendingActions && canCancel ? `
          <button type="button" class="res-btn res-btn--reject res-btn--wide" data-vb-cancel="${item.id}">
            <span class="material-symbols-outlined">cancel</span> Cancel booking
          </button>` : ''}
      </div>`,
  });
}

function renderStayCard(item) {
  const isGroup = item.kind === 'group';
  const guest = isGroup
    ? escapeHtml(item.group_name || item.contact_name || 'Unnamed group')
    : escapeHtml(item.guest_name || 'Unknown guest');
  const key = isGroup ? `g-${item.id}` : `b-${item.id}`;
  const building = item.building_name || '';
  const room = item.room_number || '';
  const detail = isGroup
    ? `${item.room_count || 0} room(s) · ${item.total_guests} guest(s)`
    : escapeHtml([building, room, item.room_type].filter(Boolean).join(' · ') || 'Room not specified');
  const calLink = `calendar.html?date=${encodeURIComponent(item.check_in)}&q=${encodeURIComponent(isGroup ? (item.group_name || '') : (room || building || item.guest_name || ''))}`;
  const facLink = !isGroup && item.room_id
    ? `facilities.html?tab=rooms&amp;room=${item.room_id}`
    : 'facilities.html?tab=rooms';
  const body = isGroup ? renderGroupStayDetails(item) : renderSingleStayDetails(item);
  const summaryHtml = renderDatesTriple([
    { label: 'Check-in', value: formatDateLong(item.check_in) },
    { label: 'Check-out', value: formatDateLong(item.check_out) },
    { label: 'Guests', value: String(isGroup ? item.total_guests : (item.guest_count ?? '—')) },
  ]);

  return renderExpandableCard({
    cardKey: key,
    title: guest,
    badgesHtml: `${lifecyclePhaseBadge(lifecyclePhaseForBooking(item))}${paymentStatusBadge(item)}${statusBadge(item.status)}`,
    subtitle: detail,
    submitted: item.created_at ? `Booked ${formatSubmittedAt(item.created_at)}` : '',
    summaryHtml,
    detailsHtml: body,
    linksHtml: `
      <div class="res-hub-card-links">
        <a href="${calLink}" class="res-hub-link">View on calendar →</a>
        <a href="${facLink}" class="res-hub-link">${isGroup ? 'Room status →' : 'Check room status →'}</a>
        <a href="payments.html" class="res-hub-link">Billing →</a>
      </div>`,
    actionsHtml: `
      <div class="res-list-actions">
        <button type="button" class="res-btn res-btn--primary res-btn--wide" data-edit-res="${key}">
          <span class="material-symbols-outlined">edit</span> Edit
        </button>
        <button type="button" class="res-btn res-btn--reject res-btn--wide" data-del-res="${key}">
          <span class="material-symbols-outlined">delete</span> Delete
        </button>
      </div>`,
  });
}

function renderList(items, renderFn, emptyMessage) {
  if (state.loading) return '<div class="res-empty-box">Loading…</div>';
  if (!items.length) return `<div class="res-empty-box">${emptyMessage}</div>`;
  return `<div class="res-card-list">${items.map(renderFn).join('')}</div>`;
}

function filterStays(items) {
  return items.filter((item) => {
    if (!matchesGuestUser(item)) return false;
    if (state.filter !== 'all' && getReservationCategory(item) !== state.filter) return false;
    return matchesSearch(item._search || '');
  });
}

function filterVenues(items) {
  return items.filter((item) => {
    if (!matchesGuestUser(item)) return false;
    const cat = item._category;
    if (state.filter === 'pending' && cat !== 'pending') return false;
    if (state.filter === 'active' && !['pending', 'today', 'upcoming'].includes(cat)) return false;
    if (state.filter === 'past' && cat !== 'past') return false;
    if (state.filter === 'cancelled' && cat !== 'cancelled') return false;
    return matchesSearch(item._search || '');
  });
}

function renderActivePanel() {
  const mount = $('res-hub-list');
  const countEl = $('res-hub-count');
  if (!mount) return;

  let items = [];
  let html = '';
  let countLabel = '';

  if (state.tab === 'pending') {
    const roomPending = pendingRoomGroups().filter((r) =>
      matchesGuestUser(r) && matchesSearch([
        r.requester?.name, r.requester?.email, r.contactPhone,
        r.groupName, r.facility?.building, r.facility?.roomNumber, r.notes,
      ].join(' ').toLowerCase()));
    const venuePending = pendingVenues().filter((v) => matchesGuestUser(v) && matchesSearch(v._search));
    items = [...roomPending, ...venuePending];
    const blocks = [];
    if (roomPending.length) {
      blocks.push(`<h3 class="res-hub-section-title">Room &amp; group requests</h3>${renderList(roomPending, renderPendingRequestCard, '')}`);
    }
    if (venuePending.length) {
      blocks.push(`<h3 class="res-hub-section-title">Venue requests</h3>${renderList(venuePending, (v) => renderVenueCard(v, { pendingActions: true }), '')}`);
    }
    html = blocks.length
      ? blocks.join('')
      : renderList([], () => '', 'No pending requests — you\'re all caught up.');
    countLabel = `${roomPending.length + venuePending.length} pending`;
  } else if (state.tab === 'rooms') {
    items = filterStays(state.roomStays);
    html = renderList(items, renderStayCard, 'No room stays yet. Create one with the button above.');
    countLabel = `${items.length} room stay${items.length === 1 ? '' : 's'}`;
  } else if (state.tab === 'groups') {
    items = filterStays(state.groupStays);
    html = renderList(items, renderStayCard, 'No group stays yet. Create one with the button above.');
    countLabel = `${items.length} group stay${items.length === 1 ? '' : 's'}`;
  } else if (state.tab === 'venues') {
    items = filterVenues(state.venueBookings);
    html = renderList(items, (v) => renderVenueCard(v), 'No venue bookings yet. Create one with the button above.');
    countLabel = `${items.length} venue booking${items.length === 1 ? '' : 's'}`;
  }

  mount.innerHTML = guestFilterBannerHtml() + html;
  if (countEl) {
    const guestSuffix = state.guestUserId && state.guestName
      ? ` for ${state.guestName}`
      : state.guestUserId
        ? ` for guest #${state.guestUserId}`
        : '';
    countEl.textContent = `${countLabel}${guestSuffix}`;
  }
  renderTabBadges();
}

function venueCategory(row) {
  const s = normStatus(row.status);
  if (s === 'cancelled' || s === 'rejected') return 'cancelled';
  if (s === 'pending') return 'pending';
  const today = new Date().toISOString().slice(0, 10);
  if (row.eventDate === today) return 'today';
  if (row.eventDate >= today) return 'upcoming';
  return 'past';
}

async function loadAll({ background = false } = {}) {
  if (!background) {
    state.loading = true;
    renderActivePanel();
  }

  try {
    const [bookings, groups, venues] = await Promise.all([
      getBookings(), getGroups(), getFacilityBookings(),
    ]);

    state.roomRequests = bookings.filter((b) => !b.group_id).map(normalizeManageRequest);
    state.groupRequests = groups.map(normalizeManageGroupRequest);

    state.roomStays = bookings
      .filter((b) => !b.group_id && ['approved', 'cancelled'].includes(normStatus(b.status)))
      .map((b) => ({
        kind: 'single',
        ...b,
        _search: [
          b.guest_name, b.guest_email, b.contact_phone,
          b.room_number, b.building_name, b.notes,
        ].join(' ').toLowerCase(),
      }));

    state.groupStays = groups
      .filter((g) => ['approved', 'cancelled'].includes(normStatus(g.status)))
      .map((g) => ({
        kind: 'group',
        ...g,
        _search: [
          g.group_name, g.contact_name,
          g.contact_email, g.contact_phone, g.notes,
        ].join(' ').toLowerCase(),
      }));

    state.venueBookings = venues.map((r) => {
      const n = normalizeFacilityBooking(r);
      n._search = [
        n.guestName, n.guestEmail, n.venueCategory, n.venueName,
        n.eventDate, n.notes,
      ].join(' ').toLowerCase();
      n._category = venueCategory(n);
      return n;
    }).sort((a, b) => `${a.eventDate}${a.startTime}`.localeCompare(`${b.eventDate}${b.startTime}`));
  } finally {
    state.loading = false;
    renderActivePanel();
  }
}

async function approvePending(key) {
  const { kind, id } = parseRequestKey(key);
  const r = [...state.roomRequests, ...state.groupRequests].find((x) => x.kind === kind && String(x.id) === String(id));
  if (!r || state.saving || state.approvingKey) return;
  state.approvingKey = key;
  renderActivePanel();
  try {
    await approveRequest(r);
    notifyBookingUpdated();
    await loadAll();
  } catch (err) {
    alert(err.message || 'Could not approve this request.');
    state.approvingKey = null;
    renderActivePanel();
  } finally {
    state.approvingKey = null;
  }
}

async function rejectPending(key) {
  const { kind, id } = parseRequestKey(key);
  const r = [...state.roomRequests, ...state.groupRequests].find((x) => x.kind === kind && String(x.id) === String(id));
  if (!r || state.saving) return;
  const name = r.kind === 'group'
    ? (r.groupName || r.requester?.name || 'this group')
    : (r.requester?.name || 'this guest');
  const note = window.prompt(`Decline request from ${name}? Optional reason (saved in notes):`, '');
  if (note === null) return;
  state.saving = true;
  renderActivePanel();
  try {
    await rejectRequest(r, { note: note.trim() });
    notifyBookingUpdated();
    await loadAll();
  } catch (err) {
    alert(err.message || 'Could not decline this request.');
  } finally {
    state.saving = false;
    renderActivePanel();
  }
}

function modifyPending(key) {
  const { kind, id } = parseRequestKey(key);
  const r = [...state.roomRequests, ...state.groupRequests].find((x) => x.kind === kind && String(x.id) === String(id));
  if (!r) return;
  openModifyRequestWizard(r, { modifyRequest: true });
}

function parseResKey(key) {
  if (String(key).startsWith('g-')) return { kind: 'group', id: key.slice(2) };
  return { kind: 'single', id: String(key).startsWith('b-') ? key.slice(2) : key };
}

function openEdit(key) {
  const { kind, id } = parseResKey(key);
  if (kind === 'group') {
    window.dispatchEvent(new CustomEvent('group-wizard:open', { detail: { mode: 'edit', groupId: id } }));
  } else {
    window.dispatchEvent(new CustomEvent('reservation-wizard:open', { detail: { mode: 'edit', bookingId: id } }));
  }
}

async function deleteStay(key) {
  const { kind, id } = parseResKey(key);
  const list = kind === 'group' ? state.groupStays : state.roomStays;
  const item = list.find((x) => String(x.id) === String(id));
  if (!item) return;
  const name = kind === 'group' ? item.group_name : item.guest_name;
  if (!window.confirm(`Delete reservation for ${name}? This cannot be undone.`)) return;
  if (kind === 'group') await deleteGroup(id);
  else await deleteBooking(id);
  notifyBookingUpdated();
  await loadAll();
}

async function setVenueStatus(id, status) {
  try {
    await updateFacilityBooking(id, { status });
    notifyBookingUpdated();
    await loadAll();
  } catch (err) {
    alert(err.message || 'Could not update this booking.');
  }
}

function updateFilterUi() {
  const filterEl = $('res-hub-filter');
  if (!filterEl) return;
  if (state.tab === 'rooms' || state.tab === 'groups') {
    filterEl.innerHTML = `
      <option value="all">All statuses</option>
      <option value="upcoming">Upcoming</option>
      <option value="active">In progress</option>
      <option value="completed">Completed</option>
      <option value="cancelled">Cancelled</option>`;
    filterEl.value = state.filter;
    filterEl.classList.remove('hidden');
  } else if (state.tab === 'venues') {
    filterEl.innerHTML = `
      <option value="active">Active & pending</option>
      <option value="pending">Pending only</option>
      <option value="past">Past</option>
      <option value="cancelled">Cancelled</option>
      <option value="all">All</option>`;
    filterEl.value = state.filter;
    filterEl.classList.remove('hidden');
  } else {
    filterEl.classList.add('hidden');
  }

  const createRoom = $('res-hub-create-room');
  const createGroup = $('res-hub-create-group');
  const createVenue = $('res-hub-create-venue');
  createRoom?.classList.toggle('hidden', state.tab !== 'rooms');
  createGroup?.classList.toggle('hidden', state.tab !== 'groups');
  createVenue?.classList.toggle('hidden', state.tab !== 'venues');

  const searchEl = $('res-hub-search');
  if (searchEl) {
    searchEl.placeholder = SEARCH_PLACEHOLDERS[state.tab] || SEARCH_PLACEHOLDERS.pending;
  }
}

function onTabChange(tab) {
  state.search = '';
  state.filter = tab === 'venues' ? 'active' : 'all';
  const searchEl = $('res-hub-search');
  if (searchEl) searchEl.value = '';
  setTab(tab);
  updateFilterUi();
}

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;

  document.querySelectorAll('[data-res-tab]').forEach((btn) => {
    btn.addEventListener('click', () => onTabChange(btn.getAttribute('data-res-tab')));
  });

  const debouncedSearch = debounce((value) => {
    state.search = value;
    renderActivePanel();
  });
  $('res-hub-search')?.addEventListener('input', (e) => debouncedSearch(e.target.value));

  $('res-hub-filter')?.addEventListener('change', (e) => {
    state.filter = e.target.value;
    renderActivePanel();
  });

  $('res-hub-create-room')?.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('reservation-wizard:open', { detail: { mode: 'create' } }));
  });
  $('res-hub-create-group')?.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('group-wizard:open', { detail: { mode: 'create' } }));
  });
  $('res-hub-create-venue')?.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('venue-booking-wizard:open'));
  });

  $('res-hub-list')?.addEventListener('click', (e) => {
    const toggle = e.target.closest('[data-toggle-details]');
    if (toggle) {
      const key = toggle.getAttribute('data-toggle-details');
      if (state.expandedKeys.has(key)) state.expandedKeys.delete(key);
      else state.expandedKeys.add(key);
      renderActivePanel();
      return;
    }
    const approve = e.target.closest('[data-approve]');
    if (approve) { approvePending(approve.getAttribute('data-approve')); return; }
    const reject = e.target.closest('[data-reject]');
    if (reject) { rejectPending(reject.getAttribute('data-reject')); return; }
    const modify = e.target.closest('[data-modify]');
    if (modify) { modifyPending(modify.getAttribute('data-modify')); return; }
    const edit = e.target.closest('[data-edit-res]');
    if (edit) { openEdit(edit.getAttribute('data-edit-res')); return; }
    const del = e.target.closest('[data-del-res]');
    if (del) { deleteStay(del.getAttribute('data-del-res')); return; }
    const vbApprove = e.target.closest('[data-vb-approve]');
    if (vbApprove) { setVenueStatus(Number(vbApprove.dataset.vbApprove), 'Approved'); return; }
    const vbDecline = e.target.closest('[data-vb-decline]');
    if (vbDecline) {
      if (!window.confirm('Decline this venue booking request?')) return;
      setVenueStatus(Number(vbDecline.dataset.vbDecline), 'Rejected');
      return;
    }
    const vbCancel = e.target.closest('[data-vb-cancel]');
    if (vbCancel) {
      if (!window.confirm('Cancel this venue booking?')) return;
      setVenueStatus(Number(vbCancel.dataset.vbCancel), 'Cancelled');
    }
  });

  onBookingUpdatedRes = () => loadAll();
  window.addEventListener('booking:updated', onBookingUpdatedRes);
}

export function teardownReservationsHub() {
  stopBookingPoll?.();
  stopBookingPoll = null;
  if (onBookingUpdatedRes) {
    window.removeEventListener('booking:updated', onBookingUpdatedRes);
    onBookingUpdatedRes = null;
  }
  eventsBound = false;
}

export async function bootstrapReservationsHub() {
  readInitialGuestFilter();
  state.tab = readInitialTab();
  bindEvents();
  updateFilterUi();
  setTab(state.tab, { pushUrl: false });
  await loadAll();
  stopBookingPoll?.();
  stopBookingPoll = createBookingPoll(() => loadAll({ background: true }));
}
