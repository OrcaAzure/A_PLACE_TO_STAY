/** Shared reservation UI helpers */

export const WIZARD_STEPS = [
  { id: 1, label: 'Guest Info', short: 'Who is staying?' },
  { id: 2, label: 'Dates & Guests', short: 'When and how many?' },
  { id: 3, label: 'Pick a Room', short: 'Choose a room' },
  { id: 4, label: 'Meals & Extras', short: 'Add meals or fees' },
  { id: 5, label: 'Confirm', short: 'Review and save' },
];

export const QUICK_FEES = [
  { name: 'Extra Mattress', amount: 500 },
  { name: 'Extra Bed', amount: 450 },
  { name: 'Extra Chair', amount: 150 },
  { name: 'Cleaning Fee', amount: 300 },
];

export function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function formatDisplayId(id) { return `#APT-${id}`; }

export function formatDate(d) {
  if (!d) return '—';
  const raw = String(d).slice(0, 10);
  return new Date(`${raw}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateLong(d) {
  if (!d) return '—';
  const raw = String(d).slice(0, 10);
  return new Date(`${raw}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function formatMoney(amount) {
  const val = Number(amount);
  if (Number.isNaN(val)) return '—';
  return val.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}

export function normStatus(s) { return String(s || 'pending').toLowerCase(); }

export function statusBadge(status) {
  const key = normStatus(status);
  const labels = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled' };
  return `<span class="res-pill res-pill--${key}">${escapeHtml(labels[key] || status)}</span>`;
}

export function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function getReservationCategory(booking) {
  const status = normStatus(booking.status);
  if (status === 'cancelled') return 'cancelled';
  if (status !== 'approved') return null;
  const today = new Date().toISOString().slice(0, 10);
  const inDate = String(booking.check_in || '').slice(0, 10);
  const outDate = String(booking.check_out || '').slice(0, 10);
  if (outDate <= today) return 'completed';
  if (inDate > today) return 'upcoming';
  if (inDate <= today && outDate > today) return 'active';
  return 'upcoming';
}

export function emptyWizardState() {
  return {
    step: 1, mode: 'create', bookingId: null, fromRequestId: null,
    guestName: '', contactPhone: '', email: '', userId: '',
    checkIn: '', checkOut: '', guestCount: 2, roomId: '', selectedRoom: null,
    meals: { Breakfast: 0, Lunch: 0, Dinner: 0 },
    fees: [], notes: '',
    availableRooms: [], availableCount: 0,
    mealRates: { Breakfast: 175, Lunch: 225, Dinner: 225 },
    roomTotal: 0, loadingRooms: false, saving: false, error: null,
  };
}

export function mealsFromBooking(mealsArr = []) {
  const out = { Breakfast: 0, Lunch: 0, Dinner: 0 };
  mealsArr.forEach((m) => { if (out[m.meal_type] != null) out[m.meal_type] = Number(m.quantity) || 0; });
  return out;
}

export function calcMealsSubtotal(meals, rates) {
  return Object.entries(meals || {}).reduce((s, [t, q]) => s + (Number(rates[t]) || 0) * (Number(q) || 0), 0);
}

export function calcFeesSubtotal(fees = []) {
  return (fees || []).reduce((s, f) => s + Number(f.amount || 0), 0);
}

export function calcGrandTotal(roomTotal, meals, fees, rates) {
  return Math.round((Number(roomTotal || 0) + calcMealsSubtotal(meals, rates) + calcFeesSubtotal(fees)) * 100) / 100;
}

export function availLabel(status) {
  const map = {
    available: { text: 'Available', cls: 'res-pill--approved' },
    booked: { text: 'Already Booked', cls: 'res-pill--rejected' },
    too_small: { text: 'Too Small', cls: 'res-pill--pending' },
    maintenance: { text: 'Maintenance', cls: 'res-pill--cancelled' },
  };
  return map[status] || map.booked;
}
