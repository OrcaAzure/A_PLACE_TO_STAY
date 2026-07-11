/**
 * Live-refresh for booking and availability views.
 * Polls run silently in the background (no reveal/pulse animations) — see silent-refresh.js.
 */
export const BOOKING_POLL_ENABLED = true;

/** Poll interval when BOOKING_POLL_ENABLED is true (5–10 s is typical for booking sites). */
export const BOOKING_REFRESH_MS = 8000;
export const BOOKING_REFRESH_MIN_MS = 5000;
export const BOOKING_REFRESH_MAX_MS = 10_000;
