/**
 * Friendly start/end time pickers for venue booking (30-minute slots).
 */

const SLOT_MINUTES = 30;
const DAY_START = 6 * 60;
const DAY_END = 22 * 60;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function minutesToTime(m) {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${pad2(h)}:${pad2(min)}`;
}

function timeToMinutes(value) {
  const [h, min] = String(value || '').split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return h * 60 + min;
}

function formatLabel(m) {
  const h24 = Math.floor(m / 60);
  const min = m % 60;
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 || 12;
  return `${h12}:${pad2(min)} ${ampm}`;
}

export function buildTimeSlotOptions() {
  const slots = [];
  for (let m = DAY_START; m <= DAY_END; m += SLOT_MINUTES) {
    const value = minutesToTime(m);
    slots.push({ value, label: formatLabel(m) });
  }
  return slots;
}

function fillSelect(select, { value = '', placeholder = 'Select time' } = {}) {
  if (!select) return;
  const slots = buildTimeSlotOptions();
  select.innerHTML = `<option value="">${placeholder}</option>${slots
    .map((s) => `<option value="${s.value}"${s.value === value ? ' selected' : ''}>${s.label}</option>`)
    .join('')}`;
}

/** Replace native time inputs with selects and keep them in sync. */
export function initVenueTimeSelects({
  startId = 'vbm-start',
  endId = 'vbm-end',
  minDurationHours = 1,
  onChange,
} = {}) {
  const startEl = document.getElementById(startId);
  const endEl = document.getElementById(endId);
  if (!startEl || !endEl) return null;

  const swapTag = (el) => {
    if (el.tagName === 'SELECT') return el;
    const sel = document.createElement('select');
    sel.id = el.id;
    sel.name = el.name || el.id;
    sel.className = el.className;
    sel.required = el.required;
    el.replaceWith(sel);
    return sel;
  };

  const start = swapTag(startEl);
  const end = swapTag(endEl);
  const startVal = startEl.value || start.value || '';
  const endVal = endEl.value || end.value || '';

  fillSelect(start, { value: startVal.slice(0, 5) });
  fillSelect(end, { value: endVal.slice(0, 5), placeholder: 'End time' });

  const syncEndMin = () => {
    const sm = timeToMinutes(start.value);
    if (sm == null) return;
    const minEnd = sm + Math.max(1, Number(minDurationHours) || 1) * 60;
    const slots = buildTimeSlotOptions().filter((s) => timeToMinutes(s.value) >= minEnd);
    const current = end.value;
    end.innerHTML = `<option value="">End time</option>${slots
      .map((s) => `<option value="${s.value}">${s.label}</option>`)
      .join('')}`;
    if (current && timeToMinutes(current) >= minEnd) end.value = current;
    else if (slots.length) end.value = slots[0].value;
  };

  start.addEventListener('change', () => {
    syncEndMin();
    onChange?.({ start: start.value, end: end.value });
  });
  end.addEventListener('change', () => onChange?.({ start: start.value, end: end.value }));

  if (start.value) syncEndMin();

  return { start, end, getValues: () => ({ start: start.value, end: end.value }) };
}

export function validateVenueTimeRange(start, end, { minHours = 1 } = {}) {
  const sm = timeToMinutes(start);
  const em = timeToMinutes(end);
  if (sm == null || em == null) return 'Please select start and end times.';
  if (em <= sm) return 'End time must be after start time.';
  const hours = (em - sm) / 60;
  if (hours < minHours) return `This venue requires at least ${minHours} hour(s).`;
  return null;
}
