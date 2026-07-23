/**
 * Shared lodging booking policy constants (server-side).
 * Guest copy lives in client/public/assets/js/constants/booking-policy.js — keep in sync.
 */

/** Standard check-in time (24h). */
export const STANDARD_CHECK_IN_TIME = '14:00';

/** Standard check-out time (24h). */
export const STANDARD_CHECK_OUT_TIME = '12:00';

/** When true, guests may request arrival before standard check-in (stored on booking). */
export const EARLY_CHECK_IN_ALLOWED = true;

/** Deposit required to move from approved/pending to confirmed billing. */
export const DEPOSIT_PERCENT = 25;

/** Shown on invoices and guest UI while deposit is outstanding. */
export const DEPOSIT_CONFIRMATION_MESSAGE =
  'Your reservation is not fully confirmed until the required deposit is received. Housing will send an invoice after approval.';

export const PENDING_CONFIRMATION_LABEL = 'Pending deposit';
