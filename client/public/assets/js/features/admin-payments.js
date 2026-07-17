/**
 * Admin billing — clickable list; invoice review opens in a popup modal.
 */

import {
  getPayments, getPaymentById, updatePayment, sendPaymentInvoice, recordPaymentTransaction,
  deletePayment, clearPaidPayments, getExtraServicesCatalog, updateBooking,
  updateFacilityBooking, convertPaymentReservation, revertPaymentOvernight, getFacilitiesOverview,
} from '/assets/js/services/api.js';
import { createBookingPoll } from '/assets/js/layout/booking-poll.js';
import { refreshAdminReadOnlyUI } from '/assets/js/services/auth.js';
import { buildFeeGroups, renderWizardFeePicker, handleWizardFeePickerClick } from '/assets/js/features/booking-fee-picker.js';
import { escapeHtml } from '/assets/js/features/reservation-shared.js';

const fmt = (n) => `₱${parseFloat(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
const PAYMENT_METHODS = ['Cash', 'GCash', 'Bank Transfer', 'Waived'];
const TX_TYPES = ['Deposit', 'Advance', 'Settlement', 'Refund'];

const state = {
  payments: [],
  activeFilter: 'pending',
  selectedId: null,
};

/** @type {(() => void) | null} */
let stopBookingPoll = null;
/** @type {(() => void) | null} */
let onBookingUpdated = null;
let paymentsPageBound = false;

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
  if (showAsVenueOvernightBilling(p)) {
    const code = venueStayCodeFromNotes(p.notes) || p.facility_room_code || venueSpaceLabel(p);
    return `${code} · overnight`;
  }
  const venueStay = venueStayCodeFromNotes(p.notes);
  if (venueStay) return `${venueStay} · overnight`;
  if (p.room_number === 'VENUE-STAY') {
    const code = venueStayCodeFromNotes(p.notes) || 'Conference room';
    return `${code} · overnight`;
  }
  const room = p.room_number ? `Rm ${p.room_number}` : 'Room';
  const building = p.building_name || 'Building';
  return `${building} · ${room}`;
}

function venueStayCodeFromNotes(notes) {
  const match = String(notes || '').match(/\[Venue stay:\s*([^\]]+)\]/i);
  return match ? match[1].trim() : '';
}

function roomLabel(p) {
  if (showAsVenueOvernightBilling(p)) {
    const code = venueStayCodeFromNotes(p.notes) || p.facility_room_code || venueSpaceLabel(p);
    return `${code} · overnight stay`;
  }
  const venueStay = venueStayCodeFromNotes(p.notes);
  if (venueStay) {
    return `${venueStay} · overnight stay`;
  }
  if (p.room_number === 'VENUE-STAY') {
    const code = venueStayCodeFromNotes(p.notes) || 'Conference room';
    return `${code} · overnight stay`;
  }
  const building = p.building_name || 'Building';
  const room = p.room_number ? `Room ${p.room_number}` : 'Room';
  const type = p.room_type ? ` (${p.room_type})` : '';
  return `${building} · ${room}${type}`;
}

function isLegacyVenueStayRoom(p) {
  if (!p || isVenueInvoice(p)) return false;
  return p.room_number === 'VENUE-STAY' || /\[Venue stay:/i.test(String(p.notes || ''));
}

function showAsVenueOvernightBilling(p) {
  return isVenueConvertedToStay(p) || isLegacyVenueStayRoom(p);
}

function isVenueConvertedToStay(p) {
  if (!p) return false;
  if (p.billing_overnight_converted) return true;
  if (p.facility_booking_id != null && /\[Converted to overnight stay\]/i.test(String(p.notes || ''))) return true;
  return false;
}

function isVenueInvoice(p) {
  if (!p) return false;
  if (isVenueConvertedToStay(p)) return true;
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
  if (showAsVenueOvernightBilling(p)) {
    const code = venueStayCodeFromNotes(p.notes) || p.facility_room_code || venueSpaceLabel(p);
    return `${code} · overnight`;
  }
  return isVenueInvoice(p) ? venueShort(p) : roomShort(p);
}

function bookingDatesShort(p) {
  if (showAsVenueOvernightBilling(p)) {
    return formatDateShort(p.check_in, p.check_out);
  }
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

function isPartialInvoice(p) {
  return p.status === 'Partially Paid';
}

function isPendingInvoice(p) {
  return p.status === 'Pending';
}

function listFilterHint() {
  if (state.activeFilter === 'partial') {
    return 'Guests who paid a deposit or advance — balance due is shown with how much they already paid.';
  }
  if (state.activeFilter === 'paid') {
    return 'Fully settled invoices. Tap a row to review payment history, or clear records you no longer need.';
  }
  return 'No payment recorded yet. Tap a row to email the invoice or record a deposit.';
}

function filteredPayments() {
  if (state.activeFilter === 'paid') {
    return state.payments.filter((p) => p.status === 'Paid');
  }
  if (state.activeFilter === 'partial') {
    return state.payments.filter((p) => isPartialInvoice(p));
  }
  return state.payments.filter((p) => isPendingInvoice(p));
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

function syncClearPaidButton() {
  const btn = document.getElementById('billing-clear-paid');
  if (!btn) return;
  const paidCount = state.payments.filter((p) => p.status === 'Paid').length;
  const show = state.activeFilter === 'paid' && paidCount > 0;
  btn.classList.toggle('hidden', !show);
  btn.disabled = !show;
}

async function handleClearInvoice(id, { closeModal = false, feedbackEl } = {}) {
  const payment = state.payments.find((p) => String(p.id) === String(id));
  const guest = payment?.guest_name || 'this guest';
  if (!window.confirm(`Clear invoice #${id} for ${guest}?\n\nThis removes the billing record only. The reservation stays on file.`)) {
    return;
  }

  const targetFeedback = feedbackEl || document.getElementById('payments-feedback');
  await withBillingAction({
    feedbackEl: targetFeedback,
    run: async () => {
      const result = await deletePayment(id);
      if (closeModal) closeInvoiceModal();
      await reload();
      showFeedback(targetFeedback, result.message || 'Invoice cleared.', 'ok');
    },
  });
}

async function handleClearAllPaid() {
  const paid = state.payments.filter((p) => p.status === 'Paid');
  if (!paid.length) return;
  if (!window.confirm(`Clear all ${paid.length} paid invoice${paid.length === 1 ? '' : 's'} from billing?\n\nReservations are not deleted. This cannot be undone.`)) {
    return;
  }

  const feedback = document.getElementById('payments-feedback');
  const clearBtn = document.getElementById('billing-clear-paid');
  if (clearBtn) clearBtn.disabled = true;

  try {
    await withBillingAction({
      feedbackEl: feedback,
      run: async () => {
        const result = await clearPaidPayments();
        closeInvoiceModal();
        await reload();
        showFeedback(feedback, result.message || 'Paid invoices cleared.', 'ok');
      },
    });
  } finally {
    syncClearPaidButton();
  }
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
  if (type === 'error') {
    el.setAttribute('role', 'alert');
  } else {
    el.setAttribute('role', 'status');
  }
}

function getBillingErrorMessage(err) {
  if (!err) return 'Something went wrong. Please try again.';
  const msg = String(err.message || '').trim();
  if (!msg) return 'Something went wrong. Please try again.';
  if (/^Request failed \(\d+\)$/.test(msg)) {
    return 'Could not complete the request. Please try again.';
  }
  return msg;
}

function renderInvoiceLoadError(id, message) {
  return `
    <div class="billing-detail-error-panel">
      <p class="billing-detail-error">${escapeHtml(message)}</p>
      <div class="billing-detail-error-actions">
        <button type="button" class="invoice-btn-secondary" data-retry-invoice="${escapeHtml(String(id))}">Try again</button>
        <button type="button" class="invoice-btn-secondary" data-close-detail>Close</button>
      </div>
    </div>`;
}

async function withBillingAction({ feedbackEl, onError, run }) {
  try {
    return await run();
  } catch (err) {
    const message = getBillingErrorMessage(err);
    if (feedbackEl) showFeedback(feedbackEl, message, 'error');
    if (onError) onError(err);
    throw err;
  }
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
  if (!form) return { discount_amount: 0, discount_note: '', subtotal };
  const mode = getDiscountMode(form);
  const parsedSubtotal = Math.round(Number(getFormSubtotal(form) || subtotal) * 100) / 100;
  const discount_amount = mode === 'fixed'
    ? Math.max(0, Math.min(parsedSubtotal, Number(form.querySelector('[name="discount_amount"]')?.value || 0)))
    : discountFromPercent(parsedSubtotal, form.querySelector('[name="discount_percent"]')?.value);
  return {
    subtotal: parsedSubtotal,
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
  const savedSubtotal = Math.round(Number(p.subtotal ?? p.booking_total ?? p.amount ?? 0) * 100) / 100;
  const { subtotal, discount_amount, discount_note } = readBillingFormValues(form, savedSubtotal);
  const savedDiscount = Number(p.discount_amount || 0);
  const savedNote = String(p.discount_note || '').trim();
  return subtotal !== savedSubtotal
    || discount_amount !== savedDiscount
    || discount_note !== savedNote;
}

const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

function feesFromPaymentRows(fees = []) {
  return (fees || []).map((f) => ({
    fee_name: f.fee_name || f.service_name || 'Extra service',
    amount: Number(f.amount || 0),
  }));
}

function mealsFromPaymentRows(meals = []) {
  const out = Object.fromEntries(MEAL_TYPES.map((t) => [t, 0]));
  (meals || []).forEach((m) => {
    if (m.meal_type && out[m.meal_type] != null) {
      out[m.meal_type] = Number(m.quantity) || 0;
    }
  });
  return out;
}

function feesEqual(a, b) {
  const left = feesFromPaymentRows(a);
  const right = feesFromPaymentRows(b);
  if (left.length !== right.length) return false;
  return left.every((f, i) => f.fee_name === right[i].fee_name && f.amount === right[i].amount);
}

function canEditBookingFees(p) {
  return !isVenueInvoice(p) && p.booking_id && p.status !== 'Paid';
}

function renderReadOnlyFeesList(fees = []) {
  const items = feesFromPaymentRows(fees);
  if (!items.length) {
    return '<p class="billing-fee-panel__empty">No additional fees on this stay.</p>';
  }
  return `
    <ul class="billing-fee-readonly">
      ${items.map((f) => `
        <li class="billing-fee-readonly__item">
          <span>${escapeHtml(f.fee_name)}</span>
          <strong>${fmt(f.amount)}</strong>
        </li>`).join('')}
    </ul>`;
}

function renderAdditionalFeesPanel(p, feeEditor, { editable } = {}) {
  const pickerHtml = editable
    ? renderWizardFeePicker({
        feeGroups: feeEditor.feeGroups,
        expandedGroupId: feeEditor.expandedGroupId,
        fees: feeEditor.fees,
        customNameInputId: `billing-fee-name-${p.id}`,
        customAmtInputId: `billing-fee-amt-${p.id}`,
        customAddBtnId: `billing-fee-add-${p.id}`,
        emptyMessage: 'Pick a catalog fee below or add a custom charge.',
      })
    : renderReadOnlyFeesList(feeEditor.fees);

  return `
    <section class="billing-panel billing-panel--fees billing-fee-panel${editable ? '' : ' billing-fee-panel--readonly'}" data-billing-fees-root="${p.id}">
      <h4 class="billing-section-title">
        <span class="material-symbols-outlined" aria-hidden="true">add_shopping_cart</span>
        Additional fees
      </h4>
      ${editable
        ? `<p class="billing-fee-panel__lead">Add charges the guest forgot at booking — laundry, corkage, custom items, and more.</p>
           <p class="billing-fee-panel__catalog-hint hidden" data-billing-fee-catalog-hint">Fee catalog unavailable — custom charges still work.</p>`
        : ''}
      <div data-billing-fee-picker>${pickerHtml}</div>
      ${editable ? `
        <div class="billing-fee-panel__actions">
          <button type="button" class="invoice-btn-secondary billing-fee-panel__save" data-save-booking-fees="${p.id}" disabled>
            Save additional fees
          </button>
        </div>` : ''}
    </section>`;
}

function renderRoomFeesSection(p) {
  if (!p.booking_id || isVenueInvoice(p)) return '';
  const editable = canEditBookingFees(p);
  const feeEditor = {
    fees: feesFromPaymentRows(p.fees),
    originalFees: feesFromPaymentRows(p.fees),
    expandedGroupId: null,
    feeGroups: [],
  };
  if (!editable && !feeEditor.fees.length) return '';
  return renderAdditionalFeesPanel(p, feeEditor, { editable });
}

function getFeeEditorRoot(detailEl, paymentId) {
  return detailEl?.querySelector(`[data-billing-fees-root="${paymentId}"]`) || null;
}

function hasUnsavedFeeChanges(detailEl, paymentId) {
  const root = getFeeEditorRoot(detailEl, paymentId);
  const editor = root?._feeEditor;
  if (!editor) return false;
  return !feesEqual(editor.fees, editor.originalFees);
}

function syncFeeSaveButton(detailEl, paymentId) {
  const root = getFeeEditorRoot(detailEl, paymentId);
  const editor = root?._feeEditor;
  const btn = root?.querySelector('[data-save-booking-fees]');
  if (!btn || !editor) return;
  btn.disabled = feesEqual(editor.fees, editor.originalFees);
}

function rerenderBillingFeePicker(detailEl, p, feeEditor) {
  const mount = getFeeEditorRoot(detailEl, p.id)?.querySelector('[data-billing-fee-picker]');
  if (!mount) return;
  mount.innerHTML = renderWizardFeePicker({
    feeGroups: feeEditor.feeGroups,
    expandedGroupId: feeEditor.expandedGroupId,
    fees: feeEditor.fees,
    customNameInputId: `billing-fee-name-${p.id}`,
    customAmtInputId: `billing-fee-amt-${p.id}`,
    customAddBtnId: `billing-fee-add-${p.id}`,
    emptyMessage: 'No catalog fees yet — add a custom charge below or configure fees under Facilities.',
  });
  syncFeeSaveButton(detailEl, p.id);
}

async function initBillingFeeEditor(p, detailEl) {
  if (isVenueInvoice(p) || !p.booking_id) return;

  const root = getFeeEditorRoot(detailEl, p.id);
  if (!root) return;

  const feeEditor = {
    fees: feesFromPaymentRows(p.fees),
    originalFees: feesFromPaymentRows(p.fees),
    expandedGroupId: null,
    feeGroups: [],
  };
  root._feeEditor = feeEditor;

  if (!canEditBookingFees(p)) return;

  bindBillingFeeEditorEvents(p, detailEl, feeEditor);

  try {
    const catalog = await getExtraServicesCatalog();
    if (String(state.selectedId) !== String(p.id)) return;
    const liveRoot = getFeeEditorRoot(detailEl, p.id);
    if (!liveRoot?._feeEditor) return;
    liveRoot._feeEditor.feeGroups = buildFeeGroups(catalog);
    rerenderBillingFeePicker(detailEl, p, liveRoot._feeEditor);
  } catch {
    getFeeEditorRoot(detailEl, p.id)
      ?.querySelector('[data-billing-fee-catalog-hint]')
      ?.classList.remove('hidden');
  }
}

function bindBillingFeeEditorEvents(p, detailEl, feeEditor) {
  const root = getFeeEditorRoot(detailEl, p.id);
  if (!root || root.dataset.feeBound === '1') return;
  root.dataset.feeBound = '1';

  root.addEventListener('click', (e) => {
    if (e.target.closest(`#billing-fee-add-${p.id}`)) {
      e.preventDefault();
      const name = document.getElementById(`billing-fee-name-${p.id}`)?.value?.trim();
      const amount = Number(document.getElementById(`billing-fee-amt-${p.id}`)?.value || 0);
      if (!name) {
        showFeedback(document.getElementById('billing-detail-feedback'), 'Enter a fee name.', 'error');
        return;
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        showFeedback(document.getElementById('billing-detail-feedback'), 'Enter a valid fee amount.', 'error');
        return;
      }
      hideFeedback(document.getElementById('billing-detail-feedback'));
      feeEditor.fees.push({ fee_name: name, amount });
      feeEditor.expandedGroupId = null;
      rerenderBillingFeePicker(detailEl, p, feeEditor);
      return;
    }

    const handled = handleWizardFeePickerClick(e, {
      getExpandedGroupId: () => feeEditor.expandedGroupId,
      setExpandedGroupId: (id) => { feeEditor.expandedGroupId = id; },
      onAddFee: (fee) => {
        feeEditor.fees.push(fee);
        feeEditor.expandedGroupId = null;
      },
      onRemoveFee: (index) => { feeEditor.fees.splice(index, 1); },
    });
    if (handled) rerenderBillingFeePicker(detailEl, p, feeEditor);
  });

  root.querySelector('[data-save-booking-fees]')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const detailFeedback = document.getElementById('billing-detail-feedback');
    const billingForm = getBillingForm(detailEl);
    if (hasUnsavedBillingChanges(p, billingForm)) {
      showFeedback(detailFeedback, 'Save invoice changes before updating fees.', 'error');
      return;
    }
    if (feesEqual(feeEditor.fees, feeEditor.originalFees)) return;

    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'Saving…';
    try {
      await updateBooking(p.booking_id, { fees: feeEditor.fees });
      await reload({ keepSelection: true, keepModalOpen: true });
      showFeedback(detailFeedback, 'Additional fees saved. Invoice subtotal updated.', 'ok');
      window.dispatchEvent(new CustomEvent('booking:updated'));
    } catch (err) {
      showFeedback(detailFeedback, getBillingErrorMessage(err), 'error');
      btn.disabled = false;
      btn.textContent = label;
    }
  });
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
  if (methodField) methodField.classList.toggle('hidden', isWaived);

  const methodLabel = methodField?.querySelector('span');
  if (methodLabel && !isWaived) {
    methodLabel.textContent = txType === 'Refund' ? 'Refund method' : 'Payment method';
  }

  const recordBtn = detailEl.querySelector('[data-confirm-paid]');
  const checked = detailEl.querySelector('[data-approve-check]')?.checked;
  if (recordBtn && !recordBtn.dataset.busy) {
    const needsMethod = !isWaived;
    const amountOk = isWaived || displayAmount > 0;
    recordBtn.disabled = (needsMethod && !method) || !checked || !amountOk;
    recordBtn.innerHTML = txType === 'Refund'
      ? '<span class="material-symbols-outlined" aria-hidden="true">currency_exchange</span> Record refund'
      : '<span class="material-symbols-outlined" aria-hidden="true">task_alt</span> Record payment';
  }
}

function renderListRow(p) {
  const isOpen = isOpenInvoice(p);
  const isPartial = isPartialInvoice(p);
  const summary = paymentSummary(p);
  const balance = summary.balance_due;
  const isSelected = String(p.id) === String(state.selectedId);
  const emailed = billingInvoiceEmailed(p)
    ? '<span class="billing-row__tag billing-row__tag--sent" title="Invoice emailed from Billing">✉ Sent</span>'
    : '<span class="billing-row__tag billing-row__tag--unsent" title="Not emailed from Billing yet">✉ Not sent</span>';

  let statusClass = 'pending';
  let statusLabel = 'Due';
  if (isPartial) {
    statusClass = 'partial';
    statusLabel = 'Partial';
  } else if (!isOpen) {
    statusClass = 'paid';
    statusLabel = 'Paid';
  }

  let amountLabel = 'Amount due';
  let amountValue = fmt(balance);
  let amountSub = '';

  if (state.activeFilter === 'paid' || (!isOpen && state.activeFilter !== 'partial')) {
    amountValue = fmt(summary.amount_paid || p.amount);
  } else if (isPartial || (isOpen && summary.amount_paid > 0)) {
    amountLabel = 'Balance due';
    amountValue = fmt(balance);
    amountSub = `${fmt(summary.amount_paid)} paid of ${fmt(summary.total_due)}`;
  }

  const isPaidTab = state.activeFilter === 'paid';
  const showAmountLabel = !(isPaidTab && !isOpen);
  const showStatusBadge = !(isPaidTab && statusClass === 'paid');
  const amountClass = isPartial
    ? ' billing-row__amount--due'
    : (isPaidTab && !isOpen ? ' billing-row__amount--settled' : '');

  const rowModifier = isPartial ? ' billing-row--partial' : (isPaidTab ? ' billing-row-wrap--paid' : '');
  const deleteBtn = isPaidTab
    ? `<button type="button" class="billing-row__delete" data-delete-invoice="${p.id}" aria-label="Clear invoice #${p.id}" title="Clear from billing records">
        <span class="material-symbols-outlined" aria-hidden="true">delete</span>
      </button>`
    : '';

  return `
    <div class="billing-row-wrap${isSelected ? ' is-selected' : ''}${rowModifier}">
    <button type="button"
      class="billing-row${isPartial ? ' billing-row--partial' : ''}"
      data-invoice-row="${p.id}"
      role="option"
      aria-selected="${isSelected}">
      <span class="billing-row__main">
        <span class="billing-row__guest">${escapeHtml(p.guest_name || 'Guest')}</span>
        <span class="billing-row__meta">${escapeHtml(bookingShort(p))} · ${escapeHtml(bookingDatesShort(p))}</span>
      </span>
      <span class="billing-row__side">
        <span class="billing-row__amount-wrap">
          ${showAmountLabel ? `<span class="billing-row__amount-label">${amountLabel}</span>` : ''}
          <span class="billing-row__amount${amountClass}">${amountValue}</span>
          ${amountSub ? `<span class="billing-row__amount-sub">${amountSub}</span>` : ''}
        </span>
        <span class="billing-row__badges">
          ${isVenueInvoice(p) ? '<span class="billing-row__tag billing-row__tag--venue">Venue</span>' : '<span class="billing-row__tag billing-row__tag--room">Room</span>'}
          ${showStatusBadge ? `<span class="billing-row__status billing-row__status--${statusClass}">${statusLabel}</span>` : ''}
          ${isOpen ? emailed : ''}
        </span>
        <span class="billing-row__id">#${p.id}</span>
      </span>
      <span class="material-symbols-outlined billing-row__chevron" aria-hidden="true">chevron_right</span>
    </button>
    ${deleteBtn}
    </div>`;
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

  if (showAsVenueOvernightBilling(p)) {
    const nights = stayNights(p) || 1;
    return {
      lines: [{
        icon: 'night_shelter',
        label: 'Overnight stay',
        detail: `${venueSpaceLabel(p)} · ${nights} night${nights === 1 ? '' : 's'} · billing conversion`,
        amount: bookingTotal,
      }],
      bookingTotal,
    };
  }

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

const ADMIN_MOD_PREFIX = '[Modified by admin]';
const MOD_REQUESTED_PREFIX = '[Modification requested]';
const GUEST_UPDATED_PREFIX = '[Updated by guest]';
const VENUE_STAY_BILLING_TAG_RE = /\[(?:Converted to overnight stay|Venue stay:[^\]]*|Stay check-in:[^\]]*|Stay check-out:[^\]]*)\]/gi;

function stripVenueStayBillingTagsText(text) {
  return String(text || '')
    .replace(VENUE_STAY_BILLING_TAG_RE, '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s{2,}/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

function parseBookingNotes(raw) {
  const result = {
    adminModification: null,
    modificationRequested: null,
    guestUpdate: null,
    guestNotes: null,
  };
  if (!raw || typeof raw !== 'string') return result;

  const guestParts = [];
  stripVenueStayBillingTagsText(raw).split(/\r?\n/).forEach((line) => {
    let remainder = line.trim();
    if (!remainder) return;

    const tags = [
      { prefix: ADMIN_MOD_PREFIX, key: 'adminModification' },
      { prefix: MOD_REQUESTED_PREFIX, key: 'modificationRequested' },
      { prefix: GUEST_UPDATED_PREFIX, key: 'guestUpdate' },
    ];

    let matched = false;
    for (const { prefix, key } of tags) {
      const idx = remainder.indexOf(prefix);
      if (idx === -1) continue;
      matched = true;
      const before = remainder.slice(0, idx).trim();
      const after = remainder.slice(idx + prefix.length).trim();
      if (before) guestParts.push(before);
      if (after) {
        result[key] = result[key] ? `${result[key]}\n${after}` : after;
      }
      remainder = '';
      break;
    }

    if (!matched && remainder) guestParts.push(remainder);
  });

  result.guestNotes = guestParts.length ? guestParts.join('\n') : null;
  return result;
}

function renderNoteTrackingCallouts(parsed) {
  const blocks = [
    parsed.adminModification
      ? { label: 'Modified by admin', text: parsed.adminModification, tone: 'admin' }
      : null,
    parsed.modificationRequested
      ? { label: 'Modification requested', text: parsed.modificationRequested, tone: 'requested' }
      : null,
    parsed.guestUpdate
      ? { label: 'Updated by guest', text: parsed.guestUpdate, tone: 'guest' }
      : null,
  ].filter(Boolean);

  if (!blocks.length) return '';
  return `
    <div class="billing-note-tracking">
      ${blocks.map(({ label, text, tone }) => `
        <div class="billing-admin-mod billing-admin-mod--${tone}" role="note">
          <div class="billing-admin-mod__badge">
            <span class="material-symbols-outlined" aria-hidden="true">${tone === 'admin' ? 'admin_panel_settings' : tone === 'requested' ? 'pending_actions' : 'person_edit'}</span>
            ${escapeHtml(label)}
          </div>
          <p class="billing-admin-mod__text">${escapeHtml(text)}</p>
        </div>`).join('')}
    </div>`;
}

function renderDetailItem(label, value, { wide = false, alert = false, multiline = false } = {}) {
  if (!value) return '';
  const valueHtml = multiline
    ? `<p class="billing-venue-details__value billing-venue-details__value--notes">${escapeHtml(value)}</p>`
    : `<span class="billing-venue-details__value">${escapeHtml(value)}</span>`;
  return `
    <div class="billing-venue-details__item${wide ? ' billing-venue-details__item--wide' : ''}${alert ? ' billing-venue-details__item--alert' : ''}">
      <span class="billing-venue-details__label">${escapeHtml(label)}</span>
      ${valueHtml}
    </div>`;
}

function renderVenueStayMetaChips(p) {
  const code = p.facility_room_code || venueStayCodeFromNotes(p.notes);
  const checkIn = sliceDate(p.check_in) || (String(p.notes || '').match(/\[Stay check-in:\s*([^\]]+)\]/i)?.[1] || '').slice(0, 10);
  const checkOut = sliceDate(p.check_out) || (String(p.notes || '').match(/\[Stay check-out:\s*([^\]]+)\]/i)?.[1] || '').slice(0, 10);
  const chips = [];
  if (showAsVenueOvernightBilling(p)) {
    chips.push({ icon: 'night_shelter', label: 'Overnight billing' });
  }
  if (code) chips.push({ icon: 'meeting_room', label: code });
  if (checkIn && checkOut) {
    chips.push({ icon: 'date_range', label: `${formatDateShort(checkIn, checkOut)}` });
  }
  if (!chips.length) return '';
  return `
    <div class="billing-stay-meta" aria-label="Stay billing details">
      ${chips.map(({ icon, label }) => `
        <span class="billing-stay-meta__chip">
          <span class="material-symbols-outlined" aria-hidden="true">${icon}</span>
          ${escapeHtml(label)}
        </span>`).join('')}
    </div>`;
}

function renderRoomDetailsCard(p, parsedNotes) {
  const notes = parsedNotes ?? parseBookingNotes(p.notes);
  const nights = stayNights(p);
  const mealsSummary = (p.meals || [])
    .filter((m) => Number(m.quantity) > 0)
    .map((m) => `${m.meal_type} × ${m.quantity}`)
    .join(', ');

  return `
    <div class="billing-venue-details">
      <div class="billing-venue-details__grid billing-venue-details__grid--unified">
        ${renderDetailItem('Stay', formatDateRange(p.check_in, p.check_out))}
        ${renderDetailItem('Nights', `${nights} night${nights === 1 ? '' : 's'}`)}
        ${renderDetailItem('Guests', `${p.guest_count || 1} in room`)}
        ${renderDetailItem('Room', roomLabel(p))}
        ${renderDetailItem('Season', p.season)}
        ${renderDetailItem('Group', p.group_name)}
        ${renderDetailItem('Phone', p.contact_phone)}
        ${renderDetailItem('Email', p.guest_email, { wide: true })}
        ${mealsSummary ? renderDetailItem('Meals ordered', mealsSummary, { wide: true }) : ''}
        ${p.meal_allergen_notes ? renderDetailItem('Allergen notes', p.meal_allergen_notes, { wide: true, alert: true }) : ''}
        ${notes.guestNotes ? renderDetailItem('Booking notes', notes.guestNotes, { wide: true, multiline: true }) : ''}
      </div>
      <div class="billing-venue-details__footer">
        <span class="billing-venue-details__ref">Booking ref #${escapeHtml(String(p.booking_id))}</span>
        <span class="billing-venue-details__type">Room stay</span>
      </div>
    </div>`;
}

function renderVenueOvernightDetailsCard(p, parsedNotes) {
  const notes = parsedNotes ?? parseBookingNotes(p.notes);
  const nights = stayNights(p) || 1;
  return `
    <div class="billing-venue-details billing-venue-details--overnight">
      <div class="billing-res-convert-notice billing-res-convert-notice--static" role="status">
        <span class="material-symbols-outlined" aria-hidden="true">night_shelter</span>
        <div>
          <strong>${escapeHtml(venueSpaceLabel(p))} — overnight stay</strong>
          <p>Billing conversion only — the venue booking stays on file. Stay dates and totals are managed in this invoice.</p>
          ${renderVenueStayMetaChips(p)}
        </div>
      </div>
      <div class="billing-venue-details__grid billing-venue-details__grid--unified">
        ${renderDetailItem('Space', venueLabel(p))}
        ${renderDetailItem('Check-in', formatDateLongSingle(p.check_in))}
        ${renderDetailItem('Check-out', formatDateLongSingle(p.check_out))}
        ${renderDetailItem('Nights', `${nights}`)}
        ${renderDetailItem('Guests', `${p.guest_count || 1} expected`)}
        ${renderDetailItem('Season', p.season)}
        ${renderDetailItem('Email', p.guest_email, { wide: true })}
        ${notes.guestNotes ? renderDetailItem('Booking notes', notes.guestNotes, { wide: true, multiline: true }) : ''}
      </div>
      <div class="billing-venue-details__footer">
        <span class="billing-venue-details__ref">Booking ref #${escapeHtml(String(p.facility_booking_id))}</span>
        <span class="billing-venue-details__type">Overnight (billing)</span>
      </div>
    </div>`;
}

function renderVenueDetailsCard(p, parsedNotes) {
  const notes = parsedNotes ?? parseBookingNotes(p.notes);
  const timeLabel = `${formatTime12(p.start_time)} – ${formatTime12(p.end_time)}`;
  return `
    <div class="billing-venue-details">
      <div class="billing-venue-details__grid billing-venue-details__grid--unified">
        ${renderDetailItem('Event date', formatDateLongSingle(p.event_date))}
        ${renderDetailItem('Time', timeLabel)}
        ${renderDetailItem('Guests', `${p.guest_count || 1} expected`)}
        ${renderDetailItem('Venue', venueLabel(p))}
        ${renderDetailItem('Season', p.season)}
        ${renderDetailItem('Package', p.facility_package)}
        ${renderDetailItem('Email', p.guest_email, { wide: true })}
        ${notes.guestNotes ? renderDetailItem('Booking notes', notes.guestNotes, { wide: true, multiline: true }) : ''}
      </div>
      <div class="billing-venue-details__footer">
        <span class="billing-venue-details__ref">Booking ref #${escapeHtml(String(p.facility_booking_id))}</span>
        <span class="billing-venue-details__type">Venue / facility</span>
      </div>
    </div>`;
}

function reservationKind(p) {
  return isVenueInvoice(p) ? 'venue' : 'room';
}

function canEditReservationDetails(p) {
  return p.status !== 'Paid' && Boolean(p.booking_id || p.facility_booking_id);
}

function sliceDate(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function sliceTime(value) {
  if (!value) return '';
  return String(value).slice(0, 5);
}

function buildVenueCatalogRows(catalog) {
  const rows = [];
  for (const group of catalog?.venues || []) {
    if (group.category === 'Recreation') continue;
    for (const item of group.items || []) {
      const facilityId = item.facility_id ?? item.id;
      rows.push({
        facility_id: facilityId,
        facility_group: group.category,
        room_code: item.room_code || null,
        label: item.label || `${group.category} — ${item.item}`,
      });
    }
  }
  return rows.sort((a, b) => a.label.localeCompare(b.label));
}

async function loadReservationCatalogs() {
  const overview = await getFacilitiesOverview().catch(() => ({ venues: [] }));
  return { venues: buildVenueCatalogRows(overview) };
}

function canRevertVenueOvernight(p) {
  return showAsVenueOvernightBilling(p) && p.status !== 'Paid';
}

function renderReservationPanelHead(title, icon, { editable, editLabel = 'Edit', revertable = false } = {}) {
  const actions = (editable || revertable) ? `
      <div class="billing-panel__actions">
        ${revertable ? `
        <button type="button" class="billing-res-revert-btn" data-res-revert-open>
          <span class="material-symbols-outlined" aria-hidden="true">undo</span>
          Revert to venue
        </button>` : ''}
        ${editable ? `
        <button type="button" class="billing-res-edit-btn" data-res-edit-open>
          <span class="material-symbols-outlined" aria-hidden="true">edit</span>
          ${escapeHtml(editLabel)}
        </button>` : ''}
      </div>` : '';
  return `
    <div class="billing-panel__head">
      <h4 class="billing-section-title">
        <span class="material-symbols-outlined" aria-hidden="true">${icon}</span>
        ${escapeHtml(title)}
      </h4>
      ${actions}
    </div>`;
}

function isRecreationVenue(p) {
  return String(p.facility_category || '').trim() === 'Recreation';
}

/** Coded GMC conference/classroom spaces — not recreation courts or outdoor venues. */
function isVenueRoomInvoice(p) {
  return isVenueInvoice(p) && Boolean(String(p.facility_room_code || '').trim());
}

function canConvertVenueToStay(p) {
  return isVenueRoomInvoice(p) && !isRecreationVenue(p) && !isVenueConvertedToStay(p);
}

function isConferenceStyleVenue(p) {
  if (!isVenueInvoice(p)) return false;
  const cat = String(p.facility_category || '').toLowerCase();
  const name = String(p.facility_name || p.facility_room_code || '').toLowerCase();
  return cat.includes('conference') || cat.includes('classroom') || name.includes('conference') || name.includes('classroom');
}

function venueSpaceLabel(p) {
  const code = String(p.facility_room_code || '').trim();
  const name = String(p.facility_name || '').trim();
  if (code && name) return `${code} — ${name}`;
  if (code) return code;
  return venueLabel(p);
}

function renderVenueSelectOptions(venues, selectedId) {
  const selected = String(selectedId || '');
  return (venues || [])
    .filter((v) => v.facility_group !== 'Recreation' || String(v.facility_id) === selected)
    .map((v) => {
      const sel = String(v.facility_id) === selected ? ' selected' : '';
      return `<option value="${v.facility_id}"${sel}>${escapeHtml(v.label)}</option>`;
    }).join('');
}

function addDays(dateStr, days) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function renderRoomStayEditForm(p) {
  const parsedNotes = parseBookingNotes(p.notes);
  const guestNotes = parsedNotes.guestNotes || '';
  return `
    <form class="billing-res-edit-form hidden" data-res-edit-form="${p.id}" data-res-orig-kind="room" hidden>
      <p class="billing-res-edit-form__intro">Update stay dates and notes here. For <strong>extra mattress, laundry, corkage</strong>, and other add-ons, use <strong>Additional fees</strong> below — room stays are not converted to venue bookings.</p>
      <div class="billing-res-edit-form__grid">
        <label class="billing-res-edit-field">
          <span>Check-in</span>
          <input type="date" class="billing-edit-form__input" name="check_in" value="${escapeHtml(sliceDate(p.check_in))}" />
        </label>
        <label class="billing-res-edit-field">
          <span>Check-out</span>
          <input type="date" class="billing-edit-form__input" name="check_out" value="${escapeHtml(sliceDate(p.check_out))}" />
        </label>
        <label class="billing-res-edit-field">
          <span>Guests in room</span>
          <input type="number" min="1" class="billing-edit-form__input" name="guest_count" value="${p.guest_count || 1}" />
        </label>
        <label class="billing-res-edit-field">
          <span>Contact phone</span>
          <input type="tel" class="billing-edit-form__input" name="contact_phone" value="${escapeHtml(p.contact_phone || '')}" />
        </label>
        <label class="billing-res-edit-field billing-res-edit-field--wide">
          <span>Allergen notes</span>
          <input type="text" class="billing-edit-form__input" name="meal_allergen_notes" value="${escapeHtml(p.meal_allergen_notes || '')}" />
        </label>
        <label class="billing-res-edit-field billing-res-edit-field--wide">
          <span>Booking notes</span>
          <textarea class="billing-edit-form__input billing-res-edit-textarea" name="notes" rows="3" placeholder="General notes for staff">${escapeHtml(guestNotes)}</textarea>
        </label>
        <label class="billing-res-edit-field billing-res-edit-field--wide">
          <span>Admin change note</span>
          <textarea class="billing-edit-form__input billing-res-edit-textarea" name="modification_message" rows="2" placeholder="Optional — logged as “Modified by admin”"></textarea>
        </label>
      </div>
      <div class="billing-res-edit-form__actions">
        <button type="button" class="invoice-btn-secondary" data-res-edit-cancel>Cancel</button>
        <button type="submit" class="invoice-btn-confirm">
          <span class="material-symbols-outlined" aria-hidden="true">save</span>
          Save stay details
        </button>
      </div>
    </form>`;
}

function renderVenueReservationEditForm(p, catalogs = {}) {
  const parsedNotes = parseBookingNotes(p.notes);
  const guestNotes = parsedNotes.guestNotes || '';
  const { venues = [] } = catalogs;
  const venuePrefillDate = sliceDate(p.event_date);
  const roomPrefillIn = venuePrefillDate;
  const roomPrefillOut = roomPrefillIn ? addDays(roomPrefillIn, 1) : '';
  const venueCode = p.facility_room_code || '';
  const defaultStayTotal = Number(p.booking_total || p.subtotal || 0) || '';
  const conferenceVenue = isConferenceStyleVenue(p);
  const convertAllowed = canConvertVenueToStay(p);
  const conversionIntro = convertAllowed
    ? (conferenceVenue
      ? `This <strong>conference room</strong> (${escapeHtml(venueSpaceLabel(p))}) is booked for a timed event. Check <strong>Use as overnight stay</strong>, set dates, and enter the <strong>stay total</strong> manually — no housing room lookup required.`
      : `This coded venue room (${escapeHtml(venueSpaceLabel(p))}) can convert to an overnight stay. Set dates and enter the <strong>stay total</strong> below.`)
    : `Update event date, times, and venue. Overnight conversion is only for coded conference/classroom venue rooms — not recreation courts, chapels, or outdoor spaces.`;

  const convertToggle = convertAllowed ? `
      <label class="billing-res-convert-toggle">
        <input type="checkbox" name="convert_to_stay" data-res-convert-stay />
        <span class="billing-res-convert-toggle__label">
          <strong>Use as overnight stay</strong>
          <small>Billing only — records ${escapeHtml(venueSpaceLabel(p))} as an overnight stay without creating a housing room or cancelling the venue booking.</small>
        </span>
      </label>` : '';

  return `
    <form class="billing-res-edit-form hidden" data-res-edit-form="${p.id}" data-res-orig-kind="venue" hidden>
      <p class="billing-res-edit-form__intro">${conversionIntro}</p>
      <div class="billing-res-convert-notice hidden" data-res-convert-notice hidden role="status"></div>
      <div class="billing-res-current-space">
        <span class="billing-res-current-space__eyebrow">Currently booked as</span>
        <strong class="billing-res-current-space__title">${escapeHtml(venueSpaceLabel(p))}</strong>
        <p class="billing-res-current-space__meta">${escapeHtml(formatVenueWhen(p))} · ${p.guest_count || 1} guest${Number(p.guest_count) === 1 ? '' : 's'}</p>
      </div>
      ${convertToggle}
      <input type="hidden" name="invoice_kind" value="venue" data-res-kind-input />
      <div class="billing-res-edit-form__grid">
        <fieldset class="billing-res-edit-kind-panel hidden" data-res-kind-panel="room" hidden>
          <legend class="billing-section-title billing-section-title--sub billing-res-edit-legend">Overnight stay</legend>
          <div class="billing-res-edit-form__grid billing-res-edit-form__grid--inner">
            <label class="billing-res-edit-field">
              <span>Check-in</span>
              <input type="date" class="billing-edit-form__input" name="check_in" value="${escapeHtml(roomPrefillIn)}" data-res-field="check_in" />
            </label>
            <label class="billing-res-edit-field">
              <span>Check-out</span>
              <input type="date" class="billing-edit-form__input" name="check_out" value="${escapeHtml(roomPrefillOut)}" data-res-field="check_out" />
            </label>
            <label class="billing-res-edit-field">
              <span>Stay total (₱)</span>
              <input type="number" min="1" step="1" class="billing-edit-form__input" name="stay_total" value="${defaultStayTotal}" data-res-field="stay_total" placeholder="Lodging charge for this stay" />
            </label>
            ${venueCode ? `<p class="billing-res-edit-hint billing-res-edit-hint--inline">Space: <strong>${escapeHtml(venueSpaceLabel(p))}</strong>. Enter the overnight rate manually — extras like mattress go in Additional fees after conversion.</p>` : ''}
          </div>
        </fieldset>

        <fieldset class="billing-res-edit-kind-panel" data-res-kind-panel="venue">
          <legend class="billing-section-title billing-section-title--sub billing-res-edit-legend">Event / venue booking</legend>
          <div class="billing-res-edit-form__grid billing-res-edit-form__grid--inner">
            <label class="billing-res-edit-field">
              <span>Event date</span>
              <input type="date" class="billing-edit-form__input" name="event_date" value="${escapeHtml(venuePrefillDate)}" data-res-field="event_date" />
            </label>
            <label class="billing-res-edit-field">
              <span>Start time</span>
              <input type="time" class="billing-edit-form__input" name="start_time" value="${escapeHtml(sliceTime(p.start_time) || '09:00')}" data-res-field="start_time" />
            </label>
            <label class="billing-res-edit-field">
              <span>End time</span>
              <input type="time" class="billing-edit-form__input" name="end_time" value="${escapeHtml(sliceTime(p.end_time) || '17:00')}" data-res-field="end_time" />
            </label>
            <label class="billing-res-edit-field billing-res-edit-field--wide">
              <span>Venue space</span>
              <select class="billing-edit-form__input" name="facility_id">
                <option value="">Select venue…</option>
                ${renderVenueSelectOptions(venues, p.facility_id)}
              </select>
            </label>
          </div>
        </fieldset>

        <label class="billing-res-edit-field">
          <span>Guest count</span>
          <input type="number" min="1" class="billing-edit-form__input" name="guest_count" value="${p.guest_count || 1}" />
        </label>

        <label class="billing-res-edit-field billing-res-edit-field--wide">
          <span>Booking notes</span>
          <textarea class="billing-edit-form__input billing-res-edit-textarea" name="notes" rows="3" placeholder="General notes for staff">${escapeHtml(guestNotes)}</textarea>
        </label>

        <label class="billing-res-edit-field billing-res-edit-field--wide">
          <span>Admin change note <span class="billing-res-edit-required hidden" data-res-mod-required hidden>(required for conversion)</span></span>
          <textarea class="billing-edit-form__input billing-res-edit-textarea" name="modification_message" rows="2" placeholder="Required when converting — e.g. A-506 conference room now used as overnight stay"></textarea>
        </label>
      </div>

      <div class="billing-res-edit-form__actions">
        <button type="button" class="invoice-btn-secondary" data-res-edit-cancel>Cancel</button>
        <button type="submit" class="invoice-btn-confirm">
          <span class="material-symbols-outlined" aria-hidden="true">save</span>
          Save reservation
        </button>
      </div>
    </form>`;
}

function renderVenueOvernightEditForm(p) {
  const parsedNotes = parseBookingNotes(p.notes);
  const guestNotes = parsedNotes.guestNotes || '';
  const defaultStayTotal = Math.round(Number(p.subtotal ?? p.booking_total ?? 0) * 100) / 100 || '';
  return `
    <form class="billing-res-edit-form hidden" data-res-edit-form="${p.id}" data-res-orig-kind="venue_overnight" hidden>
      <p class="billing-res-edit-form__intro">Update overnight stay dates and the billing total for <strong>${escapeHtml(venueSpaceLabel(p))}</strong>. This updates billing only — no housing room is created.</p>
      <div class="billing-res-edit-form__grid">
        <label class="billing-res-edit-field">
          <span>Check-in</span>
          <input type="date" class="billing-edit-form__input" name="check_in" value="${escapeHtml(sliceDate(p.check_in))}" />
        </label>
        <label class="billing-res-edit-field">
          <span>Check-out</span>
          <input type="date" class="billing-edit-form__input" name="check_out" value="${escapeHtml(sliceDate(p.check_out))}" />
        </label>
        <label class="billing-res-edit-field">
          <span>Stay total (₱)</span>
          <input type="number" min="1" step="1" class="billing-edit-form__input" name="stay_total" value="${defaultStayTotal}" placeholder="Lodging charge" />
        </label>
        <label class="billing-res-edit-field">
          <span>Guests</span>
          <input type="number" min="1" class="billing-edit-form__input" name="guest_count" value="${p.guest_count || 1}" />
        </label>
        <label class="billing-res-edit-field billing-res-edit-field--wide">
          <span>Booking notes</span>
          <textarea class="billing-edit-form__input billing-res-edit-textarea" name="notes" rows="3" placeholder="General notes for staff">${escapeHtml(guestNotes)}</textarea>
        </label>
        <label class="billing-res-edit-field billing-res-edit-field--wide">
          <span>Admin change note</span>
          <textarea class="billing-edit-form__input billing-res-edit-textarea" name="modification_message" rows="2" placeholder="Optional — logged as “Modified by admin”"></textarea>
        </label>
      </div>
      <div class="billing-res-edit-form__actions">
        <button type="button" class="invoice-btn-secondary" data-res-edit-cancel>Cancel</button>
        <button type="submit" class="invoice-btn-confirm">
          <span class="material-symbols-outlined" aria-hidden="true">save</span>
          Save stay details
        </button>
      </div>
    </form>`;
}

function renderReservationEditForm(p, catalogs = {}) {
  if (isVenueConvertedToStay(p)) return renderVenueOvernightEditForm(p);
  return isVenueInvoice(p) ? renderVenueReservationEditForm(p, catalogs) : renderRoomStayEditForm(p);
}

function renderVenueOvernightRevertForm(p) {
  const parsedNotes = parseBookingNotes(p.notes);
  const guestNotes = parsedNotes.guestNotes || '';
  const defaultEventDate = sliceDate(p.check_in) || sliceDate(p.event_date) || '';
  const defaultTotal = Math.round(Number(p.subtotal ?? p.booking_total ?? 0) * 100) / 100 || '';
  return `
    <form class="billing-res-edit-form billing-res-revert-form hidden" data-res-revert-form="${p.id}" hidden>
      <p class="billing-res-edit-form__intro billing-res-revert-form__intro">
        <strong>Revert to venue event booking</strong> — use this if the overnight conversion was a mistake.
        The invoice goes back to a timed venue reservation; overnight billing tags are removed.
      </p>
      <div class="billing-res-edit-form__grid">
        <label class="billing-res-edit-field">
          <span>Event date</span>
          <input type="date" class="billing-edit-form__input" name="event_date" value="${escapeHtml(defaultEventDate)}" required />
        </label>
        <label class="billing-res-edit-field">
          <span>Start time</span>
          <input type="time" class="billing-edit-form__input" name="start_time" value="${escapeHtml(sliceTime(p.start_time) || '09:00')}" required />
        </label>
        <label class="billing-res-edit-field">
          <span>End time</span>
          <input type="time" class="billing-edit-form__input" name="end_time" value="${escapeHtml(sliceTime(p.end_time) || '17:00')}" required />
        </label>
        <label class="billing-res-edit-field">
          <span>Event total (₱)</span>
          <input type="number" min="1" step="1" class="billing-edit-form__input" name="event_total" value="${defaultTotal}" placeholder="Leave as venue rate or enter manually" />
        </label>
        <label class="billing-res-edit-field">
          <span>Guests</span>
          <input type="number" min="1" class="billing-edit-form__input" name="guest_count" value="${p.guest_count || 1}" />
        </label>
        <label class="billing-res-edit-field billing-res-edit-field--wide">
          <span>Booking notes</span>
          <textarea class="billing-edit-form__input billing-res-edit-textarea" name="notes" rows="3" placeholder="General notes for staff">${escapeHtml(guestNotes)}</textarea>
        </label>
        <label class="billing-res-edit-field billing-res-edit-field--wide">
          <span>Admin change note <span class="billing-res-edit-required">(required)</span></span>
          <textarea class="billing-edit-form__input billing-res-edit-textarea" name="modification_message" rows="2" required placeholder="e.g. Miscommunication — restore as conference room event booking"></textarea>
        </label>
      </div>
      <div class="billing-res-edit-form__actions">
        <button type="button" class="invoice-btn-secondary" data-res-revert-cancel>Cancel</button>
        <button type="submit" class="invoice-btn-confirm billing-res-revert-form__submit">
          <span class="material-symbols-outlined" aria-hidden="true">undo</span>
          Revert to venue booking
        </button>
      </div>
    </form>`;
}

function renderReservationConfirmDialog() {
  return `
    <div class="billing-res-confirm hidden" data-res-confirm hidden aria-hidden="true">
      <div class="billing-res-confirm__card" role="dialog" aria-modal="true" aria-labelledby="billing-res-confirm-title">
        <h3 id="billing-res-confirm-title" data-billing-res-confirm-title class="billing-res-confirm__title">Confirm reservation changes</h3>
        <p class="billing-res-confirm__lead">These updates apply to the linked booking and may recalculate the invoice subtotal in billing.</p>
        <ul class="billing-res-confirm__list" data-res-confirm-list></ul>
        <label class="billing-res-confirm__check">
          <input type="checkbox" data-res-confirm-check />
          <span>I understand these changes update the reservation and billing totals.</span>
        </label>
        <div class="billing-res-confirm__actions">
          <button type="button" class="invoice-btn-secondary" data-res-confirm-cancel>Go back</button>
          <button type="button" class="invoice-btn-confirm" data-res-confirm-apply disabled>Apply changes</button>
        </div>
      </div>
    </div>`;
}

function readReservationEditForm(form) {
  const origKind = form.getAttribute('data-res-orig-kind') || 'room';
  if (origKind === 'venue_overnight') {
    return {
      invoice_kind: 'room',
      guest_count: Number(form.querySelector('[name="guest_count"]')?.value || 1),
      notes: form.querySelector('[name="notes"]')?.value?.trim() || undefined,
      modification_message: form.querySelector('[name="modification_message"]')?.value?.trim() || undefined,
      check_in: form.querySelector('[name="check_in"]')?.value,
      check_out: form.querySelector('[name="check_out"]')?.value,
      stay_total: Math.round(Number(form.querySelector('[name="stay_total"]')?.value || 0) * 100) / 100,
    };
  }

  const convertStay = Boolean(form.querySelector('[data-res-convert-stay]')?.checked);
  const kind = origKind === 'venue' && convertStay ? 'room' : origKind;
  const kindInput = form.querySelector('[data-res-kind-input]');
  if (kindInput) kindInput.value = kind;

  const guestCount = Number(form.querySelector('[name="guest_count"]')?.value || 1);
  const base = {
    invoice_kind: kind,
    guest_count: guestCount,
    notes: form.querySelector('[name="notes"]')?.value?.trim() || undefined,
    modification_message: form.querySelector('[name="modification_message"]')?.value?.trim() || undefined,
  };
  if (kind === 'venue') {
    return {
      ...base,
      facility_id: Number(form.querySelector('[name="facility_id"]')?.value),
      event_date: sliceDate(form.querySelector('[name="event_date"]')?.value),
      start_time: sliceTime(form.querySelector('[name="start_time"]')?.value),
      end_time: sliceTime(form.querySelector('[name="end_time"]')?.value),
    };
  }
  return {
    ...base,
    check_in: form.querySelector('[name="check_in"]')?.value,
    check_out: form.querySelector('[name="check_out"]')?.value,
    contact_phone: form.querySelector('[name="contact_phone"]')?.value?.trim() || undefined,
    meal_allergen_notes: form.querySelector('[name="meal_allergen_notes"]')?.value?.trim() || undefined,
    ...(form.querySelector('[name="stay_total"]')
      ? { stay_total: Math.round(Number(form.querySelector('[name="stay_total"]')?.value || 0) * 100) / 100 }
      : {}),
  };
}

function normalizeConfirmSummaryLines(summaryLines) {
  const lines = (Array.isArray(summaryLines) ? summaryLines : [])
    .map((line) => ({
      level: ['critical', 'warn', 'info'].includes(line?.level) ? line.level : 'info',
      text: String(line?.text || '').trim(),
    }))
    .filter((line) => line.text.length > 0);
  if (!lines.length) {
    lines.push({ level: 'info', text: 'Save reservation details as entered.' });
  }
  return lines;
}

function reservationEditHasChanges(p, draft) {
  const origKind = reservationKind(p);
  if (draft.invoice_kind !== origKind) return true;
  if (isVenueConvertedToStay(p) || (origKind === 'venue' && draft.invoice_kind === 'room')) {
    return draft.check_in !== sliceDate(p.check_in)
      || draft.check_out !== sliceDate(p.check_out)
      || Number(draft.stay_total || 0) !== Number(p.subtotal ?? p.booking_total ?? 0);
  }
  if (draft.invoice_kind === 'room') {
    return draft.check_in !== sliceDate(p.check_in)
      || draft.check_out !== sliceDate(p.check_out)
      || Number(draft.guest_count) !== Number(p.guest_count || 1)
      || (draft.stay_total != null && Number(draft.stay_total) !== Number(p.subtotal ?? p.booking_total ?? 0))
      || (draft.contact_phone || '') !== String(p.contact_phone || '')
      || (draft.meal_allergen_notes || '') !== String(p.meal_allergen_notes || '');
  }
  if (draft.invoice_kind === 'venue') {
    return String(draft.facility_id) !== String(p.facility_id)
      || sliceDate(draft.event_date) !== sliceDate(p.event_date)
      || sliceTime(draft.start_time) !== sliceTime(p.start_time)
      || sliceTime(draft.end_time) !== sliceTime(p.end_time)
      || Number(draft.guest_count) !== Number(p.guest_count || 1);
  }
  return (draft.notes || '') !== (parseBookingNotes(p.notes).guestNotes || '')
    || Boolean(draft.modification_message);
}

function buildReservationChangeSummary(p, draft) {
  const lines = [];
  const origKind = reservationKind(p);
  if (draft.invoice_kind !== origKind && origKind === 'venue' && draft.invoice_kind === 'room' && canConvertVenueToStay(p)) {
    lines.push({
      level: 'critical',
      text: `Convert ${venueSpaceLabel(p)} to overnight billing at ${fmt(draft.stay_total || p.booking_total || 0)}. The venue booking stays on file — only billing totals and stay dates update.`,
    });
  }
  if (isVenueConvertedToStay(p) && draft.invoice_kind === 'room') {
    if (draft.check_in !== sliceDate(p.check_in) || draft.check_out !== sliceDate(p.check_out)) {
      lines.push({
        level: 'warn',
        text: `Stay dates: ${formatDateLongSingle(sliceDate(p.check_in))} – ${formatDateLongSingle(sliceDate(p.check_out))} → ${formatDateLongSingle(draft.check_in)} – ${formatDateLongSingle(draft.check_out)}.`,
      });
    }
    const currentTotal = Number(p.subtotal ?? p.booking_total ?? 0);
    if (draft.stay_total && Number(draft.stay_total) !== currentTotal) {
      lines.push({ level: 'warn', text: `Stay total: ${fmt(currentTotal)} → ${fmt(draft.stay_total)} — invoice subtotal will update.` });
    }
  } else if (draft.invoice_kind === 'room') {
    if (draft.check_in !== sliceDate(p.check_in) || draft.check_out !== sliceDate(p.check_out)) {
      lines.push({
        level: 'warn',
        text: `Stay dates: ${formatDateLongSingle(sliceDate(p.check_in))} – ${formatDateLongSingle(sliceDate(p.check_out))} → ${formatDateLongSingle(draft.check_in)} – ${formatDateLongSingle(draft.check_out)}.`,
      });
    }
    if (draft.stay_total != null && Number(draft.stay_total) !== Number(p.subtotal ?? p.booking_total ?? 0)) {
      lines.push({
        level: 'warn',
        text: `Stay total: ${fmt(p.subtotal ?? p.booking_total ?? 0)} → ${fmt(draft.stay_total)} — invoice subtotal will update.`,
      });
    }
    if (Number(draft.guest_count) !== Number(p.guest_count || 1)) {
      lines.push({ level: 'info', text: `Guest count: ${p.guest_count || 1} → ${draft.guest_count}.` });
    }
    if ((draft.contact_phone || '') !== String(p.contact_phone || '')) {
      lines.push({ level: 'info', text: 'Contact phone updates.' });
    }
    if ((draft.meal_allergen_notes || '') !== String(p.meal_allergen_notes || '')) {
      lines.push({ level: 'info', text: 'Allergen notes update.' });
    }
  }
  if (draft.invoice_kind === 'venue') {
    if (String(draft.facility_id) !== String(p.facility_id)) {
      lines.push({ level: 'warn', text: `Venue space changes from ${venueLabel(p)}.` });
    }
    if (sliceDate(draft.event_date) !== sliceDate(p.event_date)) {
      lines.push({
        level: 'warn',
        text: `Event date: ${formatDateLongSingle(sliceDate(p.event_date))} → ${formatDateLongSingle(draft.event_date)}.`,
      });
    }
    if (sliceTime(draft.start_time) !== sliceTime(p.start_time) || sliceTime(draft.end_time) !== sliceTime(p.end_time)) {
      lines.push({
        level: 'warn',
        text: `Event time: ${formatTime12(p.start_time)} – ${formatTime12(p.end_time)} → ${formatTime12(draft.start_time)} – ${formatTime12(draft.end_time)}.`,
      });
    }
    if (Number(draft.guest_count) !== Number(p.guest_count || 1)) {
      lines.push({ level: 'info', text: `Guest count: ${p.guest_count || 1} → ${draft.guest_count}.` });
    }
  }
  if ((draft.notes || '') !== (parseBookingNotes(p.notes).guestNotes || '')) {
    lines.push({ level: 'info', text: 'Booking notes update.' });
  }
  if (draft.modification_message) {
    lines.push({ level: 'info', text: 'Admin change note will be logged for fast tracking.' });
  }
  return normalizeConfirmSummaryLines(lines);
}

function syncReservationKindPanels(form, p) {
  const origKind = form.getAttribute('data-res-orig-kind') || reservationKind(p);
  if (origKind !== 'venue') return;

  const convertStay = Boolean(form.querySelector('[data-res-convert-stay]')?.checked);
  const kind = convertStay ? 'room' : 'venue';
  const converting = convertStay;

  const kindInput = form.querySelector('[data-res-kind-input]');
  if (kindInput) kindInput.value = kind;

  form.querySelectorAll('[data-res-kind-panel]').forEach((panel) => {
    const show = panel.getAttribute('data-res-kind-panel') === kind;
    panel.classList.toggle('hidden', !show);
    panel.hidden = !show;
  });

  const notice = form.querySelector('[data-res-convert-notice]');
  const modRequired = form.querySelector('[data-res-mod-required]');
  if (notice) {
    if (converting) {
      notice.innerHTML = `
        <span class="material-symbols-outlined" aria-hidden="true">night_shelter</span>
        <div>
          <strong>${escapeHtml(venueSpaceLabel(p))} → overnight stay</strong>
          <p>Set check-in / check-out and enter the <strong>stay total</strong> manually. Billing updates only — ${escapeHtml(venueSpaceLabel(p))} stays as the booked space.</p>
        </div>`;
      notice.classList.remove('hidden');
      notice.hidden = false;
    } else {
      notice.classList.add('hidden');
      notice.hidden = true;
      notice.innerHTML = '';
    }
  }
  modRequired?.classList.toggle('hidden', !converting);
  if (modRequired) modRequired.hidden = !converting;

  if (converting && kind === 'room') {
    const eventDate = form.querySelector('[name="event_date"]')?.value;
    const checkIn = form.querySelector('[name="check_in"]');
    const checkOut = form.querySelector('[name="check_out"]');
    if (checkIn && !checkIn.value && eventDate) checkIn.value = eventDate;
    if (checkOut && !checkOut.value && (checkIn?.value || eventDate)) {
      checkOut.value = addDays(checkIn?.value || eventDate, 1);
    }
    const stayTotal = form.querySelector('[name="stay_total"]');
    if (stayTotal && !stayTotal.value && Number(p.booking_total) > 0) {
      stayTotal.value = String(Number(p.booking_total));
    }
  }
}

function setReservationEditMode(detailEl, editing) {
  const view = detailEl?.querySelector('[data-res-view]');
  const form = detailEl?.querySelector('[data-res-edit-form]');
  const revertForm = detailEl?.querySelector('[data-res-revert-form]');
  const openBtn = detailEl?.querySelector('[data-res-edit-open]');
  const revertBtn = detailEl?.querySelector('[data-res-revert-open]');
  if (!view || !form) return;
  view.classList.toggle('hidden', editing);
  view.hidden = editing;
  form.classList.toggle('hidden', !editing);
  form.hidden = !editing;
  if (openBtn) openBtn.hidden = editing;
  if (revertBtn) revertBtn.hidden = editing;
  if (revertForm && editing) {
    revertForm.classList.add('hidden');
    revertForm.hidden = true;
  }
}

function setReservationRevertMode(detailEl, reverting) {
  const view = detailEl?.querySelector('[data-res-view]');
  const revertForm = detailEl?.querySelector('[data-res-revert-form]');
  const editForm = detailEl?.querySelector('[data-res-edit-form]');
  const editBtn = detailEl?.querySelector('[data-res-edit-open]');
  const revertBtn = detailEl?.querySelector('[data-res-revert-open]');
  if (!view || !revertForm) return;
  view.classList.toggle('hidden', reverting);
  view.hidden = reverting;
  revertForm.classList.toggle('hidden', !reverting);
  revertForm.hidden = !reverting;
  if (editForm && reverting) {
    editForm.classList.add('hidden');
    editForm.hidden = true;
  }
  if (editBtn) editBtn.hidden = reverting;
  if (revertBtn) revertBtn.hidden = reverting;
}

function resolveBillingDetailRoot(detailEl) {
  const liveRoot = document.getElementById('invoice-detail');
  const scoped = detailEl?.querySelector?.('.billing-detail')
    || liveRoot?.querySelector('.billing-detail');
  return scoped || detailEl || liveRoot;
}

function showReservationConfirmDialog(detailEl, summaryLines, { converting = false, reverting = false } = {}) {
  const scope = resolveBillingDetailRoot(detailEl);
  const overlay = scope?.querySelector('[data-res-confirm]');
  const titleEl = overlay?.querySelector('[data-billing-res-confirm-title]');
  const listEl = overlay?.querySelector('[data-res-confirm-list]');
  const check = overlay?.querySelector('[data-res-confirm-check]');
  const applyBtn = overlay?.querySelector('[data-res-confirm-apply]');
  const cancelBtn = overlay?.querySelector('[data-res-confirm-cancel]');
  if (!overlay || !listEl || !check || !applyBtn || !cancelBtn) return Promise.resolve(false);

  const lines = normalizeConfirmSummaryLines(summaryLines);

  if (titleEl) {
    titleEl.textContent = reverting
      ? 'Confirm revert to venue booking'
      : (converting ? 'Confirm overnight stay conversion' : 'Confirm reservation changes');
  }
  applyBtn.textContent = reverting
    ? 'Revert to venue booking'
    : (converting ? 'Convert to overnight stay' : 'Apply changes');

  listEl.replaceChildren(...lines.map(({ level, text }) => {
    const item = document.createElement('li');
    item.className = `billing-res-confirm__item billing-res-confirm__item--${level}`;
    item.textContent = text;
    return item;
  }));
  check.checked = false;
  applyBtn.disabled = true;
  overlay.classList.remove('hidden');
  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');

  return new Promise((resolve) => {
    const cleanup = () => {
      overlay.classList.add('hidden');
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
      check.removeEventListener('change', onCheck);
      applyBtn.removeEventListener('click', onApply);
      cancelBtn.removeEventListener('click', onCancel);
    };
    const onCheck = () => { applyBtn.disabled = !check.checked; };
    const onApply = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };
    check.addEventListener('change', onCheck);
    applyBtn.addEventListener('click', onApply);
    cancelBtn.addEventListener('click', onCancel);
  });
}

async function saveReservationEdit(p, draft) {
  const origKind = reservationKind(p);
  const noteText = draft.notes || '';

  if (isVenueConvertedToStay(p) || (origKind === 'venue' && draft.invoice_kind === 'room')) {
    await convertPaymentReservation(p.id, {
      invoice_kind: 'room',
      guest_count: draft.guest_count,
      notes: noteText || undefined,
      modification_message: draft.modification_message,
      check_in: draft.check_in,
      check_out: draft.check_out,
      stay_total: draft.stay_total,
    });
    return;
  }

  const modLine = draft.modification_message
    ? `[Modified by admin] ${draft.modification_message}`
    : '';
  const combinedNotes = [noteText, modLine].filter(Boolean).join('\n') || undefined;

  if (draft.invoice_kind !== origKind) {
    const convertPayload = {
      invoice_kind: draft.invoice_kind,
      guest_count: draft.guest_count,
      notes: noteText || undefined,
      modification_message: draft.modification_message,
    };
    if (draft.invoice_kind === 'room') {
      Object.assign(convertPayload, {
        check_in: draft.check_in,
        check_out: draft.check_out,
        stay_total: draft.stay_total,
      });
    } else {
      Object.assign(convertPayload, {
        facility_id: draft.facility_id,
        event_date: draft.event_date,
        start_time: draft.start_time,
        end_time: draft.end_time,
      });
    }
    await convertPaymentReservation(p.id, convertPayload);
    return;
  }

  if (origKind === 'venue' && !isVenueConvertedToStay(p)) {
    await updateFacilityBooking(p.facility_booking_id, {
      facility_id: draft.facility_id,
      event_date: draft.event_date,
      start_time: draft.start_time,
      end_time: draft.end_time,
      guest_count: draft.guest_count,
      notes: noteText || undefined,
      modification_message: draft.modification_message,
      notify_guest: false,
    });
    return;
  }

  const isVenueStay = String(p.occupancy_item || '') === 'Venue stay'
    || /\[Venue stay:/i.test(String(p.notes || ''));
  const stayPayload = {
    check_in: draft.check_in,
    check_out: draft.check_out,
    guest_count: draft.guest_count,
    room_id: p.room_id,
    contact_phone: draft.contact_phone,
    meal_allergen_notes: draft.meal_allergen_notes,
    notes: combinedNotes,
    modification_message: draft.modification_message,
    notify_guest: Boolean(draft.modification_message),
    notify_modification: Boolean(draft.modification_message),
  };
  if (isVenueStay) {
    stayPayload.total_amount = Number(p.subtotal ?? p.booking_total ?? draft.stay_total ?? 0) || undefined;
  }
  await updateBooking(p.booking_id, stayPayload);
}

function readReservationRevertForm(form) {
  return {
    event_date: form.querySelector('[name="event_date"]')?.value,
    start_time: form.querySelector('[name="start_time"]')?.value,
    end_time: form.querySelector('[name="end_time"]')?.value,
    event_total: Math.round(Number(form.querySelector('[name="event_total"]')?.value || 0) * 100) / 100,
    guest_count: Number(form.querySelector('[name="guest_count"]')?.value || 1),
    notes: form.querySelector('[name="notes"]')?.value?.trim() || undefined,
    modification_message: form.querySelector('[name="modification_message"]')?.value?.trim() || undefined,
  };
}

async function saveReservationRevert(p, draft) {
  await revertPaymentOvernight(p.id, {
    event_date: draft.event_date,
    start_time: draft.start_time,
    end_time: draft.end_time,
    event_total: draft.event_total > 0 ? draft.event_total : undefined,
    guest_count: draft.guest_count,
    notes: draft.notes,
    modification_message: draft.modification_message,
  });
}

function bindReservationEdit(p, detailEl) {
  const root = detailEl?.querySelector('[data-reservation-root]');
  const form = detailEl?.querySelector('[data-res-edit-form]');
  const revertForm = detailEl?.querySelector('[data-res-revert-form]');
  if (!root || (!form && !revertForm) || root.dataset.resBound === '1') return;
  root.dataset.resBound = '1';

  if (form) {
  form.querySelector('[data-res-convert-stay]')?.addEventListener('change', () => {
    syncReservationKindPanels(form, p);
  });

  root.querySelector('[data-res-edit-open]')?.addEventListener('click', async () => {
    const detailFeedback = document.getElementById('billing-detail-feedback');
    const billingForm = getBillingForm(detailEl);
    if (hasUnsavedBillingChanges(p, billingForm)) {
      showFeedback(detailFeedback, 'Save invoice changes before editing the reservation.', 'error');
      return;
    }
    if (hasUnsavedFeeChanges(detailEl, p.id)) {
      showFeedback(detailFeedback, 'Save additional fees before editing the reservation.', 'error');
      return;
    }

    root.querySelector('[data-res-catalog-loading]')?.classList.remove('hidden');
    try {
      if (isVenueInvoice(p)) {
        const catalogs = await loadReservationCatalogs();
        if (String(state.selectedId) !== String(p.id)) return;
        const venueSelect = form.querySelector('[name="facility_id"]');
        if (venueSelect && venueSelect.options.length <= 1) {
          venueSelect.innerHTML = `<option value="">Select venue…</option>${renderVenueSelectOptions(catalogs.venues, p.facility_id)}`;
        }
      }
    } catch {
      showFeedback(detailFeedback, 'Could not load venue list. You can still edit notes.', 'error');
    } finally {
      root.querySelector('[data-res-catalog-loading]')?.classList.add('hidden');
    }

    hideFeedback(detailFeedback);
    setReservationEditMode(detailEl, true);
    syncReservationKindPanels(form, p);
    form.querySelector('[name="modification_message"]')?.focus();
  });

  form.querySelector('[data-res-edit-cancel]')?.addEventListener('click', () => {
    setReservationEditMode(detailEl, false);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const detailFeedback = document.getElementById('billing-detail-feedback');
    const draft = readReservationEditForm(form);
    const formOrigKind = form.getAttribute('data-res-orig-kind') || 'room';
    const converting = formOrigKind === 'venue' && draft.invoice_kind === 'room' && canConvertVenueToStay(p);
    const updatingOvernightBilling = formOrigKind === 'venue_overnight';
    const needsStayTotal = updatingOvernightBilling || converting || isVenueConvertedToStay(p);

    if (converting && !canConvertVenueToStay(p)) {
      showFeedback(detailFeedback, 'This venue cannot convert to an overnight stay. Only coded conference/classroom venue rooms support conversion — not recreation or outdoor spaces.', 'error');
      return;
    }

    if (converting && !draft.modification_message) {
      showFeedback(detailFeedback, 'Add an admin change note explaining this conversion (e.g. conference room → overnight stay).', 'error');
      form.querySelector('[name="modification_message"]')?.focus();
      return;
    }

    if (draft.invoice_kind === 'room' || updatingOvernightBilling) {
      if (!draft.check_in || !draft.check_out) {
        showFeedback(detailFeedback, 'Check-in and check-out are required.', 'error');
        return;
      }
      if (needsStayTotal && (!Number.isFinite(draft.stay_total) || draft.stay_total <= 0)) {
        showFeedback(detailFeedback, 'Enter a stay total for the overnight stay.', 'error');
        form.querySelector('[name="stay_total"]')?.focus();
        return;
      }
    } else if (!draft.facility_id || !draft.event_date || !draft.start_time || !draft.end_time) {
      showFeedback(detailFeedback, 'Venue, date, and times are required.', 'error');
      return;
    }

    const summary = buildReservationChangeSummary(p, draft);
    const needsConfirm = converting
      || reservationEditHasChanges(p, draft)
      || summary.some((line) => line.level === 'critical' || line.level === 'warn');
    if (needsConfirm) {
      const ok = await showReservationConfirmDialog(
        document.getElementById('invoice-detail') || detailEl,
        summary,
        { converting },
      );
      if (!ok) return;
    }

    const submitBtn = form.querySelector('[type="submit"]');
    submitBtn.disabled = true;
    const label = submitBtn.innerHTML;
    submitBtn.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">hourglass_top</span> Saving…';
    try {
      await saveReservationEdit(p, draft);
      await reload({ keepSelection: true, keepModalOpen: true });
      showFeedback(
        detailFeedback,
        converting ? 'Converted to overnight billing. Invoice subtotal updated.'
          : updatingOvernightBilling ? 'Overnight billing updated.'
            : 'Reservation updated. Invoice totals refreshed.',
        'ok',
      );
      window.dispatchEvent(new CustomEvent('booking:updated'));
    } catch (err) {
      showFeedback(detailFeedback, getBillingErrorMessage(err), 'error');
      submitBtn.disabled = false;
      submitBtn.innerHTML = label;
    }
  });
  }

  root.querySelector('[data-res-revert-open]')?.addEventListener('click', () => {
    const detailFeedback = document.getElementById('billing-detail-feedback');
    const billingForm = getBillingForm(detailEl);
    if (hasUnsavedBillingChanges(p, billingForm)) {
      showFeedback(detailFeedback, 'Save invoice changes before reverting the reservation.', 'error');
      return;
    }
    hideFeedback(detailFeedback);
    setReservationRevertMode(detailEl, true);
    revertForm?.querySelector('[name="modification_message"]')?.focus();
  });

  revertForm?.querySelector('[data-res-revert-cancel]')?.addEventListener('click', () => {
    setReservationRevertMode(detailEl, false);
  });

  revertForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const detailFeedback = document.getElementById('billing-detail-feedback');
    const draft = readReservationRevertForm(revertForm);

    if (!draft.event_date || !draft.start_time || !draft.end_time) {
      showFeedback(detailFeedback, 'Event date and times are required.', 'error');
      return;
    }
    if (!draft.modification_message) {
      showFeedback(detailFeedback, 'Add an admin note explaining why this revert is needed.', 'error');
      revertForm.querySelector('[name="modification_message"]')?.focus();
      return;
    }

    const summary = [{
      level: 'critical',
      text: `Revert ${venueSpaceLabel(p)} from overnight billing back to a venue event on ${draft.event_date} (${formatTime12(draft.start_time)}–${formatTime12(draft.end_time)}). Invoice subtotal will update.`,
    }];
    const ok = await showReservationConfirmDialog(
      document.getElementById('invoice-detail') || detailEl,
      summary,
      { reverting: true },
    );
    if (!ok) return;

    const submitBtn = revertForm.querySelector('[type="submit"]');
    submitBtn.disabled = true;
    const label = submitBtn.innerHTML;
    submitBtn.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">hourglass_top</span> Reverting…';
    try {
      await saveReservationRevert(p, draft);
      await reload({ keepSelection: true, keepModalOpen: true });
      showFeedback(detailFeedback, 'Reverted to venue event booking. Invoice totals updated.', 'ok');
      window.dispatchEvent(new CustomEvent('booking:updated'));
    } catch (err) {
      showFeedback(detailFeedback, getBillingErrorMessage(err), 'error');
      submitBtn.disabled = false;
      submitBtn.innerHTML = label;
    }
  });
}

function renderReservationSection(p) {
  const parsedNotes = parseBookingNotes(p.notes);
  const tracking = renderNoteTrackingCallouts(parsedNotes);
  const reservationBlock = (title, icon, cardHtml, { editLabel = 'Edit', revertable = false } = {}) => {
    const editable = canEditReservationDetails(p);
    const showRevert = revertable && canRevertVenueOvernight(p);
    return `
      <section class="billing-panel billing-panel--reservation" data-reservation-root="${p.id}">
        ${renderReservationPanelHead(title, icon, { editable, editLabel, revertable: showRevert })}
        <p class="billing-res-catalog-loading hidden" data-res-catalog-loading>Loading venue list…</p>
        <div class="billing-res-view" data-res-view>
          ${tracking}
          ${cardHtml}
        </div>
        ${editable ? renderReservationEditForm(p) : ''}
        ${showRevert ? renderVenueOvernightRevertForm(p) : ''}
      </section>`;
  };

  if (showAsVenueOvernightBilling(p)) {
    const enriched = {
      ...p,
      facility_room_code: p.facility_room_code || venueStayCodeFromNotes(p.notes),
      facility_name: p.facility_name || venueStayCodeFromNotes(p.notes),
    };
    return `
    <div class="billing-left-stack">
      ${reservationBlock(
        'Overnight stay (billing)',
        'night_shelter',
        renderVenueOvernightDetailsCard(enriched, parsedNotes),
        { editLabel: isVenueConvertedToStay(p) ? 'Edit stay' : 'Edit', revertable: true },
      )}
      <section class="billing-panel billing-panel--charges">
        <h4 class="billing-section-title">
          <span class="material-symbols-outlined" aria-hidden="true">request_quote</span>
          Charge breakdown
        </h4>
        ${renderChargeTable(p)}
      </section>
    </div>`;
  }

  if (isVenueInvoice(p)) {
    return `
    <div class="billing-left-stack">
      ${reservationBlock('Venue booking details', 'meeting_room', renderVenueDetailsCard(p, parsedNotes), {
        editLabel: canConvertVenueToStay(p) ? 'Edit / convert' : 'Edit',
      })}
      <section class="billing-panel billing-panel--charges">
        <h4 class="billing-section-title">
          <span class="material-symbols-outlined" aria-hidden="true">request_quote</span>
          Charge breakdown
        </h4>
        ${renderChargeTable(p)}
      </section>
    </div>`;
  }

  return `
    <div class="billing-left-stack">
      ${reservationBlock('Reservation details', 'event_available', renderRoomDetailsCard(p, parsedNotes), { editLabel: 'Edit stay' })}
      ${renderRoomFeesSection(p)}
      <section class="billing-panel billing-panel--charges">
        <h4 class="billing-section-title">
          <span class="material-symbols-outlined" aria-hidden="true">request_quote</span>
          Charge breakdown
        </h4>
        ${renderChargeTable(p)}
      </section>
    </div>`;
}

function formatTxAt(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function renderOverpaymentAlert(summary) {
  const credit = Number(summary?.credit_balance || 0);
  if (credit <= 0) return '';
  return `
    <div class="billing-overpay-alert" role="status">
      <span class="material-symbols-outlined" aria-hidden="true">currency_exchange</span>
      <div>
        <strong>Overpayment — refund applicable</strong>
        <p>Guest paid <strong>${fmt(summary.amount_paid)}</strong> against <strong>${fmt(summary.total_due)}</strong> due.
        Record a refund of up to <strong>${fmt(credit)}</strong> below.</p>
      </div>
    </div>`;
}

function renderPaymentSummaryCard(p) {
  const summary = paymentSummary(p);
  const suggested = Number(p.suggested_deposit || 0);
  const depositOutstanding = Number(p.deposit_outstanding || 0);
  const hasCredit = Number(summary.credit_balance || 0) > 0;

  return `
    <section class="billing-panel billing-panel--summary">
      <h4 class="billing-section-title">
        <span class="material-symbols-outlined" aria-hidden="true">account_balance_wallet</span>
        Payment balance
      </h4>
      ${renderOverpaymentAlert(summary)}
      <dl class="billing-balance-grid">
        <div><dt>Total due</dt><dd>${fmt(summary.total_due)}</dd></div>
        <div><dt>Paid so far</dt><dd>${fmt(summary.amount_paid)}</dd></div>
        <div class="billing-balance-grid__due"><dt>Balance due</dt><dd>${fmt(summary.balance_due)}</dd></div>
        ${hasCredit ? `<div class="billing-balance-grid__credit"><dt>Credit / refundable</dt><dd>${fmt(summary.credit_balance)}</dd></div>` : ''}
      </dl>
      ${suggested > 0 ? `<p class="billing-deposit-hint">Suggested deposit: <strong>${fmt(suggested)}</strong>${depositOutstanding > 0 ? ` · <strong>${fmt(depositOutstanding)}</strong> still outstanding` : ''}</p>` : ''}
    </section>`;
}

function renderRefundPanel(p) {
  const summary = paymentSummary(p);
  const credit = Number(summary.credit_balance || 0);
  if (credit <= 0) return '';
  const methodOptions = PAYMENT_METHODS.map((m) => `<option value="${m}">${m}</option>`).join('');

  return `
    <section class="billing-panel billing-panel--refund" aria-label="Record refund">
      <h4 class="billing-section-title">
        <span class="material-symbols-outlined" aria-hidden="true">undo</span>
        Record refund
      </h4>
      <p class="billing-refund-lead">Return the overpaid amount to the guest. This creates a Refund ledger entry and clears the credit balance.</p>
      <form class="billing-tx-form" data-tx-form="${p.id}">
        <input type="hidden" name="tx_type" value="Refund" />
        <label class="billing-edit-form__field">
          <span>Refund amount (₱)</span>
          <input type="number" class="billing-edit-form__input" name="tx_amount" min="0.01" max="${credit}" step="0.01"
            value="${credit}" data-live-record />
        </label>
        <label class="billing-edit-form__field billing-record-method" data-record-method-field>
          <span>Refund method</span>
          <select class="billing-edit-form__input" name="tx_method" data-pay-method="${p.id}">
            <option value="">Select how guest was refunded…</option>
            ${methodOptions}
          </select>
        </label>
        <label class="billing-edit-form__field">
          <span>Notes (optional)</span>
          <input type="text" class="billing-edit-form__input" name="tx_notes" maxlength="255"
            placeholder="e.g. Refund of overpayment after discount" />
        </label>
      </form>
      <p class="billing-record-summary" data-record-summary>${recordSummaryHtml(p, credit, '', 'Refund')}</p>
      <label class="billing-record-check" data-record-check>
        <input type="checkbox" data-approve-check />
        <span>${recordConfirmLabel(false, 'Refund')}</span>
      </label>
      <button type="button" class="invoice-btn-confirm billing-panel__btn" data-confirm-paid="${p.id}" disabled>
        <span class="material-symbols-outlined" aria-hidden="true">currency_exchange</span>
        Record refund
      </button>
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
  const typeChoices = summary.credit_balance > 0
    ? ['Refund', ...TX_TYPES.filter((t) => t !== 'Refund')]
    : TX_TYPES;
  const txTypeOptions = typeChoices.map((t) => `<option value="${t}"${t === defaultType ? ' selected' : ''}>${t}</option>`).join('');

  if (!isPending) {
    const paidWhen = formatPaidAt(p.paid_at);
    return `
      ${renderPaymentSummaryCard(p)}
      ${renderRefundPanel(p)}
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
      </section>
      <section class="billing-panel billing-panel--clear" aria-label="Clear invoice">
        <h4 class="billing-section-title">
          <span class="material-symbols-outlined" aria-hidden="true">delete</span>
          Clear record
        </h4>
        <p class="billing-clear-lead">Remove this paid invoice from billing. The reservation is not deleted — only the payment record is cleared.</p>
        <button type="button" class="invoice-btn-secondary billing-panel__btn billing-panel__btn--danger" data-delete-invoice="${p.id}">
          <span class="material-symbols-outlined" aria-hidden="true">delete</span>
          Clear invoice #${p.id}
        </button>
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
        <label class="billing-edit-form__field billing-edit-form__field--subtotal">
          <span>Invoice subtotal (₱)</span>
          <input type="number" min="1" step="1"
            class="billing-edit-form__input billing-edit-form__input--amount"
            name="invoice_subtotal"
            data-subtotal-input
            data-live-due
            value="${Math.round(subtotal)}" />
          <small class="billing-edit-form__hint">Set the full charge before discount — use for venue conversions and manual adjustments.</small>
        </label>
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
      <p class="billing-record-note">Deposits and advances reduce the balance due. Settlement pays the remaining balance. Payments beyond the amount due create a refundable credit.</p>
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
      ${renderReservationConfirmDialog()}
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
  form.setAttribute('data-subtotal', String(subtotal));

  if (pesoHint) pesoHint.textContent = `−${fmt(discount_amount)} off subtotal`;

  const detailEl = form.closest('.billing-detail');
  if (detailEl) syncRecordPaymentUi(detailEl, selectedPayment());

  const percentInput = form.querySelector('[name="discount_percent"]');
  const fixedInput = form.querySelector('[name="discount_amount"]');
  if (mode === 'percent' && fixedInput) {
    fixedInput.value = String(discount_amount);
    fixedInput.max = String(subtotal);
  } else if (mode === 'fixed' && percentInput) {
    percentInput.value = String(discountPercent(subtotal, discount_amount));
    if (fixedInput) fixedInput.max = String(subtotal);
  }
}

function renderList() {
  const listEl = document.getElementById('invoice-list');
  const hintEl = document.getElementById('billing-list-hint');
  if (!listEl) return;

  if (hintEl) hintEl.textContent = listFilterHint();

  const list = filteredPayments();

  if (!list.length) {
    const emptyCopy = {
      pending: {
        title: 'No unpaid invoices',
        text: 'New approved bookings will appear here when payment is still needed.',
      },
      partial: {
        title: 'No partial payments',
        text: 'When a guest pays a deposit or advance, the invoice moves here with paid and balance amounts.',
      },
      paid: {
        title: 'No paid invoices',
        text: 'Fully settled invoices will appear here.',
      },
    };
    const copy = emptyCopy[state.activeFilter] || emptyCopy.pending;
    listEl.innerHTML = `
      <div class="invoice-empty">
        <span class="material-symbols-outlined invoice-empty__icon" aria-hidden="true">receipt_long</span>
        <p class="invoice-empty__title">${copy.title}</p>
        <p class="invoice-empty__text">${copy.text}</p>
      </div>`;
    syncClearPaidButton();
    return;
  }

  listEl.innerHTML = `<div class="billing-table">${list.map(renderListRow).join('')}</div>`;

  syncClearPaidButton();
  refreshAdminReadOnlyUI();
}

function handleInvoiceListClick(e) {
  const rowBtn = e.target.closest('[data-invoice-row]');
  if (rowBtn) {
    hideFeedback(document.getElementById('payments-feedback'));
    void openInvoiceModal(rowBtn.getAttribute('data-invoice-row'));
    return;
  }
  const deleteBtn = e.target.closest('[data-delete-invoice]');
  if (!deleteBtn) return;
  e.stopPropagation();
  hideFeedback(document.getElementById('payments-feedback'));
  deleteBtn.disabled = true;
  void handleClearInvoice(deleteBtn.getAttribute('data-delete-invoice'), {
    feedbackEl: document.getElementById('payments-feedback'),
  }).catch(() => {}).finally(() => {
    deleteBtn.disabled = false;
  });
}

function getModal() {
  return document.getElementById('billing-invoice-modal');
}

let invoiceModalOpenGen = 0;

function isBillingInvoiceModalOpen() {
  const modal = getModal();
  return Boolean(modal && !modal.hidden && !modal.classList.contains('is-hidden'));
}

/** True when the open invoice modal has unsaved edits or an active sub-dialog. */
function isBillingInvoiceModalBusy() {
  if (!isBillingInvoiceModalOpen()) return false;
  const detailEl = document.getElementById('invoice-detail');
  if (!detailEl) return true;

  const confirmOpen = detailEl.querySelector('[data-res-confirm]');
  if (confirmOpen && !confirmOpen.classList.contains('hidden') && !confirmOpen.hidden) return true;

  const editForm = detailEl.querySelector('[data-res-edit-form]');
  if (editForm && !editForm.classList.contains('hidden') && !editForm.hidden) return true;

  const revertForm = detailEl.querySelector('[data-res-revert-form]');
  if (revertForm && !revertForm.classList.contains('hidden') && !revertForm.hidden) return true;

  const p = selectedPayment();
  const billingForm = getBillingForm(detailEl);
  if (p && billingForm && hasUnsavedBillingChanges(p, billingForm)) return true;
  if (p && hasUnsavedFeeChanges(detailEl, p.id)) return true;
  return false;
}

async function refreshOpenInvoiceQuietly(id) {
  if (isBillingInvoiceModalBusy()) return;

  const detailEl = document.getElementById('invoice-detail');
  if (!detailEl) return;

  try {
    const fresh = await getPaymentById(id);
    const idx = state.payments.findIndex((x) => String(x.id) === String(id));
    if (idx >= 0) state.payments[idx] = fresh;
    else state.payments.push(fresh);

    detailEl.innerHTML = renderDetailPanel(fresh);
    bindDetailActions(fresh);
    initBillingFeeEditor(fresh, detailEl);
    bindReservationEdit(fresh, detailEl);
    refreshAdminReadOnlyUI();
  } catch {
    /* keep current panel on background refresh failure */
  }
}

async function openInvoiceModal(id) {
  const openGen = ++invoiceModalOpenGen;
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
    if (openGen !== invoiceModalOpenGen) return;
    if (String(state.selectedId) !== String(id)) return;
    if (!isBillingInvoiceModalOpen()) return;

    const idx = state.payments.findIndex((x) => String(x.id) === String(id));
    if (idx >= 0) state.payments[idx] = p;
    else state.payments.push(p);
    renderList();

    detailEl.innerHTML = renderDetailPanel(p);
    bindDetailActions(p);
    initBillingFeeEditor(p, detailEl);
    bindReservationEdit(p, detailEl);
    refreshAdminReadOnlyUI();
  } catch (err) {
    if (openGen !== invoiceModalOpenGen) return;
    if (detailEl.innerHTML.includes('billing-detail-loading')) {
      detailEl.innerHTML = renderInvoiceLoadError(id, getBillingErrorMessage(err));
      detailEl.querySelector('[data-retry-invoice]')?.addEventListener('click', () => {
        openInvoiceModal(id);
      });
      detailEl.querySelector('[data-close-detail]')?.addEventListener('click', closeInvoiceModal);
    }
    showFeedback(document.getElementById('payments-feedback'), getBillingErrorMessage(err), 'error');
  }
}

function closeInvoiceModal() {
  invoiceModalOpenGen += 1;
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
    const { subtotal: nextSubtotal, discount_amount, discount_note } = readBillingFormValues(form, subtotal);
    try {
      await updatePayment(p.id, {
        subtotal: nextSubtotal,
        discount_amount,
        discount_note,
      });
      await reload({ keepSelection: true, keepModalOpen: true });
      showFeedback(detailFeedback, 'Billing updated.', 'ok');
    } catch (err) {
      showFeedback(detailFeedback, getBillingErrorMessage(err), 'error');
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
      showFeedback(detailFeedback, getBillingErrorMessage(err), 'error');
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
    const type = txForm?.querySelector('[name="tx_type"]')?.value || 'Settlement';
    const isWaived = totalDue <= 0 && type !== 'Refund';
    const amount = Number(txForm?.querySelector('[name="tx_amount"]')?.value || 0);
    const method = isWaived ? 'Waived' : (txForm?.querySelector('[name="tx_method"]')?.value || getPayMethodSelect(detailEl)?.value);
    const notes = String(txForm?.querySelector('[name="tx_notes"]')?.value || '').trim();

    if (!isWaived && !method) {
      showFeedback(detailFeedback, type === 'Refund' ? 'Select refund method before recording.' : 'Select payment method before recording.', 'error');
      txForm?.querySelector('[name="tx_method"]')?.focus();
      return;
    }
    if (hasUnsavedBillingChanges(fresh, billingForm)) {
      showFeedback(detailFeedback, 'Save invoice changes before recording payment.', 'error');
      billingForm?.querySelector('button[type="submit"]')?.focus();
      return;
    }
    if (hasUnsavedFeeChanges(detailEl, fresh.id)) {
      showFeedback(detailFeedback, 'Save additional fees before recording payment.', 'error');
      detailEl.querySelector('[data-save-booking-fees]')?.focus();
      return;
    }
    if (!check?.checked) {
      showFeedback(detailFeedback, type === 'Refund' ? 'Check the confirmation box to record the refund.' : 'Check the confirmation box to record payment.', 'error');
      check?.focus();
      return;
    }

    if (type === 'Refund') {
      const credit = Number(paymentSummary(fresh).credit_balance || 0);
      if (!(amount > 0)) {
        showFeedback(detailFeedback, 'Enter a refund amount greater than zero.', 'error');
        return;
      }
      if (amount > credit + 0.001) {
        showFeedback(detailFeedback, `Refund cannot exceed available credit (${fmt(credit)}).`, 'error');
        return;
      }
    } else if (!isWaived) {
      const summary = paymentSummary(fresh);
      const projectedPaid = Math.round((Number(summary.amount_paid || 0) + amount) * 100) / 100;
      const overpay = Math.round((projectedPaid - Number(summary.total_due || 0)) * 100) / 100;
      if (overpay > 0) {
        const ok = window.confirm(
          `This payment creates an overpayment of ${fmt(overpay)}.\n\n`
          + 'A refund of that credit will be available after recording. Continue?'
        );
        if (!ok) return;
      }
    }

    hideFeedback(detailFeedback);
    btn.disabled = true;
    btn.dataset.busy = '1';
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
      const keepOpen = isOpenInvoice(updated)
        || type === 'Refund'
        || Number(paymentSummary(updated).credit_balance || 0) > 0;
      await reload({ keepSelection: true, keepModalOpen: keepOpen });
      if (!keepOpen) closeInvoiceModal();
      showFeedback(
        pageFeedback,
        result.message || (type === 'Refund'
          ? `Refund recorded for ${fresh.guest_name}.`
          : `${type} recorded for ${fresh.guest_name}.`),
        'ok',
      );
    } catch (err) {
      showFeedback(detailFeedback, getBillingErrorMessage(err), 'error');
      syncRecordPaymentUi(detailEl, fresh);
      btn.disabled = false;
      btn.innerHTML = label;
      delete btn.dataset.busy;
    }
  });

  detailEl?.querySelector('[data-delete-invoice]')?.addEventListener('click', async (e) => {
    const id = e.currentTarget.getAttribute('data-delete-invoice');
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await handleClearInvoice(id, {
        closeModal: true,
        feedbackEl: pageFeedback,
      });
    } catch {
      btn.disabled = false;
    }
  });
}

function updateSummary() {
  const pending = state.payments.filter((x) => isPendingInvoice(x));
  const partial = state.payments.filter((x) => isPartialInvoice(x));
  const paid = state.payments.filter((x) => x.status === 'Paid');
  const open = state.payments.filter((x) => isOpenInvoice(x));

  const balanceDueTotal = open.reduce((s, x) => s + balanceDue(x), 0);
  const partialPaidTotal = partial.reduce((s, x) => s + paymentSummary(x).amount_paid, 0);
  const partialBalanceTotal = partial.reduce((s, x) => s + balanceDue(x), 0);
  const collectedTotal = paid.reduce((s, x) => s + paymentSummary(x).amount_paid, 0);

  document.getElementById('invoice-due-total').textContent = fmt(balanceDueTotal);
  document.getElementById('invoice-due-count').textContent = `${open.length} open · ${pending.length} unpaid`;

  const partialPaidEl = document.getElementById('invoice-partial-paid-total');
  const partialCountEl = document.getElementById('invoice-partial-count');
  if (partialPaidEl) partialPaidEl.textContent = fmt(partialPaidTotal);
  if (partialCountEl) {
    partialCountEl.textContent = partial.length
      ? `${partial.length} guest${partial.length === 1 ? '' : 's'} · ${fmt(partialBalanceTotal)} still owed`
      : 'No deposits or advances yet';
  }

  document.getElementById('invoice-collected-total').textContent = fmt(collectedTotal);
  document.getElementById('invoice-paid-count').textContent = `${paid.length} fully paid`;

  document.querySelectorAll('[data-invoice-count]').forEach((el) => {
    const key = el.getAttribute('data-invoice-count');
    const counts = { pending: pending.length, partial: partial.length, paid: paid.length };
    el.textContent = String(counts[key] ?? 0);
  });

  syncClearPaidButton();
}

async function reload({ keepSelection = false, keepModalOpen = false, background = false } = {}) {
  const prevId = state.selectedId;
  const modalOpen = isBillingInvoiceModalOpen();
  const feedback = document.getElementById('payments-feedback');

  if (modalOpen) keepModalOpen = true;

  try {
    state.payments = await getPayments();
    updateSummary();
    renderList();

    if (keepModalOpen && prevId && state.payments.some((x) => String(x.id) === String(prevId))) {
      if (!isBillingInvoiceModalOpen()) {
        /* modal was closed while reload was in flight */
      } else if (background) {
        await refreshOpenInvoiceQuietly(prevId);
      } else {
        await openInvoiceModal(prevId);
      }
    }
  } catch (err) {
    if (background) return;
    showFeedback(feedback, getBillingErrorMessage(err), 'error');
    throw err;
  }
}

function bindPaymentsPageEvents() {
  if (paymentsPageBound) return;
  paymentsPageBound = true;

  const feedback = document.getElementById('payments-feedback');

  document.querySelectorAll('[data-invoice-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.activeFilter = btn.getAttribute('data-invoice-filter') || 'pending';
      closeInvoiceModal();
      document.querySelectorAll('[data-invoice-filter]').forEach((tab) => {
        const isActive = tab === btn;
        tab.classList.toggle('is-active', isActive);
        tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      hideFeedback(feedback);
      renderList();
      syncClearPaidButton();
    });
  });

  document.getElementById('billing-clear-paid')?.addEventListener('click', async () => {
    hideFeedback(feedback);
    try {
      await handleClearAllPaid();
    } catch {
      /* feedback shown by handler */
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !getModal() || getModal().hidden) return;
    closeInvoiceModal();
  });

  getModal()?.querySelector('.billing-modal__backdrop')?.addEventListener('click', closeInvoiceModal);

  document.getElementById('invoice-list')?.addEventListener('click', handleInvoiceListClick);
}

export function teardownPaymentsPage() {
  stopBookingPoll?.();
  stopBookingPoll = null;
  if (onBookingUpdated) {
    window.removeEventListener('booking:updated', onBookingUpdated);
    onBookingUpdated = null;
  }
  paymentsPageBound = false;
}

export async function loadPaymentsPage() {
  const feedback = document.getElementById('payments-feedback');
  bindPaymentsPageEvents();

  try {
    await reload();
  } catch (err) {
    const listEl = document.getElementById('invoice-list');
    if (listEl) {
      listEl.innerHTML = `
        <div class="invoice-empty">
          <p class="invoice-empty__title">Could not load invoices</p>
          <p class="invoice-empty__text">${escapeHtml(getBillingErrorMessage(err))}</p>
          <button type="button" class="invoice-btn-secondary billing-list-retry">Try again</button>
        </div>`;
      listEl.querySelector('.billing-list-retry')?.addEventListener('click', () => {
        hideFeedback(feedback);
        reload().catch(() => {});
      });
    }
    showFeedback(feedback, getBillingErrorMessage(err), 'error');
  }

  if (onBookingUpdated) {
    window.removeEventListener('booking:updated', onBookingUpdated);
  }
  onBookingUpdated = () => {
    if (isBillingInvoiceModalBusy()) return;
    reload({ keepSelection: true, background: true });
  };
  window.addEventListener('booking:updated', onBookingUpdated);
  stopBookingPoll?.();
  stopBookingPoll = createBookingPoll(
    () => reload({ background: true }),
    { shouldPoll: () => !isBillingInvoiceModalOpen() },
  );
}
