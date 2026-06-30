/**
 * Admin billing — clickable list; invoice review opens in a popup modal.
 */

import { getPayments, getPaymentById, updatePayment, sendPaymentInvoice } from '/assets/js/services/api.js';

const fmt = (n) => `₱${parseFloat(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
const PAYMENT_METHODS = ['Cash', 'GCash', 'Bank Transfer'];

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

function invoiceEmailButtonLabel(p) {
  const email = p.guest_email || 'guest';
  return p.invoice_sent_at ? `Resend invoice to ${email}` : `Email invoice to ${email}`;
}

function invoiceEmailHint(p) {
  if (p.invoice_sent_at) {
    return 'Use resend after changing the discount or if the guest did not receive it.';
  }
  return 'Not emailed yet — send the invoice to the guest\u2019s booking email.';
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
  const parts = [p.facility_category, p.facility_room_code || p.facility_name].filter(Boolean);
  return parts.join(' · ') || 'Venue';
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

function dueAmount(p) {
  const subtotal = Number(p.subtotal ?? p.booking_total ?? p.amount ?? 0);
  const discount = Number(p.discount_amount || 0);
  return Math.max(0.01, subtotal - discount);
}

function filteredPayments() {
  const pending = state.payments.filter((p) => p.status === 'Pending');
  const paid = state.payments.filter((p) => p.status === 'Paid');
  return state.activeFilter === 'paid' ? paid : pending;
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

function readBillingFormValues(form) {
  if (!form) return { discount_amount: 0, discount_note: '' };
  return {
    discount_amount: Number(form.querySelector('[name="discount_amount"]')?.value || 0),
    discount_note: String(form.querySelector('[name="discount_note"]')?.value || '').trim(),
  };
}

function hasUnsavedBillingChanges(p, form) {
  if (!form) return false;
  const { discount_amount, discount_note } = readBillingFormValues(form);
  const savedDiscount = Number(p.discount_amount || 0);
  const savedNote = String(p.discount_note || '').trim();
  return discount_amount !== savedDiscount || discount_note !== savedNote;
}

function syncApproveButtonState(detailEl) {
  const method = getPayMethodSelect(detailEl)?.value || '';
  const approveBtn = detailEl?.querySelector('[data-mark-paid]');
  const confirmOpen = detailEl?.querySelector('[data-approve-confirm]:not(.hidden)');
  if (!approveBtn || confirmOpen) return;
  approveBtn.disabled = !method;
}

function closeApproveConfirm(detailEl) {
  const panel = detailEl?.querySelector('[data-approve-confirm]');
  const approveBtn = detailEl?.querySelector('[data-mark-paid]');
  const methodSelect = getPayMethodSelect(detailEl);
  if (!panel) return;
  panel.classList.add('hidden');
  panel.hidden = true;
  const check = panel.querySelector('[data-approve-check]');
  if (check) check.checked = false;
  const submitBtn = panel.querySelector('[data-confirm-paid]');
  if (submitBtn) submitBtn.disabled = true;
  if (methodSelect) methodSelect.disabled = false;
  if (approveBtn) {
    approveBtn.classList.remove('hidden');
    approveBtn.hidden = false;
    syncApproveButtonState(detailEl);
  }
}

function openApproveConfirm(detailEl, p) {
  const panel = detailEl?.querySelector('[data-approve-confirm]');
  const approveBtn = detailEl?.querySelector('[data-mark-paid]');
  const methodSelect = getPayMethodSelect(detailEl);
  const method = methodSelect?.value || '';
  if (!panel || !method) return;

  const form = getBillingForm(detailEl);
  const { discount_amount } = readBillingFormValues(form);
  const subtotal = Number(p.subtotal ?? p.booking_total ?? p.amount ?? 0);
  const due = Math.max(0.01, subtotal - discount_amount);

  panel.querySelector('[data-approve-amount]').textContent = fmt(due);
  panel.querySelector('[data-approve-guest]').textContent = p.guest_name || 'Guest';
  panel.querySelector('[data-approve-method]').textContent = method;

  const check = panel.querySelector('[data-approve-check]');
  const submitBtn = panel.querySelector('[data-confirm-paid]');
  if (check) check.checked = false;
  if (submitBtn) submitBtn.disabled = true;

  panel.classList.remove('hidden');
  panel.hidden = false;
  if (approveBtn) {
    approveBtn.classList.add('hidden');
    approveBtn.hidden = true;
  }
  if (methodSelect) methodSelect.disabled = true;
  check?.focus();
}

function renderListRow(p) {
  const isPending = p.status === 'Pending';
  const due = dueAmount(p);
  const isSelected = String(p.id) === String(state.selectedId);
  const emailed = p.invoice_sent_at
    ? '<span class="billing-row__tag billing-row__tag--sent" title="Invoice emailed">✉ Sent</span>'
    : '<span class="billing-row__tag billing-row__tag--unsent" title="Not emailed yet">✉ Not sent</span>';

  return `
    <button type="button"
      class="billing-row${isSelected ? ' is-selected' : ''}"
      data-invoice-row="${p.id}"
      role="option"
      aria-selected="${isSelected}">
      <span class="billing-row__main">
        <span class="billing-row__guest">${escapeHtml(p.guest_name || 'Guest')}</span>
        <span class="billing-row__meta">${escapeHtml(bookingShort(p))} · ${escapeHtml(bookingDatesShort(p))}</span>
      </span>
      <span class="billing-row__side">
        <span class="billing-row__amount">${fmt(isPending ? due : p.amount)}</span>
        <span class="billing-row__badges">
          ${isVenueInvoice(p) ? '<span class="billing-row__tag billing-row__tag--venue">Venue</span>' : '<span class="billing-row__tag billing-row__tag--room">Room</span>'}
          <span class="billing-row__status billing-row__status--${isPending ? 'pending' : 'paid'}">${isPending ? 'Due' : 'Paid'}</span>
          ${isPending ? emailed : ''}
        </span>
        <span class="billing-row__id">#${p.id}</span>
      </span>
      <span class="material-symbols-outlined billing-row__chevron" aria-hidden="true">chevron_right</span>
    </button>`;
}

function stayNights(p) {
  return p.nights || 1;
}

function chargeLines(p) {
  const bookingTotal = Number(p.booking_total || p.subtotal || 0);

  if (isVenueInvoice(p)) {
    const time = [formatTime12(p.start_time), formatTime12(p.end_time)].filter(Boolean).join(' – ');
    const packageNote = p.facility_package ? ` · ${p.facility_package}` : '';
    return {
      lines: [{
        icon: 'sports_basketball',
        label: p.facility_name || 'Venue rental',
        detail: `${venueLabel(p)}${time ? ` · ${time}` : ''} · ${p.guest_count || 1} guest${Number(p.guest_count) === 1 ? '' : 's'}${p.season ? ` · ${p.season}` : ''}${packageNote}`,
        amount: bookingTotal,
      }],
      bookingTotal,
    };
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

function renderReservationSection(p) {
  if (isVenueInvoice(p)) {
    const timeLabel = `${formatTime12(p.start_time)} – ${formatTime12(p.end_time)}`;
    const chips = [
      renderInfoChip('event', 'Event date', formatDateLongSingle(p.event_date)),
      renderInfoChip('schedule', 'Time', timeLabel),
      renderInfoChip('group', 'Guests', `${p.guest_count || 1} expected`),
      renderInfoChip('location_on', 'Venue', venueLabel(p)),
      p.season ? renderInfoChip('wb_sunny', 'Season', p.season) : '',
      p.facility_package ? renderInfoChip('inventory_2', 'Package', p.facility_package) : '',
    ].filter(Boolean).join('');

    const extras = [
      p.guest_email ? `<div class="billing-meta-row"><span>Email</span><span>${escapeHtml(p.guest_email)}</span></div>` : '',
      p.notes ? `<div class="billing-meta-row"><span>Booking notes</span><span>${escapeHtml(p.notes)}</span></div>` : '',
      `<div class="billing-meta-row"><span>Booking ref</span><span>#${p.facility_booking_id}</span></div>`,
      '<div class="billing-meta-row"><span>Type</span><span>Venue / facility</span></div>',
    ].filter(Boolean).join('');

    return `
    <section class="billing-reservation-card">
      <h4 class="billing-section-title">
        <span class="material-symbols-outlined" aria-hidden="true">meeting_room</span>
        Venue booking details
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

function renderDetailHeader(p, { statusLabel, statusClass }) {
  return `
    <header class="billing-detail__header billing-detail__header--styled">
      <div class="billing-detail__header-main">
        <div class="billing-detail__avatar" aria-hidden="true">
          <span class="material-symbols-outlined">${isVenueInvoice(p) ? 'meeting_room' : 'person'}</span>
        </div>
        <div>
          <p class="billing-detail__eyebrow">Invoice #${p.id} · ${isVenueInvoice(p) ? 'Venue' : 'Housing'} · ${statusLabel}</p>
          <h3 class="billing-detail__title" id="billing-modal-title">${escapeHtml(p.guest_name || 'Guest')}</h3>
        </div>
      </div>
      <button type="button" class="billing-detail__close" data-close-detail aria-label="Close">
        <span class="material-symbols-outlined">close</span>
      </button>
    </header>`;
}

function renderBillingColumn(p, { isPending }) {
  const subtotal = Number(p.subtotal ?? p.booking_total ?? p.amount ?? 0);
  const discount = Number(p.discount_amount || 0);
  const due = dueAmount(p);
  const methodOptions = PAYMENT_METHODS.map((m) => `<option value="${m}">${m}</option>`).join('');

  if (!isPending) {
    return `
      <div class="billing-detail-total billing-detail-total--paid">
        <span>Amount paid</span>
        <strong>${fmt(p.amount)}</strong>
        <small>via ${escapeHtml(p.method || '—')}</small>
      </div>`;
  }

  return `
    <section class="billing-edit-card">
      <h4 class="billing-section-title">
        <span class="material-symbols-outlined" aria-hidden="true">edit_note</span>
        Edit &amp; approve
      </h4>
      <p class="billing-detail__lead">When a stay or venue booking is approved, the invoice is emailed automatically to the guest. Adjust discount if needed, then approve payment.</p>

      <form class="billing-edit-form" data-detail-form="${p.id}">
        <div class="billing-edit-form__grid">
          <label class="billing-edit-form__field">
            <span>Subtotal</span>
            <input type="text" class="billing-edit-form__input" value="${fmt(subtotal)}" disabled />
          </label>
          <label class="billing-edit-form__field">
            <span>Discount (₱)</span>
            <input type="number" min="0" step="0.01" max="${subtotal}" class="billing-edit-form__input"
              name="discount_amount" value="${discount}" data-live-due />
          </label>
        </div>
        <label class="billing-edit-form__field">
          <span>Discount reason</span>
          <input type="text" class="billing-edit-form__input" name="discount_note" maxlength="255"
            placeholder="e.g. Staff rate, ministry partner" value="${escapeHtml(p.discount_note || '')}" />
        </label>
        <div class="billing-detail-total" data-due-display>
          <span>Amount due after discount</span>
          <strong>${fmt(due)}</strong>
        </div>
        <button type="submit" class="invoice-btn-secondary">Save changes</button>
      </form>

      <div class="billing-detail-actions">
        <div class="billing-email-status${p.invoice_sent_at ? ' billing-email-status--sent' : ''}">
          <span class="material-symbols-outlined" aria-hidden="true">mail</span>
          <span>${escapeHtml(formatSentAt(p.invoice_sent_at))}</span>
        </div>
        <button type="button" class="invoice-btn-secondary" data-send-invoice="${p.id}">
          <span class="material-symbols-outlined" aria-hidden="true">send</span>
          ${escapeHtml(invoiceEmailButtonLabel(p))}
        </button>
        <p class="billing-email-recipient-hint">
          ${escapeHtml(invoiceEmailHint(p))}
        </p>
        <label class="billing-edit-form__field">
          <span>Payment method (required to approve)</span>
          <select class="billing-edit-form__input" data-pay-method="${p.id}">
            <option value="">Select how guest paid…</option>
            ${methodOptions}
          </select>
        </label>

        <div class="billing-approve-confirm hidden" data-approve-confirm hidden role="region" aria-label="Confirm payment approval">
          <div class="billing-approve-confirm__banner" role="alert">
            <span class="material-symbols-outlined billing-approve-confirm__icon" aria-hidden="true">gpp_maybe</span>
            <div>
              <p class="billing-approve-confirm__title">Final approval — please verify</p>
              <p class="billing-approve-confirm__summary">
                Record <strong data-approve-amount>${fmt(due)}</strong> from
                <strong data-approve-guest>${escapeHtml(p.guest_name || 'Guest')}</strong>
                via <strong data-approve-method>—</strong>.
              </p>
              <p class="billing-approve-confirm__note">
                This marks the housing bill as paid and emails a receipt. You cannot undo this from Billing.
              </p>
            </div>
          </div>
          <label class="billing-approve-confirm__check">
            <input type="checkbox" data-approve-check />
            <span>I confirm the guest has paid the amount shown and the payment method is correct.</span>
          </label>
          <div class="billing-approve-confirm__actions">
            <button type="button" class="invoice-btn-secondary" data-cancel-approve>Go back</button>
            <button type="button" class="invoice-btn-confirm" data-confirm-paid="${p.id}" disabled>
              <span class="material-symbols-outlined" aria-hidden="true">verified</span>
              Yes, record payment
            </button>
          </div>
        </div>

        <button type="button" class="invoice-btn-confirm" data-mark-paid="${p.id}" disabled>
          <span class="material-symbols-outlined" aria-hidden="true">verified</span>
          Approve payment — final check
        </button>
      </div>
    </section>`;
}

function renderDetailPanel(p) {
  const isPending = p.status === 'Pending';

  return `
    <div class="billing-detail">
      ${renderDetailHeader(p, {
        statusLabel: isPending ? 'Final review' : 'Paid',
        statusClass: isPending ? 'pending' : 'paid',
      })}
      <div class="billing-detail__body nice-scroll">
        <div class="billing-detail__columns">
          <div class="billing-detail__col">
            ${renderReservationSection(p)}
          </div>
          <div class="billing-detail__col billing-detail__col--billing">
            ${renderBillingColumn(p, { isPending })}
          </div>
        </div>
      </div>
      <div id="billing-detail-feedback" class="billing-detail-feedback hidden" role="status"></div>
    </div>`;
}

function updateLiveDue(form) {
  const subtotalInput = form.querySelector('[disabled]');
  const discountInput = form.querySelector('[name="discount_amount"]');
  const dueEl = form.closest('.billing-detail')?.querySelector('[data-due-display] strong');
  if (!discountInput || !dueEl) return;
  const subtotal = parseFloat(String(subtotalInput?.value || '').replace(/[^\d.]/g, '')) || 0;
  const discount = Math.max(0, Number(discountInput.value) || 0);
  const due = Math.max(0.01, subtotal - discount);
  dueEl.textContent = fmt(due);
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
  form?.querySelector('[data-live-due]')?.addEventListener('input', () => updateLiveDue(form));

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await updatePayment(p.id, {
        discount_amount: form.querySelector('[name="discount_amount"]')?.value,
        discount_note: form.querySelector('[name="discount_note"]')?.value,
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
    const verb = fresh.invoice_sent_at ? 'Resend' : 'Email';
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

  const methodSelect = getPayMethodSelect(detailEl);
  methodSelect?.addEventListener('change', () => {
    hideFeedback(detailFeedback);
    syncApproveButtonState(detailEl);
  });
  syncApproveButtonState(detailEl);

  detailEl?.querySelector('[data-cancel-approve]')?.addEventListener('click', () => {
    hideFeedback(detailFeedback);
    closeApproveConfirm(detailEl);
  });

  detailEl?.querySelector('[data-approve-check]')?.addEventListener('change', (e) => {
    const submitBtn = detailEl.querySelector('[data-confirm-paid]');
    if (submitBtn) submitBtn.disabled = !e.target.checked;
  });

  detailEl?.querySelector('[data-mark-paid]')?.addEventListener('click', () => {
    hideFeedback(detailFeedback);
    const method = getPayMethodSelect(detailEl)?.value;
    if (!method) {
      showFeedback(detailFeedback, 'Select payment method before approving.', 'error');
      methodSelect?.focus();
      return;
    }
    const form = getBillingForm(detailEl);
    if (hasUnsavedBillingChanges(selectedPayment() || p, form)) {
      showFeedback(detailFeedback, 'Save discount changes before approving payment.', 'error');
      form?.querySelector('button[type="submit"]')?.focus();
      return;
    }
    openApproveConfirm(detailEl, selectedPayment() || p);
  });

  detailEl?.querySelector('[data-confirm-paid]')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const check = detailEl.querySelector('[data-approve-check]');
    const method = getPayMethodSelect(detailEl)?.value;
    if (!method) {
      showFeedback(detailFeedback, 'Select payment method before approving.', 'error');
      closeApproveConfirm(detailEl);
      return;
    }
    if (!check?.checked) {
      showFeedback(detailFeedback, 'Check the confirmation box to record payment.', 'error');
      check?.focus();
      return;
    }

    const fresh = selectedPayment() || p;
    hideFeedback(detailFeedback);
    btn.disabled = true;
    const label = btn.innerHTML;
    btn.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">hourglass_top</span> Approving…';
    try {
      await updatePayment(p.id, { status: 'Paid', method });
      closeInvoiceModal();
      await reload();
      showFeedback(pageFeedback, `Payment approved for ${fresh.guest_name}. Receipt emailed.`, 'ok');
    } catch (err) {
      showFeedback(detailFeedback, err.message || 'Could not approve payment.', 'error');
      btn.disabled = !check.checked;
      btn.innerHTML = label;
      closeApproveConfirm(detailEl);
    }
  });
}

function updateSummary() {
  const pending = state.payments.filter((x) => x.status === 'Pending');
  const paid = state.payments.filter((x) => x.status === 'Paid');
  const due = pending.reduce((s, x) => s + dueAmount(x), 0);
  const collected = paid.reduce((s, x) => s + parseFloat(x.amount || 0), 0);

  document.getElementById('invoice-due-total').textContent = fmt(due);
  document.getElementById('invoice-due-count').textContent = `${pending.length} open`;
  document.getElementById('invoice-collected-total').textContent = fmt(collected);
  document.getElementById('invoice-paid-count').textContent = `${paid.length} paid`;

  document.querySelectorAll('[data-invoice-count]').forEach((el) => {
    const key = el.getAttribute('data-invoice-count');
    el.textContent = String(key === 'pending' ? pending.length : paid.length);
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
    const detailEl = document.getElementById('invoice-detail');
    const confirmOpen = detailEl?.querySelector('[data-approve-confirm]:not(.hidden)');
    if (confirmOpen) {
      closeApproveConfirm(detailEl);
      return;
    }
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
