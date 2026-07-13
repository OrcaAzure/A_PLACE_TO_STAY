/**
 * Guest My Stays page — room/venue lists, booking modal, modify/cancel.
 */
import { applyRoleUI } from '/assets/js/services/auth.js';
import {
getBookings, getGroups, updateBooking, updateGroup,
normalizeBooking, formatGroupId,
getFacilityBookings, updateFacilityBooking, normalizeFacilityBooking, checkVenueSlotAvailability,
getFiscalYear, getSupportContact,
} from '/assets/js/services/api.js';
import {
canGuestCancelRoomBooking, canGuestCancelVenueBooking, canGuestModifyRoomBooking, canGuestModifyVenueBooking,
lifecyclePhaseForBooking, venuePhaseLabel, normStatus,
} from '/assets/js/features/reservation-shared.js';
import {
  parseBookQuery, priceNoticeHtml, hasCompleteBookIntent,
  validateVenueCapacityClient, validateVenueDurationClient,
} from '/assets/js/features/guest-booking-flow.js';
import { initGuestRoomBookingModal } from '/assets/js/features/guest-room-booking-modal.js';
import { loadGuestInvoices } from '/assets/js/features/guest-invoices.js';
import { createBookingPoll } from '/assets/js/layout/booking-poll.js';
import { jsonFingerprint, updateStat } from '/assets/js/layout/silent-refresh.js';
import { openGuestModifyWizard, confirmGuestCancelReservation, cancelRoomReservation, cancelVenueReservation } from '/assets/js/features/booking-actions.js';

export async function bootstrapGuestMyStaysPage() {
    async function loadSupportReplyMail() {
      const link = document.getElementById('guest-support-reply-mail');
      const text = document.getElementById('guest-support-reply-mail-text');
      if (!link || !text) return;
      try {
        const contact = await getSupportContact();
        const email = contact.email || 'facilities@apts.edu.ph';
        text.textContent = email;
        link.href = `mailto:${encodeURIComponent(email)}`;
        link.title = `Email ${contact.label || 'facilities team'} at ${email}`;
      } catch {
        text.textContent = 'facilities@apts.edu.ph';
        link.href = 'mailto:facilities@apts.edu.ph';
      }
    }
    loadSupportReplyMail();
  
    document.getElementById('booking-price-notice').innerHTML = priceNoticeHtml();

    const BLOCKED_BUILDINGS = [];
    const { readOnly } = applyRoleUI();
  
    let cancellationCutoffHours = 24;
    try {
      const fyInfo = await getFiscalYear();
      const settings = fyInfo.settings || {};
      cancellationCutoffHours = Number(
        settings.guest_cancellation_cutoff_hours
        ?? (settings.guest_cancellation_cutoff_days != null ? settings.guest_cancellation_cutoff_days * 24 : 24)
      );
      const policyEl = document.getElementById('res-policy-text');
      if (policyEl && fyInfo.cancellationPolicyLabel) {
        policyEl.textContent = `${fyInfo.cancellationPolicyLabel} Events or stays that have already started cannot be cancelled online.`;
      }
    } catch (err) {
      console.warn('Cancellation policy unavailable', err);
    }
  
    const cancelOpts = { cutoffHours: cancellationCutoffHours };
  
    function showGuestActionError(message) {
      const el = document.getElementById('guest-res-action-error');
      if (!el) return;
      el.textContent = message;
      el.classList.remove('hidden');
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  
    function clearGuestActionError() {
      document.getElementById('guest-res-action-error')?.classList.add('hidden');
    }
  
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    cancelOpts.now = now;
    document.getElementById('current-month-label').textContent =
      now.toLocaleString('default', { month: 'long', year: 'numeric' });
  
    const peso = (n) => `\u20B1${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
    const fmtDate = (d) => {
      if (!d) return '—';
      const raw = String(d).slice(0, 10);
      const dt = new Date(`${raw}T00:00:00`);
      return Number.isNaN(dt.getTime()) ? raw : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };
  
    function statusBadge(status) {
      const map = {
        approved:  'bg-emerald-500/10 text-emerald-700',
        pending:   'bg-amber-500/10 text-amber-700',
        rejected:  'bg-red-500/10 text-red-700',
        cancelled: 'bg-red-500/10 text-red-700',
      };
      return map[status] || 'bg-surface-container text-on-surface-variant';
    }
  
    /* Smooth count-up for stat numbers (initial load only; polls update silently) */
    function countTo(el, target, { animate = true } = {}) {
      updateStat(el, target, { animate });
    }
  
    let lastBookingsFingerprint = '';
    let lastVenueBookingsFingerprint = '';
  
    /* ---------- Featured (next active/upcoming) card ---------- */
    function renderFeatured(bookings, { silent = false } = {}) {
      const wrap = document.getElementById('featured-card');
      const candidates = bookings
        .filter((b) => b.status === 'approved' && b.endDate >= todayStr)
        .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
      const feat = candidates[0];
      if (!feat) { wrap.classList.add('hidden'); return; }
  
      const isActive = feat.startDate <= todayStr && feat.endDate >= todayStr;
      const days = Math.max(0, Math.ceil((new Date(`${feat.startDate}T00:00:00`) - now) / 86400000));
      const startInfo = isActive
        ? '<span class="text-emerald-600 font-bold">In progress</span>'
        : `Starts in <span class="text-primary font-bold">${days} day${days === 1 ? '' : 's'}</span>`;
      const isGroup = feat.kind === 'group';
      const idLabel = isGroup ? formatGroupId(feat.id) : `#APT-${feat.id}`;
  
      wrap.className = silent
        ? 'relative overflow-hidden bg-gradient-to-br from-primary to-primary-container text-white rounded-2xl shadow-lg p-6'
        : 'relative overflow-hidden bg-gradient-to-br from-primary to-primary-container text-white rounded-2xl shadow-lg p-6 reveal';
      wrap.innerHTML = `
        <div class="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-2xl${silent ? '' : ' float-blob'}"></div>
        <div class="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div class="flex items-center gap-2 mb-2">
              <span class="w-2 h-2 rounded-full bg-emerald-300${silent ? '' : ' live-dot'}"></span>
              <span class="text-[11px] font-bold uppercase tracking-widest text-white/80">${isActive ? 'Active stay' : 'Approved & upcoming'}</span>
            </div>
            <h3 class="font-headline-md text-headline-md">${feat.facilityLabel || feat.title}</h3>
            <p class="text-body-sm text-white/80 flex items-center gap-1 mt-1">
              <span class="material-symbols-outlined text-[18px]">confirmation_number</span>${idLabel}
            </p>
            <p class="text-body-sm text-white/80 flex items-center gap-1 mt-1">
              <span class="material-symbols-outlined text-[18px]">calendar_month</span>${fmtDate(feat.startDate)} \u2192 ${fmtDate(feat.endDate)}
            </p>
          </div>
          <div class="text-right shrink-0">
            <p class="text-label-sm text-white/70">${startInfo}</p>
            <p class="text-white font-bold text-headline-lg mt-1">${feat.guestCount || 1}</p>
            <p class="text-[11px] uppercase tracking-wider text-white/70">Guest(s)</p>
          </div>
        </div>`;
      wrap.classList.remove('hidden');
    }
  
    function lifecycleGuestBadge(booking) {
      const phase = lifecyclePhaseForBooking(booking);
      if (!phase) return '';
      const styles = {
        upcoming: 'bg-blue-50 text-blue-800',
        active: 'bg-emerald-50 text-emerald-800',
        past: 'bg-slate-100 text-slate-600',
      };
      return `<span class="${styles[phase] || 'bg-surface-container text-on-surface-variant'} px-2 py-0.5 rounded text-[10px] font-bold uppercase mr-2">${venuePhaseLabel(phase)}</span>`;
    }
  
    function renderCard(b, index, { silent = false } = {}) {
      const isGroup = b.kind === 'group';
      const idLabel = isGroup ? formatGroupId(b.id) : `#APT-${b.id}`;
      const amount = b.totalAmount != null ? peso(b.totalAmount) : '';
      const amountLabel = normStatus(b.status) === 'pending' ? 'Estimated total' : 'Total';
      const lifecycleBadge = lifecycleGuestBadge(b);
      const canModify = !readOnly && canGuestModifyRoomBooking(b, cancelOpts);
      const canCancel = !readOnly && canGuestCancelRoomBooking(b, cancelOpts);
      const typeBadge = isGroup
        ? '<span class="bg-primary/10 text-primary px-2 py-0.5 rounded text-[10px] font-bold uppercase mr-2">Group</span>'
        : '<span class="bg-surface-container text-on-surface-variant px-2 py-0.5 rounded text-[10px] font-bold uppercase mr-2">Single</span>';
      const revealCls = silent ? '' : ' reveal';
      const revealDelay = silent ? '' : ` style="animation-delay:${0.05 * index}s"`;
      return `
        <div class="group bg-white p-5 rounded-2xl border border-outline-variant hover:border-primary/40 hover:shadow-lg lift${revealCls}"${revealDelay} data-booking-id="${b.id}" data-kind="${b.kind || 'single'}">
          <div class="flex flex-col sm:flex-row gap-6">
            <div class="flex-1">
              <div class="flex justify-between items-start mb-2">
                <div>
                  <h4 class="font-headline-sm text-headline-sm flex items-center flex-wrap gap-1">${typeBadge}${lifecycleBadge}${idLabel}</h4>
                  <p class="text-body-sm text-on-surface-variant mt-0.5">${b.facilityLabel || b.title}</p>
                </div>
                <span class="${statusBadge(b.status)} px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">${b.status}</span>
              </div>
              <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                <div>
                  <p class="text-[11px] font-bold text-on-surface-variant uppercase">Check-in</p>
                  <p class="text-body-sm font-medium">${fmtDate(b.startDate)}</p>
                </div>
                <div>
                  <p class="text-[11px] font-bold text-on-surface-variant uppercase">Check-out</p>
                  <p class="text-body-sm font-medium">${fmtDate(b.endDate)}</p>
                </div>
                <div>
                  <p class="text-[11px] font-bold text-on-surface-variant uppercase">Guests</p>
                  <p class="text-body-sm font-medium">${b.guestCount || 1}</p>
                </div>
                ${amount ? `<div><p class="text-[11px] font-bold text-on-surface-variant uppercase">${amountLabel}</p><p class="text-body-sm font-medium">${amount}</p></div>` : ''}
              </div>
            </div>
          </div>
          <div class="flex justify-end gap-3 mt-4 pt-4 border-t border-outline-variant/60">
            ${canModify ? `<button type="button" class="modify-booking-btn px-4 py-2 text-label-md font-label-md text-primary hover:bg-primary/10 rounded-lg transition-colors" data-id="${b.id}" data-kind="${b.kind || 'single'}">Modify</button>` : ''}
            ${canCancel ? `<button type="button" class="cancel-booking-btn px-4 py-2 text-label-md font-label-md text-on-surface-variant hover:text-error hover:bg-error-container rounded-lg transition-colors" data-id="${b.id}" data-kind="${b.kind || 'single'}">${b.status === 'pending' ? 'Cancel request' : 'Cancel reservation'}</button>` : ''}
          </div>
        </div>`;
    }
  
    let allBookings = [];
    let activeStatus = '';
    let searchTerm = '';
  
    async function loadBookings({ background = false } = {}) {
      try {
        const [raw, groups, venueRows] = await Promise.all([
          getBookings(),
          getGroups(),
          // Stats on this page should reflect both room stays + venue bookings.
          getFacilityBookings(),
        ]);
        const singles = raw
          .filter((b) => !b.group_id)
          .map(normalizeBooking)
          .filter((b) => !isBlockedBuilding(b.buildingName));
        const groupItems = groups.map((g) => ({
          kind: 'group',
          id: g.id,
          title: g.group_name,
          facilityLabel: `${g.room_count || 0} room(s) assigned Â· ${g.total_guests} guest(s)`,
          startDate: String(g.check_in).slice(0, 10),
          endDate: String(g.check_out).slice(0, 10),
          status: (g.status || 'Pending').toLowerCase(),
          guestCount: g.total_guests,
          totalAmount: g.grand_total,
        }));
        allBookings = [...singles, ...groupItems].sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)));

        const venueBookingsForStats = (venueRows || []).map(normalizeFacilityBooking);
        const combinedForStats = [...allBookings, ...venueBookingsForStats];
        const fp = jsonFingerprint(combinedForStats);
        if (background && fp === lastBookingsFingerprint) return;
        lastBookingsFingerprint = fp;

        const animateStats = !background;

        countTo(document.getElementById('stat-total'), combinedForStats.length, { animate: animateStats });
        countTo(document.getElementById('stat-pending'), combinedForStats.filter((b) => normStatus(b.status) === 'pending').length, { animate: animateStats });
        countTo(document.getElementById('stat-approved'), combinedForStats.filter((b) => normStatus(b.status) === 'approved').length, { animate: animateStats });
        countTo(
          document.getElementById('stat-upcoming'),
          combinedForStats.filter((b) => normStatus(b.status) === 'approved' && String(b.startDate || '') >= todayStr).length,
          { animate: animateStats },
        );

        renderFeatured(allBookings, { silent: background });
        applyAndRender({ silent: background });
        if (!background) await loadGuestInvoices();
      } catch (err) {
        if (background) return;
        document.getElementById('reservations-list').innerHTML =
          `<div class="text-center py-12 text-error animate-fade-in"><span class="material-symbols-outlined text-[40px] mb-2 block">error</span><p>${err.message}</p></div>`;
      }
    }
  
    function applyAndRender({ silent = false } = {}) {
      let items = allBookings;
      if (activeStatus) items = items.filter((b) => b.status === activeStatus);
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        items = items.filter((b) =>
          String(b.id).includes(q) ||
          (b.facilityLabel || '').toLowerCase().includes(q) ||
          (b.title || '').toLowerCase().includes(q) ||
          (b.status || '').toLowerCase().includes(q));
      }
      renderList(items, { silent });
    }
  
    function renderList(bookings, { silent = false } = {}) {
      const list = document.getElementById('reservations-list');
      if (!bookings.length) {
        list.innerHTML = `
          <div class="text-center py-16 text-on-surface-variant animate-fade-in">
            <span class="material-symbols-outlined text-[48px] mb-2 block">event_busy</span>
            <p class="font-body-md text-body-md">No reservations found.</p>
            ${readOnly ? '' : '<a href="/guest/facilities.html?category=guest-houses" class="mt-4 inline-flex items-center gap-1 text-primary font-label-md hover:underline no-underline"><span class="material-symbols-outlined text-[18px]">explore</span>Browse rooms to book</a>'}
          </div>`;
        return;
      }
      list.innerHTML = bookings.map((b, i) => renderCard(b, i, { silent })).join('');
    }
  
    document.getElementById('reservations-list')?.addEventListener('click', async (e) => {
      const modifyBtn = e.target.closest('.modify-booking-btn');
      if (modifyBtn) {
        const id = modifyBtn.dataset.id;
        const kind = modifyBtn.dataset.kind || 'single';
        const booking = allBookings.find((b) => String(b.id) === String(id) && (b.kind || 'single') === kind);
        if (booking) openGuestModifyWizard(booking);
        return;
      }
      const cancelBtn = e.target.closest('.cancel-booking-btn');
      if (cancelBtn) {
        await cancelBooking(cancelBtn.dataset.id, cancelBtn.dataset.kind);
      }
    });
  
    async function cancelBooking(id, kind = 'single') {
      const booking = allBookings.find((b) => String(b.id) === String(id) && (b.kind || 'single') === kind);
      if (!booking) return;
      const confirmed = await confirmGuestCancelReservation(booking);
      if (!confirmed) return;
      try {
        await cancelRoomReservation(id, { kind });
        clearGuestActionError();
        await loadBookings();
      } catch (err) {
        showGuestActionError(err.message || 'Could not cancel this reservation.');
      }
    }
  
    /* ---------- Status filter ---------- */
    document.getElementById('status-filter')?.addEventListener('change', (e) => {
      activeStatus = e.target.value;
      applyAndRender();
    });
  
    let searchTimer;
    document.getElementById('reservation-search')?.addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        searchTerm = e.target.value.trim();
        applyAndRender();
      }, 250);
    });
  
    /* ---------- Modal helpers (animated) ---------- */
    function openModal(overlay) {
      overlay.classList.remove('is-hidden');
      document.body.style.overflow = 'hidden';
    }
    function closeModal(overlay) {
      overlay.classList.add('is-hidden');
      document.body.style.overflow = '';
    }
  
    /* ---------- Booking modal ---------- */
    const { openSearchBooking, openConfirmBooking, closeBookingModal } = await initGuestRoomBookingModal({
      readOnly,
      blockedBuildings: BLOCKED_BUILDINGS,
      onBookingCreated: loadBookings,
    });

    /* ---------- Venue Bookings tab ---------- */
    function escapeHtml(str) {
      return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
  
    let allVenueBookings = [];
    let venueActiveStatus = '';
    let venueSearchTerm = '';
    let venueBookingsLoaded = false;
  
    function refreshVenueCountsInStats({ animate = true } = {}) {
      // Keep the top summary in sync when the venue tab loads/cancels.
      const combinedForStats = [...allBookings, ...allVenueBookings];
      countTo(document.getElementById('stat-total'), combinedForStats.length, { animate });
      countTo(document.getElementById('stat-pending'), combinedForStats.filter((b) => normStatus(b.status) === 'pending').length, { animate });
      countTo(document.getElementById('stat-approved'), combinedForStats.filter((b) => normStatus(b.status) === 'approved').length, { animate });
      countTo(
        document.getElementById('stat-upcoming'),
        combinedForStats.filter((b) => normStatus(b.status) === 'approved' && String(b.startDate || '') >= todayStr).length,
        { animate },
      );
    }
  
    function renderVenueCard(b, index, { silent = false } = {}) {
      const idLabel = `#VEN-${b.id}`;
      const amount = b.totalAmount != null ? peso(b.totalAmount) : '';
      const phaseBadge = lifecycleGuestBadge(b);
      const canCancel = !readOnly && canGuestCancelVenueBooking(b, { cutoffHours: cancellationCutoffHours });
      const canModify = !readOnly && canGuestModifyVenueBooking(b, { cutoffHours: cancellationCutoffHours });
      const revealCls = silent ? '' : ' reveal';
      const revealDelay = silent ? '' : ` style="animation-delay:${0.05 * index}s"`;
      return `
        <div class="group bg-white p-5 rounded-2xl border border-outline-variant hover:border-primary/40 hover:shadow-lg lift${revealCls}"${revealDelay} data-venue-id="${b.id}">
          <div class="flex flex-col sm:flex-row gap-6">
            <div class="flex-1">
              <div class="flex justify-between items-start mb-2">
                <div>
                  <h4 class="font-headline-sm text-headline-sm flex items-center flex-wrap gap-1">
                    <span class="bg-secondary/10 text-secondary px-2 py-0.5 rounded text-[10px] font-bold uppercase">Venue</span>
                    ${phaseBadge}
                    <span>${idLabel}</span>
                  </h4>
                  <p class="text-body-sm font-medium text-on-surface mt-1">${escapeHtml(b.venueName || b.title)}</p>
                  <p class="text-body-sm text-on-surface-variant mt-0.5">${escapeHtml(b.venueCategory || '')}</p>
                </div>
                <span class="${statusBadge(normStatus(b.status))} px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0">${normStatus(b.status)}</span>
              </div>
              <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                <div>
                  <p class="text-[11px] font-bold text-on-surface-variant uppercase">Event date</p>
                  <p class="text-body-sm font-medium">${fmtDate(b.eventDate)}</p>
                </div>
                <div>
                  <p class="text-[11px] font-bold text-on-surface-variant uppercase">Time</p>
                  <p class="text-body-sm font-medium">${escapeHtml(b.startLabel)} – ${escapeHtml(b.endLabel)}</p>
                </div>
                <div>
                  <p class="text-[11px] font-bold text-on-surface-variant uppercase">Guests</p>
                  <p class="text-body-sm font-medium">${b.guestCount || 1}</p>
                </div>
                ${amount ? `<div><p class="text-[11px] font-bold text-on-surface-variant uppercase">Est. total</p><p class="text-body-sm font-medium">${amount}</p></div>` : ''}
              </div>
            </div>
          </div>
          <div class="flex justify-end gap-3 mt-4 pt-4 border-t border-outline-variant/60">
            ${canModify ? `<button type="button" class="modify-fb-btn px-4 py-2 text-label-md font-label-md text-primary hover:bg-primary/10 rounded-lg transition-colors" data-fb-id="${b.id}">Modify</button>` : ''}
            ${canCancel ? `<button type="button" class="cancel-fb-btn px-4 py-2 text-label-md font-label-md text-on-surface-variant hover:text-error hover:bg-error-container rounded-lg transition-colors" data-fb-id="${b.id}">${normStatus(b.status) === 'pending' ? 'Cancel request' : 'Cancel reservation'}</button>` : ''}
          </div>
        </div>`;
    }
  
    function applyAndRenderVenues({ silent = false } = {}) {
      let items = allVenueBookings;
      if (venueActiveStatus) items = items.filter((b) => normStatus(b.status) === venueActiveStatus);
      if (venueSearchTerm) {
        const q = venueSearchTerm.toLowerCase();
        items = items.filter((b) =>
          String(b.id).includes(q) ||
          (b.venueName || '').toLowerCase().includes(q) ||
          (b.venueCategory || '').toLowerCase().includes(q) ||
          normStatus(b.status).includes(q));
      }
      renderVenueList(items, { silent });
    }
  
    function renderVenueList(bookings, { silent = false } = {}) {
      const mount = document.getElementById('venue-bookings-list');
      if (!mount) return;
      if (!bookings.length) {
        mount.innerHTML = `
          <div class="text-center py-16 text-on-surface-variant animate-fade-in">
            <span class="material-symbols-outlined text-[48px] mb-2 block">event_busy</span>
            <p class="font-body-md text-body-md">No venue bookings found.</p>
            ${readOnly ? '' : '<a href="/guest/facilities.html?focus=venues" class="mt-4 inline-flex items-center gap-1 text-primary font-label-md hover:underline no-underline"><span class="material-symbols-outlined text-[18px]">explore</span>Browse venues to book</a>'}
          </div>`;
        return;
      }
      mount.innerHTML = bookings.map((b, i) => renderVenueCard(b, i, { silent })).join('');
    }
  
    async function loadVenueBookings({ background = false } = {}) {
      const mount = document.getElementById('venue-bookings-list');
      if (!mount) return;
      if (!background && !venueBookingsLoaded) {
        mount.innerHTML = `
          <div class="skeleton h-28 rounded-2xl"></div>
          <div class="skeleton h-28 rounded-2xl"></div>`;
      }
      try {
        const rows = await getFacilityBookings();
        allVenueBookings = rows.map(normalizeFacilityBooking)
          .sort((a, b) => `${b.eventDate}${b.startTime}`.localeCompare(`${a.eventDate}${a.startTime}`));

        const fp = jsonFingerprint(allVenueBookings);
        if (background && fp === lastVenueBookingsFingerprint) return;
        lastVenueBookingsFingerprint = fp;

        venueBookingsLoaded = true;
        refreshVenueCountsInStats({ animate: !background });
        applyAndRenderVenues({ silent: background });
      } catch (err) {
        if (background) return;
        mount.innerHTML = `<div class="text-center py-12 text-error animate-fade-in"><span class="material-symbols-outlined text-[40px] mb-2 block">error</span><p>${escapeHtml(err.message)}</p></div>`;
      }
    }
  
    document.getElementById('venue-bookings-list')?.addEventListener('click', async (e) => {
      const modifyBtn = e.target.closest('.modify-fb-btn');
      if (modifyBtn) {
        const id = modifyBtn.dataset.fbId;
        const booking = allVenueBookings.find((b) => String(b.id) === String(id));
        if (booking) openVenueModifyModal(booking);
        return;
      }
      const btn = e.target.closest('.cancel-fb-btn');
      if (!btn) return;
      const booking = allVenueBookings.find((b) => String(b.id) === String(btn.dataset.fbId));
      if (!booking) return;
      const confirmed = await confirmGuestCancelReservation({ ...booking, kind: 'venue' });
      if (!confirmed) return;
      try {
        await cancelVenueReservation(btn.dataset.fbId);
        clearGuestActionError();
        await loadVenueBookings();
      } catch (err) {
        showGuestActionError(err.message || 'Could not cancel this venue booking.');
      }
    });
  
    const venueModifyOverlay = document.getElementById('venue-modify-overlay');
    let venueModifyTarget = null;
  
    function openVenueModifyModal(booking) {
      venueModifyTarget = booking;
      document.getElementById('venue-modify-venue-name').textContent = booking.venueName || booking.title || 'Venue booking';
      document.getElementById('venue-modify-date').value = booking.eventDate || '';
      document.getElementById('venue-modify-start').value = booking.startTime || '';
      document.getElementById('venue-modify-end').value = booking.endTime || '';
      document.getElementById('venue-modify-guests').value = booking.guestCount || 1;
      document.getElementById('venue-modify-message').value = '';
      const approved = normStatus(booking.status) === 'approved';
      document.getElementById('venue-modify-approved-banner').classList.toggle('hidden', !approved);
      document.getElementById('venue-modify-message-wrap').classList.toggle('hidden', !approved);
      document.getElementById('venue-modify-error').classList.add('hidden');
      openModal(venueModifyOverlay);
    }
  
    function closeVenueModifyModal() {
      venueModifyTarget = null;
      closeModal(venueModifyOverlay);
    }
  
    document.getElementById('venue-modify-close')?.addEventListener('click', closeVenueModifyModal);
    document.getElementById('venue-modify-cancel')?.addEventListener('click', closeVenueModifyModal);
    venueModifyOverlay?.addEventListener('click', (e) => { if (e.target === venueModifyOverlay) closeVenueModifyModal(); });
  
    document.getElementById('venue-modify-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!venueModifyTarget) return;
      const errorEl = document.getElementById('venue-modify-error');
      errorEl.classList.add('hidden');
      const approved = normStatus(venueModifyTarget.status) === 'approved';
      const message = document.getElementById('venue-modify-message').value.trim();
      if (approved && !message) {
        errorEl.textContent = 'Please explain what you want changed.';
        errorEl.classList.remove('hidden');
        return;
      }
      const eventDate = document.getElementById('venue-modify-date').value;
      const startTime = document.getElementById('venue-modify-start').value;
      const endTime = document.getElementById('venue-modify-end').value;
      const guestCount = Number(document.getElementById('venue-modify-guests').value) || 1;
      if (!eventDate || !startTime || !endTime) {
        errorEl.textContent = 'Please set the event date and times.';
        errorEl.classList.remove('hidden');
        return;
      }
      if (endTime <= startTime) {
        errorEl.textContent = 'End time must be after start time.';
        errorEl.classList.remove('hidden');
        return;
      }
      const submitBtn = document.getElementById('venue-modify-submit');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Checking…';
      try {
        const slot = await checkVenueSlotAvailability({
          facility_id: venueModifyTarget.facilityId,
          event_date: eventDate,
          start_time: startTime,
          end_time: endTime,
          exclude_booking_id: venueModifyTarget.id,
        });
        const capacityError = validateVenueCapacityClient(slot, guestCount);
        if (capacityError) throw new Error(capacityError);
        const durationError = validateVenueDurationClient(slot, startTime, endTime);
        if (durationError) throw new Error(durationError);
        if (!slot.available) throw new Error(slot.message || 'This time slot is not available.');

        submitBtn.textContent = 'Saving…';
        await updateFacilityBooking(venueModifyTarget.id, {
          event_date: eventDate,
          start_time: startTime,
          end_time: endTime,
          guest_count: guestCount,
          modification_message: approved ? message : (message || undefined),
        });
        closeVenueModifyModal();
        await loadVenueBookings();
        await loadBookings({ background: true });
      } catch (err) {
        errorEl.textContent = err.message || 'Could not save changes';
        errorEl.classList.remove('hidden');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit changes';
      }
    });
  
    window.addEventListener('booking:updated', () => {
      loadBookings({ background: true });
      if (venueBookingsLoaded) loadVenueBookings({ background: true });
    });
  
    document.getElementById('venue-status-filter')?.addEventListener('change', (e) => {
      venueActiveStatus = e.target.value;
      applyAndRenderVenues();
    });
  
    let venueSearchTimer;
    document.getElementById('venue-bookings-search')?.addEventListener('input', (e) => {
      clearTimeout(venueSearchTimer);
      venueSearchTimer = setTimeout(() => {
        venueSearchTerm = e.target.value.trim();
        applyAndRenderVenues();
      }, 250);
    });
  
    function switchResTab(target) {
      document.querySelectorAll('[data-res-tab]').forEach((b) => {
        const on = b.dataset.resTab === target;
        b.classList.toggle('app-tab-active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      document.querySelectorAll('[data-res-panel]').forEach((panel) => {
        const show = panel.dataset.resPanel === target;
        panel.classList.toggle('hidden', !show);
        panel.classList.toggle('is-tab-hidden', !show);
      });
      if (target === 'venues') loadVenueBookings();
    }
  
    /* Tab switching for room-stays / venues */
    document.querySelectorAll('[data-res-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        switchResTab(btn.dataset.resTab);
      });
    });
  
    await loadBookings();
  
    if (location.hash === '#venues') {
      switchResTab('venues');
    }
  
    async function applyBookingFromQuery() {
      const qp = parseBookQuery();
      if (location.hash === '#new-reservation') qp.book = true;
      if (!qp.book && !hasCompleteBookIntent(qp) && !qp.checkIn) return;
  
      if (hasCompleteBookIntent(qp)) {
        await openConfirmBooking({
          roomId: qp.roomId,
          checkIn: qp.checkIn,
          checkOut: qp.checkOut,
          guests: qp.guests || '1',
        });
      } else {
        openSearchBooking({
          checkIn: qp.checkIn,
          checkOut: qp.checkOut,
          guests: qp.guests,
        });
      }
  
      if (window.history.replaceState) {
        window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash || ''}`);
      }
    }
  
    await applyBookingFromQuery();
  
    createBookingPoll(async () => {
      const activeTab = document.querySelector('[data-res-tab].app-tab-active')?.dataset.resTab;
      await loadBookings({ background: true });
      if (activeTab === 'venues') await loadVenueBookings({ background: true });
    });
}
