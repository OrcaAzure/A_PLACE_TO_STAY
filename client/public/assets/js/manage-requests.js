/**
 * Manage Requests modal — master-detail popup for pending facility bookings.
 * Follows the same feature-module pattern as timeline.js and reservations.js.
 */

const LOADING_DELAY_MS = 400;


function debounce(fn, delayMs = 300) {
  let timerId = null;
  return function debounced(...args) {
    clearTimeout(timerId);
    timerId = setTimeout(() => fn.apply(this, args), delayMs);
  };
}

function formatDisplayId(id) {
  return `#APT-${id}`;
}

function formatDateRange(checkIn, checkOut) {
  const inDate = new Date(`${checkIn}T00:00:00`);
  const outDate = new Date(`${checkOut}T00:00:00`);
  const opts = { month: 'short', day: 'numeric' };
  const inStr = inDate.toLocaleDateString('en-US', opts);
  const outStr = outDate.toLocaleDateString('en-US', { ...opts, year: 'numeric' });
  return `${inStr} – ${outStr}`;
}

function formatDateTime(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatRelativeTime(isoString) {
  const date = new Date(isoString);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return formatDateTime(isoString);
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const STATUS_CONFIG = {
  pending: { label: 'Pending', pillClass: 'status-pill-pending', dotColor: 'bg-amber-500' },
  approved: { label: 'Approved', pillClass: 'status-pill-approved', dotColor: 'bg-secondary' },
  rejected: { label: 'Rejected', pillClass: 'status-pill-rejected', dotColor: 'bg-error' },
  cancelled: { label: 'Cancelled', pillClass: 'status-pill-cancelled', dotColor: 'bg-on-surface-variant' },
};

function normalizeStatus(status) {
  return String(status || 'pending').toLowerCase();
}

function getStatusConfig(status) {
  return STATUS_CONFIG[normalizeStatus(status)] || STATUS_CONFIG.pending;
}

function enrichRequest(request) {
  return {
    ...request,
    displayId: request.displayId || formatDisplayId(request.id),
    status: normalizeStatus(request.status),
    facility: { ...request.facility },
    schedule: { ...request.schedule },
    requester: { ...request.requester },
  };
}

function filterRequests(requests, filterState) {
  const query = (filterState.searchQuery || '').trim().toLowerCase();
  const statusFilter = filterState.statusFilter || 'pending';
  const facilityFilter = filterState.facilityFilter || 'all';

  return requests.filter((req) => {
    if (statusFilter !== 'all' && req.status !== statusFilter) return false;
    if (facilityFilter !== 'all' && req.facility.building !== facilityFilter) return false;

    if (!query) return true;

    const haystack = [
      req.displayId,
      req.title,
      req.facility.building,
      req.facility.roomNumber,
      req.facility.roomType,
      req.requester.name,
      req.requester.email,
      req.notes,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(query);
  });
}

function getFacilities(requests) {
  const buildings = new Set(requests.map((r) => r.facility.building));
  return Array.from(buildings).sort();
}

function getRequestById(requests, id) {
  return requests.find((r) => String(r.id) === String(id)) || null;
}

function countPending(requests) {
  return requests.filter((r) => r.status === 'pending').length;
}

function createDefaultFilterState() {
  return {
    searchQuery: '',
    statusFilter: 'pending',
    facilityFilter: 'all',
  };
}

const now = Date.now();
const hoursAgo = (h) => new Date(now - h * 60 * 60 * 1000).toISOString();
const daysAgo = (d) => new Date(now - d * 24 * 60 * 60 * 1000).toISOString();

const MOCK_MANAGE_REQUESTS = [
  {
    id: 2801,
    title: 'THEOLOGY DEPT',
    status: 'pending',
    facility: { building: 'PCALM', roomNumber: '201', roomType: 'Superior Guest Room' },
    schedule: { checkIn: '2026-06-02', checkOut: '2026-06-06', checkInTime: '09:00', checkOutTime: '17:00' },
    guestCount: 12,
    notes: 'Annual theology department retreat. Requires AV setup and breakout room access.',
    requester: { name: 'Dr. James Whitfield', email: 'j.whitfield@seminary.edu', role: 'Faculty' },
    submittedAt: hoursAgo(2),
    updatedAt: hoursAgo(2),
    totalAmount: 480,
  },
  {
    id: 2802,
    title: 'Graduate Research Symposium',
    status: 'pending',
    facility: { building: 'Main Chapel', roomNumber: 'Hall A', roomType: 'Assembly Hall' },
    schedule: { checkIn: '2026-06-10', checkOut: '2026-06-11', checkInTime: '08:00', checkOutTime: '18:00' },
    guestCount: 85,
    notes: 'Multi-day symposium with keynote speakers. Catering will be arranged separately.',
    requester: { name: 'Sarah Mitchell', email: 's.mitchell@seminary.edu', role: 'Graduate Office' },
    submittedAt: hoursAgo(4),
    updatedAt: hoursAgo(3),
    totalAmount: 1200,
  },
  {
    id: 2803,
    title: 'WEEKLY FELLOWSHIP',
    status: 'approved',
    facility: { building: 'House', roomNumber: 'Lounge', roomType: 'Standard Apartment' },
    schedule: { checkIn: '2026-06-04', checkOut: '2026-06-12', checkInTime: '19:00', checkOutTime: '21:00' },
    guestCount: 25,
    notes: null,
    requester: { name: 'Mark Chen', email: 'm.chen@seminary.edu', role: 'Resident' },
    submittedAt: daysAgo(3),
    updatedAt: daysAgo(2),
    totalAmount: 0,
  },
  {
    id: 2804,
    title: 'Youth Ministry Workshop',
    status: 'pending',
    facility: { building: 'Student Ctr', roomNumber: '302', roomType: 'Conference Room' },
    schedule: { checkIn: '2026-06-15', checkOut: '2026-06-15', checkInTime: '10:00', checkOutTime: '16:00' },
    guestCount: 30,
    notes: 'Interactive workshop for youth pastors. Whiteboard and projector needed.',
    requester: { name: 'Emily Rodriguez', email: 'e.rodriguez@seminary.edu', role: 'Faculty' },
    submittedAt: hoursAgo(6),
    updatedAt: hoursAgo(6),
    totalAmount: 150,
  },
  {
    id: 2805,
    title: 'Choir Rehearsal Block',
    status: 'pending',
    facility: { building: 'Main Chapel', roomNumber: 'Sanctuary', roomType: 'Worship Space' },
    schedule: { checkIn: '2026-06-08', checkOut: '2026-06-08', checkInTime: '14:00', checkOutTime: '17:00' },
    guestCount: 40,
    notes: 'Weekly choir rehearsal. Piano is already in the room.',
    requester: { name: 'David Park', email: 'd.park@seminary.edu', role: 'Staff' },
    submittedAt: hoursAgo(8),
    updatedAt: hoursAgo(8),
    totalAmount: 75,
  },
  {
    id: 2806,
    title: 'HVAC SYSTEM UPGRADE',
    status: 'pending',
    facility: { building: 'PCALM', roomNumber: '204', roomType: 'Superior Guest Room' },
    schedule: { checkIn: '2026-06-09', checkOut: '2026-06-14', checkInTime: '07:00', checkOutTime: '17:00' },
    guestCount: 4,
    notes: 'Scheduled maintenance window. Room will be unavailable during this period.',
    requester: { name: 'Facilities Team', email: 'facilities@seminary.edu', role: 'Staff' },
    submittedAt: hoursAgo(12),
    updatedAt: hoursAgo(12),
    totalAmount: 0,
  },
  {
    id: 2807,
    title: 'Library Study Group',
    status: 'pending',
    facility: { building: 'Library', roomNumber: 'Study B', roomType: 'Study Room' },
    schedule: { checkIn: '2026-06-05', checkOut: '2026-06-05', checkInTime: '13:00', checkOutTime: '15:00' },
    guestCount: 8,
    notes: null,
    requester: { name: 'Anna Kowalski', email: 'a.kowalski@seminary.edu', role: 'Resident' },
    submittedAt: hoursAgo(1),
    updatedAt: hoursAgo(1),
    totalAmount: 0,
  },
  {
    id: 2808,
    title: 'Board of Trustees Meeting',
    status: 'pending',
    facility: { building: 'Main Bldg', roomNumber: 'Boardroom', roomType: 'Executive Suite' },
    schedule: { checkIn: '2026-06-20', checkOut: '2026-06-20', checkInTime: '09:00', checkOutTime: '14:00' },
    guestCount: 15,
    notes: 'Quarterly board meeting. Lunch service at 12:00. Confidential materials — restricted access.',
    requester: { name: 'President Office', email: 'president@seminary.edu', role: 'Administration' },
    submittedAt: hoursAgo(18),
    updatedAt: hoursAgo(18),
    totalAmount: 500,
  },
  {
    id: 2809,
    title: 'Dorm A Game Night',
    status: 'pending',
    facility: { building: 'Dorm A', roomNumber: 'Common', roomType: 'Common Area' },
    schedule: { checkIn: '2026-06-07', checkOut: '2026-06-07', checkInTime: '20:00', checkOutTime: '23:00' },
    guestCount: 50,
    notes: 'Resident-organized social event.',
    requester: { name: 'Tom Bradley', email: 't.bradley@seminary.edu', role: 'Resident' },
    submittedAt: hoursAgo(5),
    updatedAt: hoursAgo(5),
    totalAmount: 0,
  },
  {
    id: 2810,
    title: 'Mission Trip Orientation',
    status: 'pending',
    facility: { building: 'Student Ctr', roomNumber: 'Auditorium', roomType: 'Lecture Hall' },
    schedule: { checkIn: '2026-06-12', checkOut: '2026-06-12', checkInTime: '10:00', checkOutTime: '12:00' },
    guestCount: 120,
    notes: 'Pre-departure briefing for summer mission teams.',
    requester: { name: 'Rev. Linda Hayes', email: 'l.hayes@seminary.edu', role: 'Faculty' },
    submittedAt: hoursAgo(24),
    updatedAt: hoursAgo(20),
    totalAmount: 0,
  },
  {
    id: 2811,
    title: 'Counseling Practicum Session',
    status: 'pending',
    facility: { building: 'PCALM', roomNumber: '105', roomType: 'Counseling Suite' },
    schedule: { checkIn: '2026-06-03', checkOut: '2026-06-03', checkInTime: '09:00', checkOutTime: '12:00' },
    guestCount: 6,
    notes: 'Supervised practicum. Privacy required.',
    requester: { name: 'Dr. Patricia Moore', email: 'p.moore@seminary.edu', role: 'Faculty' },
    submittedAt: hoursAgo(3),
    updatedAt: hoursAgo(3),
    totalAmount: 90,
  },
  {
    id: 2812,
    title: 'Seminar Hall B — Guest Lecture',
    status: 'rejected',
    facility: { building: 'Main Bldg', roomNumber: 'Seminar B', roomType: 'Lecture Hall' },
    schedule: { checkIn: '2026-06-18', checkOut: '2026-06-18', checkInTime: '14:00', checkOutTime: '16:00' },
    guestCount: 60,
    notes: 'External speaker event. Rejected due to scheduling conflict.',
    requester: { name: 'Academic Affairs', email: 'academic@seminary.edu', role: 'Administration' },
    submittedAt: daysAgo(5),
    updatedAt: daysAgo(4),
    totalAmount: 200,
  },
  {
    id: 2813,
    title: 'Faculty Prayer Breakfast',
    status: 'pending',
    facility: { building: 'House', roomNumber: 'Dining', roomType: 'Dining Hall' },
    schedule: { checkIn: '2026-06-06', checkOut: '2026-06-06', checkInTime: '07:30', checkOutTime: '09:00' },
    guestCount: 35,
    notes: 'Monthly faculty gathering. Kitchen access required.',
    requester: { name: 'Dean of Faculty', email: 'dean@seminary.edu', role: 'Administration' },
    submittedAt: hoursAgo(10),
    updatedAt: hoursAgo(10),
    totalAmount: 175,
  },
  {
    id: 2814,
    title: 'Archives Research Access',
    status: 'pending',
    facility: { building: 'Library', roomNumber: 'Archives', roomType: 'Special Collections' },
    schedule: { checkIn: '2026-06-11', checkOut: '2026-06-13', checkInTime: '09:00', checkOutTime: '17:00' },
    guestCount: 2,
    notes: 'Visiting scholar requires supervised access to special collections.',
    requester: { name: 'Library Services', email: 'library@seminary.edu', role: 'Staff' },
    submittedAt: hoursAgo(15),
    updatedAt: hoursAgo(15),
    totalAmount: 0,
  },
  {
    id: 2815,
    title: 'Summer Intensive — Hermeneutics',
    status: 'pending',
    facility: { building: 'PCALM', roomNumber: '301', roomType: 'Classroom' },
    schedule: { checkIn: '2026-06-16', checkOut: '2026-06-20', checkInTime: '08:30', checkOutTime: '16:30' },
    guestCount: 28,
    notes: 'Week-long intensive course. Daily setup needed.',
    requester: { name: 'Dr. Robert Ellis', email: 'r.ellis@seminary.edu', role: 'Faculty' },
    submittedAt: hoursAgo(7),
    updatedAt: hoursAgo(7),
    totalAmount: 840,
  },
  {
    id: 2816,
    title: 'Worship Team Practice',
    status: 'pending',
    facility: { building: 'Main Chapel', roomNumber: 'Choir Room', roomType: 'Rehearsal Space' },
    schedule: { checkIn: '2026-06-04', checkOut: '2026-06-04', checkInTime: '18:00', checkOutTime: '20:00' },
    guestCount: 12,
    notes: null,
    requester: { name: 'Worship Ministry', email: 'worship@seminary.edu', role: 'Staff' },
    submittedAt: hoursAgo(9),
    updatedAt: hoursAgo(9),
    totalAmount: 0,
  },
  {
    id: 2817,
    title: 'Alumni Weekend Reception',
    status: 'pending',
    facility: { building: 'Student Ctr', roomNumber: 'Atrium', roomType: 'Event Space' },
    schedule: { checkIn: '2026-06-22', checkOut: '2026-06-22', checkInTime: '17:00', checkOutTime: '21:00' },
    guestCount: 200,
    notes: 'Annual alumni reception. Full AV and catering coordination required.',
    requester: { name: 'Alumni Relations', email: 'alumni@seminary.edu', role: 'Staff' },
    submittedAt: hoursAgo(36),
    updatedAt: hoursAgo(36),
    totalAmount: 2500,
  },
  {
    id: 2818,
    title: 'Cancelled Retreat Planning',
    status: 'cancelled',
    facility: { building: 'Dorm B', roomNumber: 'Lounge', roomType: 'Common Area' },
    schedule: { checkIn: '2026-06-14', checkOut: '2026-06-14', checkInTime: '15:00', checkOutTime: '17:00' },
    guestCount: 10,
    notes: 'Requester cancelled before review.',
    requester: { name: 'Student Council', email: 'council@seminary.edu', role: 'Resident' },
    submittedAt: daysAgo(2),
    updatedAt: daysAgo(1),
    totalAmount: 0,
  },
];

function getMockRequests() {
  return MOCK_MANAGE_REQUESTS.map((r) => ({
    ...r,
    displayId: `#APT-${r.id}`,
    facility: { ...r.facility },
    schedule: { ...r.schedule },
    requester: { ...r.requester },
  }));
}

function renderStatusBadge(status) {
  const config = getStatusConfig(status);
  return `<span class="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full ${config.pillClass}">
    <span class="w-1.5 h-1.5 rounded-full ${config.dotColor}"></span>
    ${escapeHtml(config.label)}
  </span>`;
}

function renderRequestSummaryCard(request, isSelected) {
  const facilityLabel = `${request.facility.building} ${request.facility.roomNumber}`;
  const dateRange = formatDateRange(request.schedule.checkIn, request.schedule.checkOut);
  const relative = formatRelativeTime(request.submittedAt);
  const selectedClass = isSelected ? ' is-selected' : '';
  const ariaSelected = isSelected ? 'true' : 'false';

  return `
    <button
      type="button"
      class="request-summary-card${selectedClass}"
      data-request-id="${request.id}"
      role="option"
      aria-selected="${ariaSelected}"
    >
      <div class="flex items-start justify-between gap-2 mb-1.5">
        <span class="text-[10px] font-bold text-primary uppercase tracking-widest">${escapeHtml(request.displayId)}</span>
        ${renderStatusBadge(request.status)}
      </div>
      <p class="text-body-sm font-bold text-on-surface truncate">${escapeHtml(request.title)}</p>
      <p class="text-[11px] text-on-surface-variant mt-0.5 truncate">${escapeHtml(facilityLabel)}</p>
      <div class="flex items-center justify-between mt-2 gap-2">
        <span class="text-[10px] text-on-surface-variant/80">${escapeHtml(dateRange)}</span>
        <span class="text-[10px] text-on-surface-variant/60 shrink-0">${escapeHtml(relative)}</span>
      </div>
    </button>
  `;
}

function renderRequestList(requests, selectedId) {
  if (!requests.length) {
    return `
      <div class="py-12 px-4 text-center">
        <span class="material-symbols-outlined text-[40px] text-on-surface-variant/40">inbox</span>
        <p class="text-body-sm font-bold text-on-surface mt-3">No requests match your filters</p>
        <p class="text-body-sm text-on-surface-variant mt-1">Try adjusting your search or filters.</p>
        <button type="button" id="manage-requests-clear-filters" class="mt-4 text-primary text-label-md font-bold hover:underline">
          Clear filters
        </button>
      </div>
    `;
  }

  return requests.map((req) => renderRequestSummaryCard(req, String(req.id) === String(selectedId))).join('');
}

function renderListEmptyState() {
  return `
    <div class="py-16 px-4 text-center">
      <span class="material-symbols-outlined text-[48px] text-on-surface-variant/40">inbox</span>
      <p class="text-body-sm font-bold text-on-surface mt-4">No pending requests</p>
      <p class="text-body-sm text-on-surface-variant mt-1">All facility booking requests have been reviewed.</p>
    </div>
  `;
}

function renderDetailEmptyState() {
  return `
    <div class="flex flex-col items-center justify-center py-16 px-4 text-center h-full min-h-[280px]">
      <span class="material-symbols-outlined text-[48px] text-on-surface-variant/40">select_check_box</span>
      <p class="text-body-sm font-bold text-on-surface mt-4">Select a request to view details</p>
      <p class="text-body-sm text-on-surface-variant mt-1 max-w-xs">Choose a request from the list to see booking information and requester details.</p>
    </div>
  `;
}

function renderRequestDetail(request) {
  if (!request) {
    return `
      <div class="py-12 px-4 text-center">
        <p class="text-body-sm text-error font-bold">Request not found.</p>
        <p class="text-body-sm text-on-surface-variant mt-1">The selected request may have been removed.</p>
      </div>
    `;
  }

  const facilityLabel = `${request.facility.building} — ${request.facility.roomNumber}`;
  const timeRange = request.schedule.checkInTime && request.schedule.checkOutTime
    ? `${request.schedule.checkInTime} – ${request.schedule.checkOutTime}`
    : null;

  return `
    <div class="manage-requests-detail-content">
      <button type="button" id="manage-requests-detail-back" class="manage-requests-detail-back items-center gap-1 text-primary text-label-md font-bold mb-4 hover:underline" aria-label="Back to request list">
        <span class="material-symbols-outlined text-[20px]">arrow_back</span>
        Back to list
      </button>

      <div class="flex items-start justify-between gap-4 mb-6">
        <div class="min-w-0">
          <p class="text-[10px] font-bold text-primary uppercase tracking-widest">${escapeHtml(request.displayId)}</p>
          <h3 class="font-headline-sm text-on-surface mt-1">${escapeHtml(request.title)}</h3>
        </div>
        ${renderStatusBadge(request.status)}
      </div>

      <section class="mb-6">
        <h4 class="text-label-sm font-bold text-on-surface-variant uppercase tracking-wide mb-3">Booking Information</h4>
        <dl class="space-y-2.5">
          <div class="flex gap-2">
            <dt class="text-body-sm text-on-surface-variant w-28 shrink-0">Check-in</dt>
            <dd class="text-body-sm text-on-surface">${escapeHtml(formatDateTime(request.schedule.checkIn + 'T' + (request.schedule.checkInTime || '00:00') + ':00'))}</dd>
          </div>
          <div class="flex gap-2">
            <dt class="text-body-sm text-on-surface-variant w-28 shrink-0">Check-out</dt>
            <dd class="text-body-sm text-on-surface">${escapeHtml(formatDateTime(request.schedule.checkOut + 'T' + (request.schedule.checkOutTime || '00:00') + ':00'))}</dd>
          </div>
          ${timeRange ? `
          <div class="flex gap-2">
            <dt class="text-body-sm text-on-surface-variant w-28 shrink-0">Daily hours</dt>
            <dd class="text-body-sm text-on-surface">${escapeHtml(timeRange)}</dd>
          </div>` : ''}
          <div class="flex gap-2">
            <dt class="text-body-sm text-on-surface-variant w-28 shrink-0">Facility</dt>
            <dd class="text-body-sm text-on-surface">${escapeHtml(facilityLabel)}</dd>
          </div>
          <div class="flex gap-2">
            <dt class="text-body-sm text-on-surface-variant w-28 shrink-0">Room type</dt>
            <dd class="text-body-sm text-on-surface">${escapeHtml(request.facility.roomType)}</dd>
          </div>
          ${request.guestCount != null ? `
          <div class="flex gap-2">
            <dt class="text-body-sm text-on-surface-variant w-28 shrink-0">Guests</dt>
            <dd class="text-body-sm text-on-surface">${escapeHtml(request.guestCount)}</dd>
          </div>` : ''}
          ${request.totalAmount != null && request.totalAmount > 0 ? `
          <div class="flex gap-2">
            <dt class="text-body-sm text-on-surface-variant w-28 shrink-0">Amount</dt>
            <dd class="text-body-sm text-on-surface">$${escapeHtml(request.totalAmount.toLocaleString())}</dd>
          </div>` : ''}
        </dl>
      </section>

      <section class="mb-6">
        <h4 class="text-label-sm font-bold text-on-surface-variant uppercase tracking-wide mb-3">Requester</h4>
        <dl class="space-y-2.5">
          <div class="flex gap-2">
            <dt class="text-body-sm text-on-surface-variant w-28 shrink-0">Name</dt>
            <dd class="text-body-sm text-on-surface">${escapeHtml(request.requester.name)}</dd>
          </div>
          <div class="flex gap-2">
            <dt class="text-body-sm text-on-surface-variant w-28 shrink-0">Email</dt>
            <dd class="text-body-sm text-on-surface">${escapeHtml(request.requester.email)}</dd>
          </div>
          <div class="flex gap-2">
            <dt class="text-body-sm text-on-surface-variant w-28 shrink-0">Role</dt>
            <dd class="text-body-sm text-on-surface">${escapeHtml(request.requester.role)}</dd>
          </div>
        </dl>
      </section>

      ${request.notes ? `
      <section class="mb-6">
        <h4 class="text-label-sm font-bold text-on-surface-variant uppercase tracking-wide mb-3">Notes</h4>
        <p class="text-body-sm text-on-surface leading-relaxed">${escapeHtml(request.notes)}</p>
      </section>` : ''}

      <section>
        <h4 class="text-label-sm font-bold text-on-surface-variant uppercase tracking-wide mb-3">Metadata</h4>
        <dl class="space-y-2.5">
          <div class="flex gap-2">
            <dt class="text-body-sm text-on-surface-variant w-28 shrink-0">Submitted</dt>
            <dd class="text-body-sm text-on-surface">${escapeHtml(formatDateTime(request.submittedAt))}</dd>
          </div>
          <div class="flex gap-2">
            <dt class="text-body-sm text-on-surface-variant w-28 shrink-0">Last updated</dt>
            <dd class="text-body-sm text-on-surface">${escapeHtml(formatDateTime(request.updatedAt))}</dd>
          </div>
        </dl>
      </section>
    </div>
  `;
}

function renderListSkeletons(count = 5) {
  return Array.from({ length: count }, () => '<div class="request-skeleton"></div>').join('');
}

function renderDetailSkeleton() {
  return `
    <div class="space-y-4 p-1">
      <div class="detail-skeleton-line w-24"></div>
      <div class="detail-skeleton-line w-3/4 h-5"></div>
      <div class="mt-6 space-y-3">
        <div class="detail-skeleton-line w-full"></div>
        <div class="detail-skeleton-line w-full"></div>
        <div class="detail-skeleton-line w-5/6"></div>
        <div class="detail-skeleton-line w-full"></div>
      </div>
    </div>
  `;
}

function updatePendingBadge(count, isLoading) {
  const el = document.getElementById('manage-requests-pending-badge');
  if (!el) return;
  el.textContent = isLoading ? '—' : `${count} pending`;
}

function updateFooterCount(filtered, total) {
  const el = document.getElementById('manage-requests-footer-count');
  if (!el) return;
  el.textContent = `Showing ${filtered} of ${total} requests`;
}

function updateFacilityFilterOptions(facilities, selected) {
  const select = document.getElementById('manage-requests-facility-filter');
  if (!select) return;

  const options = [
    '<option value="all">All Facilities</option>',
    ...facilities.map((f) => {
      const sel = f === selected ? ' selected' : '';
      return `<option value="${escapeHtml(f)}"${sel}>${escapeHtml(f)}</option>`;
    }),
  ];
  select.innerHTML = options.join('');
}

function syncFilterControls(filter) {
  const search = document.getElementById('manage-requests-search');
  const status = document.getElementById('manage-requests-status-filter');
  const facility = document.getElementById('manage-requests-facility-filter');

  if (search && search.value !== filter.searchQuery) search.value = filter.searchQuery;
  if (status && status.value !== filter.statusFilter) status.value = filter.statusFilter;
  if (facility && facility.value !== filter.facilityFilter) facility.value = filter.facilityFilter;
}

function updateActionButtons(hasSelection) {
  const approve = document.getElementById('manage-requests-approve');
  const reject = document.getElementById('manage-requests-reject');
  if (approve) approve.disabled = !hasSelection;
  if (reject) reject.disabled = !hasSelection;
}

function setLoadingVisible(isLoading) {
  const overlay = document.getElementById('manage-requests-loading');
  if (!overlay) return;
  if (isLoading) {
    overlay.classList.remove('hidden');
    overlay.innerHTML = '<span class="text-label-md text-primary font-bold">Loading...</span>';
  } else {
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
  }
}

function renderModal(state) {
  const listEl = document.getElementById('manage-requests-list');
  const detailEl = document.getElementById('manage-requests-detail');
  const bodyEl = document.getElementById('manage-requests-body');

  if (!listEl || !detailEl) return;

  if (state.isLoading) {
    listEl.innerHTML = renderListSkeletons(6);
    detailEl.innerHTML = renderDetailSkeleton();
    updatePendingBadge(0, true);
    return;
  }

  const { requests, filteredRequests, selectedRequestId } = state;
  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  updatePendingBadge(pendingCount, false);
  updateFooterCount(filteredRequests.length, requests.length);
  updateFacilityFilterOptions(getFacilities(requests), state.filter.facilityFilter);
  syncFilterControls(state.filter);

  if (!requests.length) {
    listEl.innerHTML = renderListEmptyState();
  } else {
    listEl.innerHTML = renderRequestList(filteredRequests, selectedRequestId);
  }

  const selected = filteredRequests.find((r) => String(r.id) === String(selectedRequestId));

  if (!selectedRequestId || !selected) {
    detailEl.innerHTML = renderDetailEmptyState();
    updateActionButtons(false);
  } else {
    detailEl.innerHTML = renderRequestDetail(selected);
    updateActionButtons(true);
  }

  if (bodyEl) {
    bodyEl.classList.toggle('is-mobile-detail', state.mobileDetailView && !!selectedRequestId);
  }
}

let state = {
  isOpen: false,
  isLoading: false,
  selectedRequestId: null,
  requests: [],
  filteredRequests: [],
  filter: createDefaultFilterState(),
  error: null,
  mobileDetailView: false,
};

let initialized = false;
let focusTrapHandler = null;
let previouslyFocused = null;

function recomputeFiltered() {
  state.filteredRequests = filterRequests(state.requests, state.filter);
}

function reconcileSelection() {
  const stillVisible = state.filteredRequests.some(
    (r) => String(r.id) === String(state.selectedRequestId),
  );
  if (!stillVisible) {
    state.selectedRequestId = state.filteredRequests.length
      ? state.filteredRequests[0].id
      : null;
  }
}

function render() {
  renderModal(state);
}

function setFilter(partial) {
  state.filter = { ...state.filter, ...partial };
  recomputeFiltered();
  reconcileSelection();
  render();
}

function selectRequest(id) {
  state.selectedRequestId = id;
  state.mobileDetailView = true;
  render();
}

function resetState() {
  state.filter = createDefaultFilterState();
  state.selectedRequestId = null;
  state.mobileDetailView = false;
  state.error = null;
  recomputeFiltered();
  reconcileSelection();
}

async function refreshRequests() {
  state.isLoading = true;
  render();

  await new Promise((resolve) => setTimeout(resolve, LOADING_DELAY_MS));

  state.requests = getMockRequests().map(enrichRequest);
  recomputeFiltered();
  reconcileSelection();
  if (!state.selectedRequestId && state.filteredRequests.length) {
    state.selectedRequestId = state.filteredRequests[0].id;
  }
  state.isLoading = false;
  render();
}

function getFocusableElements() {
  const modal = document.getElementById('manage-requests-modal');
  if (!modal) return [];
  return Array.from(
    modal.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => el.offsetParent !== null || el === document.activeElement);
}

function trapFocus(e) {
  if (!state.isOpen || e.key !== 'Tab') return;

  const focusable = getFocusableElements();
  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

function bindFocusTrap() {
  focusTrapHandler = trapFocus;
  document.addEventListener('keydown', focusTrapHandler);
}

function unbindFocusTrap() {
  if (focusTrapHandler) {
    document.removeEventListener('keydown', focusTrapHandler);
    focusTrapHandler = null;
  }
}

function showModal() {
  const overlay = document.getElementById('manage-requests-overlay');
  const modal = document.getElementById('manage-requests-modal');

  overlay?.classList.remove('hidden');
  modal?.classList.remove('hidden');
  overlay?.setAttribute('aria-hidden', 'false');
  modal?.setAttribute('aria-hidden', 'false');

  document.body.style.overflow = 'hidden';
  bindFocusTrap();

  const search = document.getElementById('manage-requests-search');
  if (search) {
    previouslyFocused = document.activeElement;
    search.focus();
  }
}

function hideModal() {
  const overlay = document.getElementById('manage-requests-overlay');
  const modal = document.getElementById('manage-requests-modal');

  overlay?.classList.add('hidden');
  modal?.classList.add('hidden');
  overlay?.setAttribute('aria-hidden', 'true');
  modal?.setAttribute('aria-hidden', 'true');

  document.body.style.overflow = '';
  unbindFocusTrap();

  if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
    previouslyFocused.focus();
  }
  previouslyFocused = null;
}

export function isManageRequestsModalOpen() {
  return state.isOpen;
}

export async function openManageRequestsModal() {
  if (state.isOpen) return;

  state.isOpen = true;
  showModal();
  await refreshRequests();

  if (!state.selectedRequestId && state.filteredRequests.length) {
    state.selectedRequestId = state.filteredRequests[0].id;
    render();
  }

  window.dispatchEvent(new CustomEvent('manage-requests:opened'));
}

export function closeManageRequestsModal() {
  if (!state.isOpen) return;

  state.isOpen = false;
  hideModal();
  resetState();
  render();

  window.dispatchEvent(new CustomEvent('manage-requests:closed'));
}

function handleApproveStub() {
  if (!state.selectedRequestId) return;
}

function handleRejectStub() {
  if (!state.selectedRequestId) return;
}

function clearFilters() {
  state.filter = createDefaultFilterState();
  recomputeFiltered();
  reconcileSelection();
  render();
}

function toggleMobileFilters() {
  const panel = document.getElementById('manage-requests-advanced-filters');
  const toggle = document.getElementById('manage-requests-filters-toggle');
  if (!panel || !toggle) return;

  const isExpanded = panel.classList.toggle('is-expanded');
  toggle.setAttribute('aria-expanded', String(isExpanded));
}

function handleDelegatedClick(e) {
  const card = e.target.closest('[data-request-id]');
  if (card) {
    const id = card.getAttribute('data-request-id');
    if (id) selectRequest(Number(id));
    return;
  }

  if (e.target.closest('#manage-requests-clear-filters')) {
    clearFilters();
    return;
  }

  if (e.target.closest('#manage-requests-detail-back')) {
    state.mobileDetailView = false;
    render();
  }
}

function handleKeydown(e) {
  if (!state.isOpen) return;

  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const list = state.filteredRequests;
    if (!list.length) return;

    const currentIdx = list.findIndex((r) => String(r.id) === String(state.selectedRequestId));
    let nextIdx = currentIdx;

    if (e.key === 'ArrowDown') {
      nextIdx = currentIdx < list.length - 1 ? currentIdx + 1 : 0;
    } else {
      nextIdx = currentIdx > 0 ? currentIdx - 1 : list.length - 1;
    }

    if (nextIdx !== currentIdx || currentIdx === -1) {
      e.preventDefault();
      selectRequest(list[nextIdx === -1 ? 0 : nextIdx].id);
    }
  }
}

export function initManageRequestsModal() {
  if (initialized) return;
  initialized = true;

  const debouncedSearch = debounce((value) => {
    setFilter({ searchQuery: value });
  }, 300);

  document.getElementById('manage-requests-close')?.addEventListener('click', closeManageRequestsModal);
  document.getElementById('manage-requests-footer-close')?.addEventListener('click', closeManageRequestsModal);
  document.getElementById('manage-requests-overlay')?.addEventListener('click', closeManageRequestsModal);

  document.getElementById('manage-requests-search')?.addEventListener('input', (e) => {
    debouncedSearch(e.target.value);
  });

  document.getElementById('manage-requests-status-filter')?.addEventListener('change', (e) => {
    setFilter({ statusFilter: e.target.value });
  });

  document.getElementById('manage-requests-facility-filter')?.addEventListener('change', (e) => {
    setFilter({ facilityFilter: e.target.value });
  });

  document.getElementById('manage-requests-refresh')?.addEventListener('click', () => {
    refreshRequests();
  });

  document.getElementById('manage-requests-approve')?.addEventListener('click', handleApproveStub);
  document.getElementById('manage-requests-reject')?.addEventListener('click', handleRejectStub);
  document.getElementById('manage-requests-filters-toggle')?.addEventListener('click', toggleMobileFilters);

  document.getElementById('manage-requests-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'manage-requests-modal') {
      closeManageRequestsModal();
      return;
    }
    handleDelegatedClick(e);
  });

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-open-manage-requests]');
    if (trigger) {
      e.preventDefault();
      openManageRequestsModal();
    }
  });

  document.addEventListener('keydown', (e) => {
    const trigger = e.target.closest('[data-open-manage-requests]');
    if (trigger && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      openManageRequestsModal();
    }
  });

  document.addEventListener('keydown', handleKeydown);

  state.requests = getMockRequests().map(enrichRequest);
  recomputeFiltered();
  render();
}

