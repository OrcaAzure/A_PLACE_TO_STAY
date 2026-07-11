/**
 * Helpers for background (poll) refreshes — update values without replaying entry animations.
 */

/** @param {unknown} value */
export function jsonFingerprint(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(Date.now());
  }
}

/**
 * @param {HTMLElement | null | undefined} el
 * @param {number | string} target
 * @param {{ animate?: boolean }} [opts]
 */
export function updateStat(el, target, { animate = false } = {}) {
  if (!el) return;
  const next = String(target);
  if (el.textContent === next) return;

  if (!animate) {
    el.textContent = next;
    return;
  }

  const dur = 700;
  const start = performance.now();
  const from = Number.parseInt(el.textContent, 10) || 0;
  const to = Number(target);
  if (Number.isNaN(to)) {
    el.textContent = next;
    return;
  }

  function tick(t) {
    const p = Math.min(1, (t - start) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = String(Math.round(from + (to - from) * eased));
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
