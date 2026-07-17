/**
 * Guest housing & venue invoices — view amount due after booking is approved.
 */

import { getPayments } from '/assets/js/services/api.js';
import { escapeHtml } from '/assets/js/features/reservation-shared.js';

const fmt = (n) => `₱${parseFloat(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

function dueAmount(p) {
  const subtotal = Number(p.subtotal ?? p.booking_total ?? p.amount ?? 0);
  const discount = Number(p.discount_amount || 0);
  return Math.max(0, Math.round((subtotal - discount) * 100) / 100);
}

function paymentSummary(p) {
  if (p.summary) return p.summary;
  const totalDue = dueAmount(p);
  return {
    total_due: totalDue,
    amount_paid: p.status === 'Paid' ? totalDue : 0,
    balance_due: p.status === 'Paid' ? 0 : totalDue,
    credit_balance: 0,
  };
}

function isOpenInvoice(p) {
  return p.status === 'Pending' || p.status === 'Partially Paid';
}

function isVenueInvoice(p) {
  return p.invoice_kind === 'venue' || Boolean(p.facility_booking_id);
}

function formatDateRange(checkIn, checkOut) {
  if (!checkIn || !checkOut) return '—';
  const start = new Date(`${checkIn}T12:00:00`);
  const end = new Date(`${checkOut}T12:00:00`);
  return `${start.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function formatVenueWhen(p) {
  if (!p.event_date) return '—';
  const date = new Date(`${p.event_date}T12:00:00`).toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  const start = p.start_time ? String(p.start_time).slice(0, 5) : '';
  const end = p.end_time ? String(p.end_time).slice(0, 5) : '';
  return start && end ? `${date} · ${start}–${end}` : date;
}

function invoiceTitle(p) {
  if (isVenueInvoice(p)) {
    return [p.facility_category, p.facility_room_code || p.facility_name].filter(Boolean).join(' · ') || 'Venue booking';
  }
  return [p.building_name, p.room_number ? `Room ${p.room_number}` : ''].filter(Boolean).join(' · ');
}

function renderCard(p) {
  const isPaid = p.status === 'Paid';
  const isPartial = p.status === 'Partially Paid';
  const summary = paymentSummary(p);
  const discount = Number(p.discount_amount || 0);
  const isVenue = isVenueInvoice(p);
  const when = isVenue ? formatVenueWhen(p) : formatDateRange(p.check_in, p.check_out);
  const suggested = Number(p.suggested_deposit || 0);

  let badgeLabel = 'Payment due';
  let badgeClass = 'due';
  if (isPaid) {
    badgeLabel = 'Paid';
    badgeClass = 'paid';
  } else if (isPartial) {
    badgeLabel = 'Partially paid';
    badgeClass = 'partial';
  }

  return `
    <article class="guest-invoice-card ${isPaid ? 'guest-invoice-card--paid' : 'guest-invoice-card--due'}">
      <div class="guest-invoice-card__head">
        <div>
          <p class="guest-invoice-card__id">${isVenue ? 'Venue booking' : 'Room stay'}</p>
          <h4 class="guest-invoice-card__room">${escapeHtml(invoiceTitle(p))}</h4>
          <p class="guest-invoice-card__dates">${escapeHtml(when)}</p>
        </div>
        <span class="guest-invoice-card__badge guest-invoice-card__badge--${badgeClass}">
          ${badgeLabel}
        </span>
      </div>
      <div class="guest-invoice-card__amount-row">
        <div>
          <p class="guest-invoice-card__amount-label">${isPaid ? 'Total paid' : 'Balance due'}</p>
          <p class="guest-invoice-card__amount">${fmt(isPaid ? summary.amount_paid : summary.balance_due)}</p>
          ${!isPaid && summary.amount_paid > 0 ? `<p class="guest-invoice-card__discount">${fmt(summary.amount_paid)} paid so far · ${fmt(summary.total_due)} total</p>` : ''}
          ${discount > 0 && !isPaid ? `<p class="guest-invoice-card__discount">Includes ${fmt(discount)} discount${p.discount_note ? ` (${escapeHtml(p.discount_note)})` : ''}</p>` : ''}
          ${suggested > 0 && isOpenInvoice(p) ? `<p class="guest-invoice-card__discount">Suggested deposit: ${fmt(suggested)}</p>` : ''}
        </div>
      </div>
      ${isPaid
        ? `<p class="guest-invoice-card__hint">Thank you — payment recorded via ${escapeHtml(p.method || 'housing office')}.</p>`
        : `<p class="guest-invoice-card__hint">
            Please pay the <strong>APTS Housing Department</strong>${isVenue ? ' for your venue reservation' : ' before or during your stay'}.
            You may pay a deposit or the full amount in advance. Cash, GCash, and bank transfer are accepted.
          </p>`}
    </article>`;
}

export async function loadGuestInvoices() {
  const section = document.getElementById('guest-invoices-section');
  const list = document.getElementById('guest-invoices-list');
  const countEl = document.getElementById('guest-invoices-count');
  if (!section || !list) return;

  try {
    const payments = await getPayments();
    const open = payments.filter((p) => isOpenInvoice(p));

    if (!payments.length) {
      section.classList.add('hidden');
      return;
    }

    section.classList.remove('hidden');
    if (countEl) {
      countEl.textContent = open.length
        ? `${open.length} bill${open.length === 1 ? '' : 's'} need payment`
        : 'All bills paid';
    }

    list.innerHTML = payments.map(renderCard).join('');
  } catch {
    section.classList.add('hidden');
  }
}
