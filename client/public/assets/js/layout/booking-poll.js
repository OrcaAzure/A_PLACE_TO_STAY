import { BOOKING_REFRESH_MS } from '/assets/js/config/booking-refresh.js';

/**
 * Poll booking/availability data on a safe interval. Pauses while the tab is hidden
 * and skips overlapping requests.
 *
 * @param {() => void | Promise<void>} refreshFn
 * @param {{ intervalMs?: number, shouldPoll?: () => boolean }} [options]
 * @returns {() => void} teardown
 */
export function createBookingPoll(refreshFn, { intervalMs = BOOKING_REFRESH_MS, shouldPoll } = {}) {
  let timer = null;
  let inFlight = false;

  const canPoll = () => !document.hidden && (!shouldPoll || shouldPoll());

  const tick = async () => {
    if (!canPoll() || inFlight) return;
    inFlight = true;
    try {
      await refreshFn();
    } catch {
      /* pages handle their own error UI on explicit loads */
    } finally {
      inFlight = false;
    }
  };

  const start = () => {
    if (timer) clearInterval(timer);
    if (!canPoll()) return;
    timer = setInterval(tick, intervalMs);
  };

  const stop = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  const onVisibility = () => {
    if (document.hidden) {
      stop();
      return;
    }
    tick();
    start();
  };

  document.addEventListener('visibilitychange', onVisibility);
  tick();
  start();

  return () => {
    stop();
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
