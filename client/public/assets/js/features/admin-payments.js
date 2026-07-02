/**
 * Admin billing — clickable list; invoice review opens in a popup modal.
 */

import { getPayments, getPaymentById, updatePayment, sendPaymentInvoice, recordPaymentTransaction } from '/assets/js/services/api.js';

const fmt = (n) => `₱${parseFloat(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
const PAYMENT_METHODS = ['Cash', 'GCash', 'Bank Transfer', 'Waived'];
const TX_TYPES = ['Deposit', 'Advance', 'Settlement', 'Refund'];

const state = {
  payments: [],
  activeFilter: 'pending',
  selectedId: null,
};

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDateShort(checkIn, checkOut) {
  if (!checkIn || !checkOut) return '—';
  const start = new Date(`${checkIn}T12:00:00`);
  const end = new Date(`${checkOut}T12:00:00`);
  return `${start.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function formatDateRange(checkIn, checkOut) {
  if (!checkIn || !checkOut) return '—';
  const start = new Date(`${checkIn}T12:00:00`);
  const end = new Date(`${checkOut}T12:00:00`);
  const sameYear = start.getFullYear() === end.getFullYear();
  const startOpts = { month: 'long', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) };
  const endOpts = { month: 'long', day: 'numeric', year: 'numeric' };
  return `${start.toLocaleDateString('en-PH', startOpts)} – ${end.toLocaleDateString('en-PH', endOpts)}`;
}

function formatSentAt(value) {
  if (!value) return 'Not emailed yet';
  return `Emailed ${new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
}

function billingInvoiceEmailed(p) {
  return Boolean(p?.billing_invoice_sent_at);
}

function billingEmailStatusLabel(p) {
  if (billingInvoiceEmailed(p)) {
    return formatSentAt(p.billing_invoice_sent_at);
  }
  if (p.invoice_sent_at) {
    return 'Not emailed from Billing yet';
  }
  return 'Not emailed from Billing yet';
}

function invoiceEmailButtonLabel(p) {
  const email = p.guest_email || 'guest';
  return billingInvoiceEmailed(p) ? `Resend invoice to ${email}` : `Email invoice to ${email}`;
}

function invoiceEmailHint(p) {
  if (billingInvoiceEmailed(p)) {
    return 'Use resend after changing the discount or if the guest did not receive it.';
  }
  if (p.invoice_sent_at) {
    return 'An invoice may have been sent automatically when the booking was approved. Use Email to send from Billing.';
  }
  return 'Send the invoice from Billing to the guest\u2019s booking email.';
}

function roomShort(p) {
  const room = p.room_number ? `Rm ${p.room_number}` : 'Room';
  const building = p.building_name || 'Building';
  return `${building} · ${room}`;
}

function roomLabel(p) {
  const building = p.building_name || 'Building';
  const room = p.room_number ? `Room ${p.room_number}` : 'Room';
  const type = p.room_type ? ` (${p.room_type})` : '';
  return `${building} · ${room}${type}`;
}

function isVenueInvoice(p) {
  if (!p) return false;
  if (p.invoice_kind === 'venue') return true;
  if (p.facility_booking_id != null && p.facility_booking_id !== '') return true;
  if ((p.facility_name || p.facility_category) && !p.room_number) return true;
  if (p.event_date && !p.check_in) return true;
  return false;
}

function formatTime12(t) {
  if (!t) return '';
  const [h, m] = String(t).slice(0, 5).split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

function venueLabel(p) {
  const category = String(p.facility_category || '').trim();
  const roomOrName = String(p.facility_room_code || p.facility_name || '').trim();
  if (category && roomOrName && category.toLowerCase() === roomOrName.toLowerCase()) {
    return category;
  }
  const parts = [category, roomOrName].filter(Boolean);
  return parts.join(' · ') || 'Venue';
}

function venueChargeDetail(p, text) {
  return text || venueLabel(p);
}

function venueShort(p) {
  if (p.facility_room_code) {
    return `${p.facility_category || 'Venue'} · ${p.facility_room_code}`;
  }
  return venueLabel(p);
}

function formatDateLongSingle(dateStr) {
  if (!dateStr) return '—';
  const raw = String(dateStr).slice(0, 10);
  return new Date(`${raw}T12:00:00`).toLocaleDateString('en-PH', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

function formatVenueWhen(p) {
  if (!p.event_date) return '—';
  const raw = String(p.event_date).slice(0, 10);
  const date = new Date(`${raw}T12:00:00`).toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  const start = formatTime12(p.start_time);
  const end = formatTime12(p.end_time);
  return start && end ? `${date} · ${start}–${end}` : date;
}

function bookingShort(p) {
  return isVenueInvoice(p) ? venueShort(p) : roomShort(p);
}

function bookingDatesShort(p) {
  return isVenueInvoice(p) ? formatVenueWhen(p) : formatDateShort(p.check_in, p.check_out);
}

function computeDue(subtotal, discount) {
  return Math.max(0, Math.round((Number(subtotal) - Number(discount || 0)) * 100) / 100);
}

function dueAmount(p) {
  const subtotal = Number(p.subtotal ?? p.booking_total ?? p.amount ?? 0);
  const discount = Number(p.discount_amount || 0);
  return computeDue(subtotal, discount);
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

function balanceDue(p) {
  return paymentSummary(p).balance_due;
}

function isOpenInvoice(p) {
  return p.status === 'Pending' || p.status === 'Partially Paid';
}

function defaultTxType(p) {
  const summary = paymentSummary(p);
  const suggested = Number(p.suggested_deposit || 0);
  const depositOutstanding = Number(p.deposit_outstanding ?? Math.max(0, suggested - (p.transactions || []).filter((t) => t.type === 'Deposit').reduce((s, t) => s + Number(t.amount), 0)));
  if (depositOutstanding > 0 && summary.balance_due > 0) return 'Deposit';
  if (summary.balance_due > 0) return 'Settlement';
  if (summary.credit_balance > 0) return 'Refund';
  return 'Advance';
}

function defaultTxAmount(p, type) {
  const summary = paymentSummary(p);
  if (type === 'Refund') return summary.credit_balance;
  if (type === 'Deposit') {
    const outstanding = Number(p.deposit_outstanding || 0);
    if (outstanding > 0) return Math.min(outstanding, summary.balance_due);
    if (Number(p.suggested_deposit || 0) > 0) {
      return Math.min(Number(p.suggested_deposit), summary.balance_due);
    }
  }
  if (type === 'Advance') return summary.balance_due || summary.total_due;
  return summary.balance_due;
}

function discountPercent(subtotal, discountAmount) {
  const base = Number(subtotal || 0);
  if (base <= 0) return 0;
  return Math.round((Number(discountAmount || 0) / base) * 10000) / 100;
}

function discountFromPercent(subtotal, percent) {
  const base = Number(subtotal || 0);
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  return Math.round(base * (p / 100) * 100) / 100;
}

function parsePackageHours(itemName) {
  if (!itemName) return null;
  const s = String(itemName);
  const explicit = s.match(/(\d+)\s*hr/i);
  if (explicit) return Number(explicit[1]);
  const word = s.match(/(\d+)\s*[- ]?\s*hour/i);
  if (/minimum|min\./i.test(s) && word) return Number(word[1]);
  return null;
}

function bookingDurationHours(startTime, endTime) {
  if (!startTime || !endTime) return 0;
  const start = String(startTime).slice(0, 5);
  const end = String(endTime).slice(0, 5);
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if (!Number.isFinite(sh) || !Number.isFinite(eh)) return 0;
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  return mins > 0 ? mins / 60 : 0;
}

function filteredPayments() {
  const open = state.payments.filter((p) => isOpenInvoice(p));
  const paid = state.payments.filter((p) => p.status === 'Paid');
  return state.activeFilter === 'paid' ? paid : open;
}

function selectedPayment() {
  return state.payments.find((p) => String(p.id) === String(state.selectedId)) || null;
}

function showFeedback(el, message, type = 'ok') {
  if (!el) return;
  el.textContent = message;
  const base = el.id === 'billing-detail-feedback' ? 'billing-detail-feedback' : 'invoice-feedback';
  el.className = `${base} invoice-feedback--${type}`;
  el.classList.remove('hidden');
}

function hideFeedback(el) {
  el?.classList.add('hidden');
}

function getPayMethodSelect(detailEl) {
  return detailEl?.querySelector('[data-pay-method]') || null;
}

function getBillingForm(detailEl) {
  return detailEl?.querySelector('[data-detail-form]') || null;
}

function getDiscountMode(form) {
  return form?.querySelector('[name="discount_mode"]:checked')?.value || 'percent';
}

function inferDiscountMode(subtotal, discountAmount) {
  if (!discountAmount) return 'percent';
  const roundTrip = discountFromPercent(subtotal, discountPercent(subtotal, discountAmount));
  return Math.abs(roundTrip - Number(discountAmount)) < 0.005 ? 'percent' : 'fixed';
}

function readBillingFormValues(form, subtotal = 0) {
  if (!form) return { discount_amount: 0, discount_note: '' };
  const mode = getDiscountMode(form);
  const discount_amount = mode === 'fixed'
    ? Math.max(0, Math.min(subtotal, Number(form.querySelector('[name="discount_amount"]')?.value || 0)))
    : discountFromPercent(subtotal, form.querySelector('[name="discount_percent"]')?.value);
  return {
    discount_amount,
    discount_note: String(form.querySelector('[name="discount_note"]')?.value || '').trim(),
  };
}

function getFormSubtotal(form) {
  if (!form) return 0;
  const attr = form.getAttribute('data-subtotal');
  if (attr != null && attr !== '') return Number(attr) || 0;
  const el = form.querySelector('[data-subtotal-input]');
  if (!el) return 0;
  return parseFloat(String(el.value || '').replace(/[^\d.]/g, '')) || 0;
}

function syncDiscountPanels(form, { seedOnModeChange = false } = {}) {
  if (!form) return;
  const mode = getDiscountMode(form);
  const subtotal = getFormSubtotal(form);
  const percentInput = form.querySelector('[name="discount_percent"]');
  const fixedInput = form.querySelector('[name="discount_amount"]');

  if (seedOnModeChange) {
    if (mode === 'fixed' && percentInput && fixedInput) {
      fixedInput.value = String(discountFromPercent(subtotal, percentInput.value));
    } else if (mode === 'percent' && percentInput && fixedInput) {
      percentInput.value = String(discountPercent(subtotal, Number(fixedInput.value || 0)));
    }
  }

  form.querySelectorAll('[data-discount-panel]').forEach((el) => {
    const show = el.getAttribute('data-discount-panel') === mode;
    el.hidden = !show;
    el.classList.toggle('hidden', !show);
    const input = el.querySelector('input');
    if (input) input.disabled = !show;
  });
}

function hasUnsavedBillingChanges(p, form) {
  if (!form) return false;
  const subtotal = Number(p.subtotal ?? p.booking_total ?? p.amount ?? 0);
  const { discount_amount, discount_note } = readBillingFormValues(form, subtotal);
  const savedDiscount = Number(p.discount_amount || 0);
  const savedNote = String(p.discount_note || '').trim();
  return discount_amount !== savedDiscount || discount_note !== savedNote;
}

function formatPaidAt(value) {
  if (!value) return null;
  return new Date(value).toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function recordSummaryHtml(p, balance, method, type = 'Settlement') {
  const guest = escapeHtml(p.guest_name || 'Guest');
  const isWaived = balance <= 0 && type !== 'Refund';
  const typeLabel = type.toLowerCase();
  if (type === 'Refund') {
    return `Refund <strong>${fmt(balance)}</strong> to <strong>${guest}</strong> via <strong>${method ? escapeHtml(method) : 'selected method'}</strong>.`;
  }
  if (isWaived) {
    return `Mark <strong>${guest}</strong> as complimentary / waived — no charge.`;
  }
  const methodText = method ? escapeHtml(method) : 'the selected method';
  return `Record <strong>${typeLabel}</strong> of <strong>${fmt(balance)}</strong> from <strong>${guest}</strong> via <strong data-approve-method>${methodText}</strong>.`;
}

function recordConfirmLabel(isWaived, type = 'Settlement') {
  if (type === 'Refund') {
    return 'I confirm this refund amount and payment method are correct.';
  }
  return isWaived
    ? 'I confirm this booking is complimentary / waived and should be marked as paid with no charge.'
    : `I confirm the guest has paid this ${type.toLowerCase()} and the payment method is correct.`;
}

function syncRecordPaymentUi(detailEl, p) {
  const fresh = p || selectedPayment();
  if (!detailEl || !fresh) return;

  const form = getBillingForm(detailEl);
  const subtotal = Number(fresh.subtotal ?? fresh.booking_total ?? fresh.amount ?? 0);
  const { discount_amount } = readBillingFormValues(form, subtotal);
  const totalDue = computeDue(subtotal, discount_amount);
  const txForm = detailEl.querySelector('[data-tx-form]');
  const txType = txForm?.querySelector('[name="tx_type"]')?.value || defaultTxType(fresh);
  const txAmountRaw = txForm?.querySelector('[name="tx_amount"]')?.value;
  const txAmount = txAmountRaw != null && txAmountRaw !== ''
    ? Number(txAmountRaw)
    : defaultTxAmount(fresh, txType);
  const isWaived = totalDue <= 0 && txType !== 'Refund';
  const method = getPayMethodSelect(detailEl)?.value || txForm?.querySelector('[name="tx_method"]')?.value || '';
  const displayAmount = txType === 'Refund'
    ? paymentSummary(fresh).credit_balance
    : (Number.isFinite(txAmount) && txAmount > 0 ? txAmount : defaultTxAmount(fresh, txType));

  const summaryEl = detailEl.querySelector('[data-record-summary]');
  if (summaryEl) summaryEl.innerHTML = recordSummaryHtml(fresh, displayAmount, method, txType);

  const checkLabel = detailEl.querySelector('[data-record-check] span');
  if (checkLabel) checkLabel.textContent = recordConfirmLabel(isWaived, txType);

  const methodField = detailEl.querySelector('[data-record-method-field]');
  if (methodField) methodField.classList.toggle('hidden', isWaived || txType === 'Refund');

  const recordBtn = detailEl.querySelector('[data-confirm-paid]');
  const checked = detailEl.querySelector('[data-approve-check]')?.checked;
  if (recordBtn) {
    const needsMethod = !isWaived || txType === 'Refund';
    recordBtn.disabled = (needsMethod && !method) || !checked || (!isWaived && displayAmount <= 0);
  }
}

function renderListRow(p) {
  const isOpen = isOpenInvoice(p);
  const balance = balanceDue(p);
  const summary = paymentSummary(p);
  const isSelected = String(p.id) === String(state.selectedId);
  const emailed = billingInvoiceEmailed(p)
    ? '<span class="billing-row__tag billing-row__tag--sent" title="Invoice emailed from Billing">✉ Sent</span>'
    : '<span class="billing-row__tag billing-row__tag--unsent" title="Not emailed from Billing yet">✉ Not sent</span>';

  let statusClass = 'pending';
  let statusLabel = 'Due';
  if (p.status === 'Partially Paid') {
    statusClass = 'partial';
    statusLabel = 'Partial';
  } else if (!isOpen) {
    statusClass = 'paid';
    statusLabel = 'Paid';
  }

  const amountLabel = isOpen
    ? (summary.amount_paid > 0 ? fmt(balance) : fmt(balance))
    : fmt(summary.amount_paid || p.amount);

  return `
    <button type="button"
      class="billing-row${isSelected ? ' is-selected' : ''}"
      data-invoice-row="${p.id}"
      role="option"
      aria-selected="${isSelected}">
      <span class="billing-row__main">
        <span class="billing-row__guest">${escapeHtml(p.guest_name || 'Guest')}</span>
        <span class="billing-row__meta">${escapeHtml(bookingShort(p))} · ${escapeHtml(bookingDatesShort(p))}${summary.amount_paid > 0 && isOpen ? ` · ${fmt(summary.amount_paid)} paid` : ''}</span>
      </span>
      <span class="billing-row__side">
        <span class="billing-row__amount">${amountLabel}</span>
        <span class="billing-row__badges">
          ${isVenueInvoice(p) ? '<span class="billing-row__tag billing-row__tag--venue">Venue</span>' : '<span class="billing-row__tag billing-row__tag--room">Room</span>'}
          <span class="billing-row__status billing-row__status--${statusClass}">${statusLabel}</span>
          ${isOpen ? emailed : ''}
        </span>
        <span class="billing-row__id">#${p.id}</span>
      </span>
      <span class="material-symbols-outlined billing-row__chevron" aria-hidden="true">chevron_right</span>
    </button>`;
}

function stayNights(p) {
  return p.nights || 1;
}

function venueChargeLines(p) {
  const bookingTotal = Number(p.booking_total || p.subtotal || 0);
  const rate = Number(p.facility_rate || 0);
  const hours = bookingDurationHours(p.start_time, p.end_time);
  const packageLabel = p.facility_package || '';
  const packageHours = parsePackageHours(packageLabel);
  const lines = [];

  if (rate > 0 && hours > 0) {
    if (packageHours) {
      if (hours <= packageHours) {
        lines.push({
          icon: 'meeting_room',
          label: `${packageHours}-hour package`,
          detail: venueChargeDetail(p, packageLabel),
          amount: rate,
        });
      } else {
        const perHour = rate / packageHours;
        const extraHours = Math.round((hours - packageHours) * 100) / 100;
        const extraAmount = Math.round(perHour * extraHours * 100) / 100;
        lines.push({
          icon: 'meeting_room',
          label: `${packageHours}-hour package`,
          detail: venueChargeDetail(p, packageLabel),
          amount: rate,
        });
        lines.push({
          icon: 'schedule',
          label: 'Additional hours',
          detail: `${extraHours} hr × ${fmt(perHour)}/hr beyond package`,
          amount: extraAmount,
        });
      }
    } else {
      const billedHours = Math.max(hours, 1);
      const amount = Math.round(rate * billedHours * 100) / 100;
      lines.push({
        icon: 'schedule',
        label: 'Venue rental',
        detail: venueChargeDetail(p, `${fmt(rate)}/hr × ${billedHours} hr`),
        amount,
      });
    }
  }

  if (!lines.length && bookingTotal > 0) {
    lines.push({
      icon: 'meeting_room',
      label: p.facility_name || 'Venue rental',
      detail: venueChargeDetail(p, [formatTime12(p.start_time), formatTime12(p.end_time)].filter(Boolean).join(' – ') || `${p.guest_count || 1} guest${Number(p.guest_count) === 1 ? '' : 's'}`),
      amount: bookingTotal,
    });
  }

  return { lines, bookingTotal };
}

function chargeLines(p) {
  const bookingTotal = Number(p.booking_total || p.subtotal || 0);

  if (isVenueInvoice(p)) {
    return venueChargeLines(p);
  }

  const meals = (p.meals || []).filter((m) => Number(m.quantity) > 0);
  const fees = p.fees || [];
  const mealTotal = meals.reduce((s, m) => s + Number(m.subtotal || 0), 0);
  const feeTotal = fees.reduce((s, f) => s + Number(f.amount || 0), 0);
  const roomTotal = Math.max(0, Math.round((bookingTotal - mealTotal - feeTotal) * 100) / 100);
  const nights = stayNights(p);
  const lines = [];

  if (roomTotal > 0) {
    lines.push({
      icon: 'king_bed',
      label: 'Room lodging',
      detail: `${roomLabel(p)} · ${nights} night${nights === 1 ? '' : 's'}${p.occupancy_item ? ` · ${p.occupancy_item}` : ''}`,
      amount: roomTotal,
    });
  }
  meals.forEach((m) => {
    lines.push({
      icon: 'restaurant',
      label: m.meal_type,
      detail: `${m.quantity} serving${Number(m.quantity) === 1 ? '' : 's'} @ ${fmt(m.unit_price)}`,
      amount: Number(m.subtotal || 0),
    });
  });
  fees.forEach((f) => {
    lines.push({
      icon: 'room_service',
      label: f.fee_name || f.service_name || 'Extra service',
      detail: 'Add-on',
      amount: Number(f.amount || 0),
    });
  });
  if (!lines.length && bookingTotal > 0) {
    lines.push({
      icon: 'receipt',
      label: 'Reservation total',
      detail: roomLabel(p),
      amount: bookingTotal,
    });
  }
  return { lines, bookingTotal };
}

function renderChargeTable(p) {
  const { lines, bookingTotal } = chargeLines(p);
  if (!lines.length) {
    return '<p class="billing-charges-empty">No line-item breakdown on file.</p>';
  }
  const subtotal = Number(p.subtotal ?? bookingTotal ?? 0);
  const discount = Number(p.discount_amount || 0);
  const percent = discountPercent(subtotal, discount);
  const due = computeDue(subtotal, discount);
  const rows = lines.map((line) => `
    <tr>
      <td>
        <span class="billing-charge-label">
          <span class="material-symbols-outlined billing-charge-icon" aria-hidden="true">${line.icon}</span>
          <span>
            <strong>${escapeHtml(line.label)}</strong>
            <small>${escapeHtml(line.detail)}</small>
          </span>
        </span>
      </td>
      <td class="billing-charge-amount">${fmt(line.amount)}</td>
    </tr>`).join('');

  return `
    <table class="billing-charges-table">
      <thead>
        <tr><th>Item</th><th>Amount</th></tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr>
          <td>Booking subtotal</td>
          <td class="billing-charge-amount">${fmt(bookingTotal)}</td>
        </tr>
        ${discount > 0 ? `
        <tr class="billing-charges-discount">
          <td>Discount${percent > 0 ? ` (${percent}%)` : ''}${p.discount_note ? ` — ${escapeHtml(p.discount_note)}` : ''}</td>
          <td class="billing-charge-amount">−${fmt(discount)}</td>
        </tr>` : ''}
        <tr class="billing-charges-due">
          <td>Amount due</td>
          <td class="billing-charge-amount">${fmt(due)}</td>
        </tr>
      </tfoot>
    </table>`;
}

function renderInfoChip(icon, label, value) {
  if (!value) return '';
  return `
    <div class="billing-info-chip">
      <span class="material-symbols-outlined" aria-hidden="true">${icon}</span>
      <div>
        <span class="billing-info-chip__label">${escapeHtml(label)}</span>
        <span class="billing-info-chip__value">${escapeHtml(value)}</span>
      </div>
    </div>`;
}

function renderVenueDetailItem(label, value, { wide = false } = {}) {
  if (!value) return '';
  return `
    <div class="billing-venue-details__item${wide ? ' billing-venue-details__item--wide' : ''}">
      <span class="billing-venue-details__label">${escapeHtml(label)}</span>
      <span class="billing-venue-details__value">${escapeHtml(value)}</span>
    </div>`;
}

function renderVenueDetailsCard(p) {
  const timeLabel = `${formatTime12(p.start_time)} – ${formatTime12(p.end_time)}`;
  return `
    <div class="billing-venue-details">
      <div class="billing-venue-details__grid billing-venue-details__grid--unified">
        ${renderVenueDetailItem('Event date', formatDateLongSingle(p.event_date))}
        ${renderVenueDetailItem('Time', timeLabel)}
        ${renderVenueDetailItem('Guests', `${p.guest_count || 1} expected`)}
        ${renderVenueDetailItem('Venue', venueLabel(p))}
        ${renderVenueDetailItem('Season', p.season)}
        ${renderVenueDetailItem('Package', p.facility_package)}
        ${renderVenueDetailItem('Email', p.guest_email, { wide: true })}
        ${renderVenueDetailItem('Booking notes', p.notes, { wide: true })}
      </div>
      <div class="billing-venue-details__footer">
        <span class="billing-venue-details__ref">Booking ref #${escapeHtml(String(p.facility_booking_id))}</span>
        <span class="billing-venue-details__type">Venue / facility</span>
      </div>
    </div>`;
}

function renderReservationSection(p) {
  if (isVenueInvoice(p)) {
    return `
    <section class="billing-reservation-card">
      <h4 class="billing-section-title">
        <span class="material-symbols-outlined" aria-hidden="true">meeting_room</span>
        Venue booking details
      </h4>
      ${renderVenueDetailsCard(p)}
      <h4 class="billing-section-title billing-section-title--sub">
        <span class="material-symbols-outlined" aria-hidden="true">request_quote</span>
        Charge breakdown
      </h4>
      ${renderChargeTable(p)}
    </section>`;
  }

  const nights = stayNights(p);
  const chips = [
    renderInfoChip('calendar_month', 'Stay', formatDateRange(p.check_in, p.check_out)),
    renderInfoChip('nights_stay', 'Nights', `${nights} night${nights === 1 ? '' : 's'}`),
    renderInfoChip('group', 'Guests', `${p.guest_count || 1} in room`),
    renderInfoChip('location_on', 'Room', roomLabel(p)),
    p.season ? renderInfoChip('wb_sunny', 'Season', p.season) : '',
    p.group_name ? renderInfoChip('groups', 'Group', p.group_name) : '',
    p.contact_phone ? renderInfoChip('call', 'Phone', p.contact_phone) : '',
  ].filter(Boolean).join('');

  const mealsSummary = (p.meals || [])
    .filter((m) => Number(m.quantity) > 0)
    .map((m) => `${m.meal_type} × ${m.quantity}`)
    .join(', ');

  const extras = [
    p.guest_email ? `<div class="billing-meta-row"><span>Email</span><span>${escapeHtml(p.guest_email)}</span></div>` : '',
    mealsSummary ? `<div class="billing-meta-row"><span>Meals ordered</span><span>${escapeHtml(mealsSummary)}</span></div>` : '',
    p.meal_allergen_notes ? `<div class="billing-meta-row billing-meta-row--alert"><span>Allergen notes</span><span>${escapeHtml(p.meal_allergen_notes)}</span></div>` : '',
    p.notes ? `<div class="billing-meta-row"><span>Booking notes</span><span>${escapeHtml(p.notes)}</span></div>` : '',
    `<div class="billing-meta-row"><span>Booking ref</span><span>#${p.booking_id}</span></div>`,
  ].filter(Boolean).join('');

  return `
    <section class="billing-reservation-card">
      <h4 class="billing-section-title">
        <span class="material-symbols-outlined" aria-hidden="true">event_available</span>
        Reservation details
      </h4>
      <div class="billing-info-chips">${chips}</div>
      ${extras ? `<div class="billing-meta-list">${extras}</div>` : ''}
      <h4 class="billing-section-title billing-section-title--sub">
        <span class="material-symbols-outlined" aria-hidden="true">request_quote</span>
        Charge breakdown
      </h4>
      ${renderChargeTable(p)}
    </section>`;
}

function formatTxAt(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function renderPaymentSummaryCard(p) {
  const summary = paymentSummary(p);
  const suggested = Number(p.suggested_deposit || 0);
  const depositOutstanding = Number(p.deposit_outstanding || 0);

  return `
    <section class="billing-panel billing-panel--summary">
      <h4 class="billing-section-title">
        <span class="material-symbols-outlined" aria-hidden="true">account_balance_wallet</span>
        Payment balance
      </h4>
      <dl class="billing-balance-grid">
        <div><dt>Total due</dt><dd>${fmt(summary.total_due)}</dd></div>
        <div><dt>Paid so far</dt><dd>${fmt(summary.amount_paid)}</dd></div>
        <div class="billing-balance-grid__due"><dt>Balance due</dt><dd>${fmt(summary.balance_due)}</dd></div>
        ${summary.credit_balance > 0 ? `<div><dt>Credit</dt><dd>${fmt(summary.credit_balance)}</dd></div>` : ''}
      </dl>
      ${suggested > 0 ? `<p class="billing-deposit-hint">Suggested deposit: <strong>${fmt(suggested)}</strong>${depositOutstanding > 0 ? ` · <strong>${fmt(depositOutstanding)}</strong> still outstanding` : ''}</p>` : ''}
    </section>`;
}

function renderLedger(p) {
  const transactions = p.transactions || [];
  if (!transactions.length) {
    return '<p class="billing-ledger-empty">No payments recorded yet.</p>';
  }
  const rows = transactions.map((t) => `
    <tr>
      <td>${escapeHtml(formatTxAt(t.recorded_at))}</td>
      <td><span class="billing-ledger-type billing-ledger-type--${t.type.toLowerCase()}">${escapeHtml(t.type)}</span></td>
      <td class="billing-charge-amount">${t.type === 'Refund' ? '−' : ''}${fmt(t.amount)}</td>
      <td>${escapeHtml(t.method || '—')}</td>
    </tr>`).join('');

  return `
    <table class="billing-ledger-table">
      <thead>
        <tr><th>Date</th><th>Type</th><th>Amount</th><th>Method</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderBillingColumn(p, { isPending }) {
  const subtotal = Number(p.subtotal ?? p.booking_total ?? p.amount ?? 0);
  const discount = Number(p.discount_amount || 0);
  const percent = discountPercent(subtotal, discount);
  const discountMode = inferDiscountMode(subtotal, discount);
  const due = dueAmount(p);
  const isWaived = due <= 0;
  const methodOptions = PAYMENT_METHODS.map((m) => `<option value="${m}">${m}</option>`).join('');
  const summary = paymentSummary(p);
  const defaultType = defaultTxType(p);
  const defaultAmount = defaultTxAmount(p, defaultType);
  const txTypeOptions = TX_TYPES.map((t) => `<option value="${t}"${t === defaultType ? ' selected' : ''}>${t}</option>`).join('');

  if (!isPending) {
    const paidWhen = formatPaidAt(p.paid_at);
    return `
      ${renderPaymentSummaryCard(p)}
      <section class="billing-panel billing-panel--ledger">
        <h4 class="billing-section-title">
          <span class="material-symbols-outlined" aria-hidden="true">receipt_long</span>
          Payment history
        </h4>
        ${renderLedger(p)}
      </section>
      <section class="billing-panel billing-panel--recorded">
        <h4 class="billing-section-title">
          <span class="material-symbols-outlined" aria-hidden="true">check_circle</span>
          Payment recorded
        </h4>
        <div class="billing-recorded-card">
          <div class="billing-recorded-card__amount">
            <span>Amount received</span>
            <strong>${fmt(summary.amount_paid)}</strong>
          </div>
          <dl class="billing-recorded-card__meta">
            <div><dt>Method</dt><dd>${escapeHtml(p.method || '—')}</dd></div>
            ${paidWhen ? `<div><dt>Completed</dt><dd>${escapeHtml(paidWhen)}</dd></div>` : ''}
          </dl>
        </div>
      </section>`;
  }

  return `
    <div class="billing-billing-stack">
    ${renderPaymentSummaryCard(p)}
    <section class="billing-panel billing-panel--edit">
      <h4 class="billing-section-title">
        <span class="material-symbols-outlined" aria-hidden="true">edit_note</span>
        Adjust invoice
      </h4>

      <form class="billing-edit-form" data-detail-form="${p.id}" data-subtotal="${subtotal}">
        <div class="billing-discount-block">
          <span class="billing-discount-block__label">Discount</span>
          <div class="billing-discount-mode" role="radiogroup" aria-label="Discount type">
            <label class="billing-discount-mode__option">
              <input type="radio" name="discount_mode" value="percent"${discountMode === 'percent' ? ' checked' : ''} />
              <span>Percent (%)</span>
            </label>
            <label class="billing-discount-mode__option">
              <input type="radio" name="discount_mode" value="fixed"${discountMode === 'fixed' ? ' checked' : ''} />
              <span>Fixed amount</span>
            </label>
          </div>
          <div class="billing-discount-panels">
            <label class="billing-discount-panel${discountMode === 'percent' ? '' : ' hidden'}" data-discount-panel="percent"${discountMode === 'percent' ? '' : ' hidden'}>
              <span class="billing-discount-panel__label">Rate</span>
              <span class="billing-discount-field">
                <input type="number" min="0" max="100" step="0.01"
                  class="billing-edit-form__input billing-discount-field__input"
                  name="discount_percent" value="${percent}" data-live-due${discountMode === 'percent' ? '' : ' disabled'} />
                <span class="billing-discount-field__suffix" aria-hidden="true">%</span>
              </span>
            </label>
            <label class="billing-discount-panel${discountMode === 'fixed' ? '' : ' hidden'}" data-discount-panel="fixed"${discountMode === 'fixed' ? '' : ' hidden'}>
              <span class="billing-discount-panel__label">Amount off (₱)</span>
              <input type="number" min="0" max="${subtotal}" step="0.01"
                class="billing-edit-form__input billing-discount-field__input"
                name="discount_amount" value="${discount}" data-live-due${discountMode === 'fixed' ? '' : ' disabled'} />
            </label>
          </div>
          <p class="billing-discount-hint" data-discount-peso>−${fmt(discount)} off subtotal</p>
        </div>
        <label class="billing-edit-form__field">
          <span>Discount reason</span>
          <input type="text" class="billing-edit-form__input" name="discount_note" maxlength="255"
            placeholder="e.g. Staff rate, ministry partner" value="${escapeHtml(p.discount_note || '')}" />
        </label>

        <div class="billing-edit-footer">
          <div class="billing-detail-total billing-detail-total--inline${isWaived ? ' billing-detail-total--waived' : ''}" data-due-display>
            <span>${isWaived ? 'Complimentary' : 'Amount due'}</span>
            <strong>${fmt(due)}</strong>
          </div>
          <div class="billing-edit-footer__actions">
            <button type="submit" class="invoice-btn-secondary billing-edit-footer__save">Save changes</button>
          </div>
        </div>
      </form>
    </section>
    <section class="billing-panel billing-panel--record" aria-label="Record payment">
      <h4 class="billing-section-title">
        <span class="material-symbols-outlined" aria-hidden="true">payments</span>
        Record payment
      </h4>
      <form class="billing-tx-form" data-tx-form="${p.id}">
        <label class="billing-edit-form__field">
          <span>Payment type</span>
          <select class="billing-edit-form__input" name="tx_type">
            ${txTypeOptions}
          </select>
        </label>
        <label class="billing-edit-form__field">
          <span>Amount (₱)</span>
          <input type="number" class="billing-edit-form__input" name="tx_amount" min="0.01" step="0.01"
            value="${defaultAmount}" data-live-record />
        </label>
        <label class="billing-edit-form__field billing-record-method" data-record-method-field>
          <span>Payment method</span>
          <select class="billing-edit-form__input" name="tx_method" data-pay-method="${p.id}">
            <option value="">Select how guest paid…</option>
            ${methodOptions}
          </select>
        </label>
        <label class="billing-edit-form__field">
          <span>Notes (optional)</span>
          <input type="text" class="billing-edit-form__input" name="tx_notes" maxlength="255"
            placeholder="e.g. Deposit upon booking" />
        </label>
      </form>
      <p class="billing-record-summary" data-record-summary>${recordSummaryHtml(p, defaultAmount, '', defaultType)}</p>

      <label class="billing-record-check" data-record-check>
        <input type="checkbox" data-approve-check />
        <span>${recordConfirmLabel(due <= 0, defaultType)}</span>
      </label>

      <button type="button" class="invoice-btn-confirm billing-panel__btn" data-confirm-paid="${p.id}" disabled>
        <span class="material-symbols-outlined" aria-hidden="true">task_alt</span>
        Record payment
      </button>
      <p class="billing-record-note">Deposits and advances reduce the balance due. Settlement pays the remaining balance.</p>
    </section>
    <section class="billing-panel billing-panel--ledger">
      <h4 class="billing-section-title">
        <span class="material-symbols-outlined" aria-hidden="true">receipt_long</span>
        Payment history
      </h4>
      ${renderLedger(p)}
    </section>

    <section class="billing-panel billing-panel--email">
      <h4 class="billing-section-title">
        <span class="material-symbols-outlined" aria-hidden="true">mail</span>
        Invoice email
      </h4>
      <div class="billing-email-status${billingInvoiceEmailed(p) ? ' billing-email-status--sent' : ''}">
        <span class="material-symbols-outlined" aria-hidden="true">outgoing_mail</span>
        <span>${escapeHtml(billingEmailStatusLabel(p))}</span>
      </div>
      <button type="button" class="invoice-btn-secondary billing-panel__btn" data-send-invoice="${p.id}">
        <span class="material-symbols-outlined" aria-hidden="true">send</span>
        ${escapeHtml(invoiceEmailButtonLabel(p))}
      </button>
      <p class="billing-email-recipient-hint">${escapeHtml(invoiceEmailHint(p))}</p>
    </section>
    </div>`;
}

function renderDetailPanel(p) {
  const isOpen = isOpenInvoice(p);
  const statusLabel = isOpen
    ? (p.status === 'Partially Paid' ? 'Partially paid' : 'Awaiting payment')
    : 'Paid';

  return `
    <div class="billing-detail">
      <button type="button" class="billing-detail__close billing-detail__close--float" data-close-detail aria-label="Close invoice review">
        <span class="material-symbols-outlined" aria-hidden="true">close</span>
      </button>
      <p id="billing-modal-title" class="sr-only">${escapeHtml(p.guest_name || 'Guest')} — Invoice #${p.id} · ${statusLabel}</p>
      <div class="billing-detail__body nice-scroll">
        <div class="billing-detail__columns">
          <div class="billing-detail__col">
            ${renderReservationSection(p)}
          </div>
          <div class="billing-detail__col billing-detail__col--billing">
            ${renderBillingColumn(p, { isPending: isOpen })}
          </div>
        </div>
      </div>
      <div id="billing-detail-feedback" class="billing-detail-feedback hidden" role="status"></div>
    </div>`;
}

function updateLiveDue(form) {
  const dueEl = form.closest('.billing-detail')?.querySelector('[data-due-display]');
  const dueStrong = dueEl?.querySelector('strong');
  const dueLabel = dueEl?.querySelector('span');
  const pesoHint = form.querySelector('[data-discount-peso]');
  if (!dueStrong) return;

  const subtotal = getFormSubtotal(form);
  const mode = getDiscountMode(form);
  const { discount_amount } = readBillingFormValues(form, subtotal);
  const due = computeDue(subtotal, discount_amount);
  const isWaived = due <= 0;

  dueStrong.textContent = fmt(due);
  if (dueLabel) {
    dueLabel.textContent = isWaived ? 'Complimentary' : 'Amount due';
  }
  dueEl?.classList.toggle('billing-detail-total--waived', isWaived);

  if (pesoHint) pesoHint.textContent = `−${fmt(discount_amount)} off subtotal`;

  const detailEl = form.closest('.billing-detail');
  if (detailEl) syncRecordPaymentUi(detailEl, selectedPayment());

  const percentInput = form.querySelector('[name="discount_percent"]');
  const fixedInput = form.querySelector('[name="discount_amount"]');
  if (mode === 'percent' && fixedInput) {
    fixedInput.value = String(discount_amount);
  } else if (mode === 'fixed' && percentInput) {
    percentInput.value = String(discountPercent(subtotal, discount_amount));
  }
}

function renderList() {
  const listEl = document.getElementById('invoice-list');
  if (!listEl) return;

  const list = filteredPayments();

  if (!list.length) {
    const emptyTitle = state.activeFilter === 'paid' ? 'No paid invoices' : 'No open invoices';
    const emptyText = state.activeFilter === 'paid'
      ? 'Approved payments will appear here.'
      : 'Approved stays generate bills here for your review.';
    listEl.innerHTML = `
      <div class="invoice-empty">
        <span class="material-symbols-outlined invoice-empty__icon" aria-hidden="true">receipt_long</span>
        <p class="invoice-empty__title">${emptyTitle}</p>
        <p class="invoice-empty__text">${emptyText}</p>
      </div>`;
    return;
  }

  listEl.innerHTML = `<div class="billing-table">${list.map(renderListRow).join('')}</div>`;

  listEl.querySelectorAll('[data-invoice-row]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      hideFeedback(document.getElementById('payments-feedback'));
      await openInvoiceModal(btn.getAttribute('data-invoice-row'));
    });
  });
}

function getModal() {
  return document.getElementById('billing-invoice-modal');
}

async function openInvoiceModal(id) {
  state.selectedId = id;
  renderList();

  const modal = getModal();
  const detailEl = document.getElementById('invoice-detail');
  if (!modal || !detailEl) return;

  modal.classList.remove('is-hidden');
  modal.hidden = false;
  detailEl.innerHTML = '<p class="billing-detail-loading">Loading invoice…</p>';

  try {
    const p = await getPaymentById(id);
    const idx = state.payments.findIndex((x) => String(x.id) === String(id));
    if (idx >= 0) state.payments[idx] = p;
    else state.payments.push(p);
    renderList();

    detailEl.innerHTML = renderDetailPanel(p);
    bindDetailActions(p);
  } catch (err) {
    detailEl.innerHTML = `<p class="billing-detail-error">${escapeHtml(err.message || 'Could not load invoice.')}</p>`;
  }
}

function closeInvoiceModal() {
  state.selectedId = null;
  renderList();
  const modal = getModal();
  if (!modal) return;
  modal.classList.add('is-hidden');
  modal.hidden = true;
}

function bindDetailActions(p) {
  const detailEl = document.getElementById('invoice-detail');
  const detailFeedback = document.getElementById('billing-detail-feedback');
  const pageFeedback = document.getElementById('payments-feedback');

  detailEl?.querySelector('[data-close-detail]')?.addEventListener('click', closeInvoiceModal);

  const form = detailEl?.querySelector('[data-detail-form]');
  form?.querySelectorAll('[data-live-due]').forEach((input) => {
    input.addEventListener('input', () => updateLiveDue(form));
  });
  form?.querySelectorAll('[name="discount_mode"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      syncDiscountPanels(form, { seedOnModeChange: true });
      updateLiveDue(form);
    });
  });
  syncDiscountPanels(form);

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    const subtotal = Number(p.subtotal ?? p.booking_total ?? p.amount ?? 0);
    const { discount_amount, discount_note } = readBillingFormValues(form, subtotal);
    try {
      await updatePayment(p.id, {
        discount_amount,
        discount_note,
      });
      await reload({ keepSelection: true, keepModalOpen: true });
      showFeedback(detailFeedback, 'Billing updated.', 'ok');
    } catch (err) {
      showFeedback(detailFeedback, err.message || 'Could not save.', 'error');
    } finally {
      btn.disabled = false;
    }
  });

  detailEl?.querySelector('[data-send-invoice]')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const fresh = selectedPayment() || p;
    const verb = billingInvoiceEmailed(fresh) ? 'Resend' : 'Email';
    if (!window.confirm(`${verb} invoice #${fresh.id} to ${fresh.guest_email}?`)) return;
    btn.disabled = true;
    const label = btn.innerHTML;
    btn.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">hourglass_top</span> Sending…';
    try {
      const result = await sendPaymentInvoice(fresh.id);
      await reload({ keepSelection: true, keepModalOpen: true });
      showFeedback(pageFeedback, result.message || 'Invoice emailed.', 'ok');
    } catch (err) {
      showFeedback(detailFeedback, err.message || 'Could not send email.', 'error');
      btn.disabled = false;
      btn.innerHTML = label;
    }
  });

  const txForm = detailEl?.querySelector('[data-tx-form]');
  txForm?.querySelector('[name="tx_type"]')?.addEventListener('change', () => {
    const fresh = selectedPayment() || p;
    const type = txForm.querySelector('[name="tx_type"]')?.value;
    const amountInput = txForm.querySelector('[name="tx_amount"]');
    if (amountInput && type) amountInput.value = String(defaultTxAmount(fresh, type));
    syncRecordPaymentUi(detailEl, fresh);
  });
  txForm?.querySelectorAll('[data-live-record], [name="tx_method"]').forEach((input) => {
    input.addEventListener('input', () => syncRecordPaymentUi(detailEl, selectedPayment() || p));
    input.addEventListener('change', () => syncRecordPaymentUi(detailEl, selectedPayment() || p));
  });

  const methodSelect = getPayMethodSelect(detailEl);
  methodSelect?.addEventListener('change', () => {
    hideFeedback(detailFeedback);
    syncRecordPaymentUi(detailEl, selectedPayment() || p);
  });
  syncRecordPaymentUi(detailEl, p);

  detailEl?.querySelector('[data-approve-check]')?.addEventListener('change', () => {
    syncRecordPaymentUi(detailEl, selectedPayment() || p);
  });

  detailEl?.querySelector('[data-confirm-paid]')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const check = detailEl.querySelector('[data-approve-check]');
    const fresh = selectedPayment() || p;
    const billingForm = getBillingForm(detailEl);
    const subtotal = Number(fresh.subtotal ?? fresh.booking_total ?? fresh.amount ?? 0);
    const { discount_amount } = readBillingFormValues(billingForm, subtotal);
    const totalDue = computeDue(subtotal, discount_amount);
    const isWaived = totalDue <= 0;
    const type = txForm?.querySelector('[name="tx_type"]')?.value || 'Settlement';
    const amount = Number(txForm?.querySelector('[name="tx_amount"]')?.value || 0);
    const method = isWaived ? 'Waived' : (txForm?.querySelector('[name="tx_method"]')?.value || getPayMethodSelect(detailEl)?.value);
    const notes = String(txForm?.querySelector('[name="tx_notes"]')?.value || '').trim();

    if (!isWaived && !method) {
      showFeedback(detailFeedback, 'Select payment method before recording.', 'error');
      txForm?.querySelector('[name="tx_method"]')?.focus();
      return;
    }
    if (hasUnsavedBillingChanges(fresh, billingForm)) {
      showFeedback(detailFeedback, 'Save discount changes before recording payment.', 'error');
      billingForm?.querySelector('button[type="submit"]')?.focus();
      return;
    }
    if (!check?.checked) {
      showFeedback(detailFeedback, 'Check the confirmation box to record payment.', 'error');
      check?.focus();
      return;
    }

    hideFeedback(detailFeedback);
    btn.disabled = true;
    const label = btn.innerHTML;
    btn.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">hourglass_top</span> Recording…';
    try {
      let result;
      if (isWaived) {
        result = await updatePayment(fresh.id, { status: 'Paid', method: 'Waived' });
      } else {
        result = await recordPaymentTransaction(fresh.id, {
          type,
          amount,
          method,
          notes: notes || undefined,
        });
      }
      const updated = result.payment || fresh;
      const stillOpen = isOpenInvoice(updated);
      await reload({ keepSelection: true, keepModalOpen: stillOpen });
      if (!stillOpen) closeInvoiceModal();
      showFeedback(pageFeedback, result.message || `${type} recorded for ${fresh.guest_name}.`, 'ok');
    } catch (err) {
      showFeedback(detailFeedback, err.message || 'Could not record payment.', 'error');
      syncRecordPaymentUi(detailEl, fresh);
      btn.disabled = false;
      btn.innerHTML = label;
    }
  });
}

function updateSummary() {
  const open = state.payments.filter((x) => isOpenInvoice(x));
  const paid = state.payments.filter((x) => x.status === 'Paid');
  const due = open.reduce((s, x) => s + balanceDue(x), 0);
  const collected = state.payments.reduce((s, x) => s + paymentSummary(x).amount_paid, 0);

  document.getElementById('invoice-due-total').textContent = fmt(due);
  document.getElementById('invoice-due-count').textContent = `${open.length} open`;
  document.getElementById('invoice-collected-total').textContent = fmt(collected);
  document.getElementById('invoice-paid-count').textContent = `${paid.length} paid`;

  document.querySelectorAll('[data-invoice-count]').forEach((el) => {
    const key = el.getAttribute('data-invoice-count');
    el.textContent = String(key === 'pending' ? open.length : paid.length);
  });
}

async function reload({ keepSelection = false, keepModalOpen = false } = {}) {
  const prevId = state.selectedId;
  const wasOpen = keepModalOpen && prevId;
  state.payments = await getPayments();
  updateSummary();
  renderList();

  if (wasOpen && state.payments.some((x) => String(x.id) === String(prevId))) {
    await openInvoiceModal(prevId);
  } else if (!keepModalOpen) {
    closeInvoiceModal();
  }
}

export async function loadPaymentsPage() {
  const feedback = document.getElementById('payments-feedback');

  document.querySelectorAll('[data-invoice-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.activeFilter = btn.getAttribute('data-invoice-filter') || 'pending';
      closeInvoiceModal();
      document.querySelectorAll('[data-invoice-filter]').forEach((tab) => {
        tab.classList.toggle('is-active', tab === btn);
      });
      hideFeedback(feedback);
      renderList();
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !getModal() || getModal().hidden) return;
    closeInvoiceModal();
  });

  getModal()?.querySelector('.billing-modal__backdrop')?.addEventListener('click', closeInvoiceModal);

  try {
    await reload();
  } catch (err) {
    const listEl = document.getElementById('invoice-list');
    if (listEl) {
      listEl.innerHTML = `
        <div class="invoice-empty">
          <p class="invoice-empty__title">Could not load invoices</p>
          <p class="invoice-empty__text">${escapeHtml(err.message)}</p>
        </div>`;
    }
  }
}
