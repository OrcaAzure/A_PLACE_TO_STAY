/**
 * Guest-facing booking policy constants — mirror server/src/constants/booking.js.
 */

export const STANDARD_CHECK_IN_LABEL = '2:00 PM';
export const STANDARD_CHECK_OUT_LABEL = '12:00 PM (noon)';
export const EARLY_CHECK_IN_NOTE =
  'Need to arrive before 2:00 PM? Mention your preferred arrival time in your request notes — early check-in is subject to availability.';

export const DEPOSIT_PERCENT = 25;

export const DEPOSIT_CONFIRMATION_HTML = `
  <strong>25% deposit required.</strong> Your stay is <em>not fully confirmed</em> until housing receives the deposit after approval.
  You will receive an invoice with payment instructions.`;

export const PENDING_CONFIRMATION_NOTE =
  'Status stays pending until the deposit is paid — housing will confirm your stay after payment is recorded.';

export const CHECK_IN_OUT_LINE = `Check-in ${STANDARD_CHECK_IN_LABEL} · Check-out ${STANDARD_CHECK_OUT_LABEL}.`;

/** Simple check-in / check-out policy note (replaces arrival-time fields). */
export function checkInOutPolicyNoteHtml({ className = 'res-hint', includeEarlyNote = false } = {}) {
  const extra = includeEarlyNote ? ` ${EARLY_CHECK_IN_NOTE}` : '';
  return `<p class="${className}" role="note">${CHECK_IN_OUT_LINE}${extra}</p>`;
}

/** Combined price + deposit notice for guest browse and booking surfaces. */
export function guestBookingPolicyNoticeHtml({ className = '' } = {}) {
  return `
    <div class="guest-price-notice flex flex-col gap-2 rounded-xl border border-amber-200/80 bg-amber-50 px-4 py-3 text-body-sm text-amber-950 ${className}" role="note">
      <p class="flex items-start gap-2 m-0">
        <span class="material-symbols-outlined text-[18px] text-amber-600 shrink-0 mt-0.5">info</span>
        <span>Prices shown are estimates. Final totals are confirmed by housing after review.</span>
      </p>
      <p class="flex items-start gap-2 m-0 pl-7">${DEPOSIT_CONFIRMATION_HTML}</p>
      <p class="flex items-start gap-2 m-0 pl-7 text-amber-900/90">
        <span class="material-symbols-outlined text-[16px] shrink-0">schedule</span>
        <span>Check-in ${STANDARD_CHECK_IN_LABEL} · Check-out ${STANDARD_CHECK_OUT_LABEL}. ${EARLY_CHECK_IN_NOTE}</span>
      </p>
    </div>`;
}
