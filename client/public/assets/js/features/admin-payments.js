/**
 * Admin payments — list, filter, mark pending rows as paid.
 */

import { getPayments, updatePayment } from '/assets/js/services/api.js';

const fmt = (n) => `₱${parseFloat(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-PH', { month: 'short', day: '2-digit', year: 'numeric' });
}

function statusClass(status) {
  return status === 'Paid' ? 'status-pill-approved' : 'status-pill-pending';
}

export async function loadPaymentsPage() {
  const tbody = document.getElementById('payments-tbody');
  const feedback = document.getElementById('payments-feedback');
  let payments = [];
  let activeFilter = 'all';

  async function reload() {
    payments = await getPayments();
    const paid = payments.filter((p) => p.status === 'Paid');
    const pending = payments.filter((p) => p.status === 'Pending');
    const revenue = paid.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
    const due = pending.reduce((s, p) => s + parseFloat(p.amount || 0), 0);

    document.getElementById('total-revenue').textContent = fmt(revenue);
    document.getElementById('pending-amount').textContent = `${fmt(due)} DUE`;

    const list = activeFilter === 'paid' ? paid : activeFilter === 'pending' ? pending : payments;
    renderRows(list);
  }

  function renderRows(list) {
    if (!tbody) return;
    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-on-surface-variant py-8">No payments found.</td></tr>';
      return;
    }
    tbody.innerHTML = list.map((p) => {
      const action = p.status === 'Pending'
        ? `<button type="button" class="text-primary text-label-sm font-bold hover:underline" data-mark-paid="${p.id}">Mark paid</button>`
        : '<span class="text-on-surface-variant text-label-sm">—</span>';
      return `<tr>
        <td>#${p.booking_id}</td>
        <td>${fmt(p.amount)}</td>
        <td>${p.method}</td>
        <td>${formatDate(p.paid_at || p.created_at)}</td>
        <td><span class="${statusClass(p.status)} text-[10px] px-2 py-0.5 rounded-full font-bold">${p.status}</span></td>
        <td>${action}</td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('[data-mark-paid]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-mark-paid');
        btn.disabled = true;
        btn.textContent = 'Saving…';
        feedback?.classList.add('hidden');
        try {
          await updatePayment(id, { status: 'Paid' });
          await reload();
          if (feedback) {
            feedback.textContent = 'Payment marked as paid.';
            feedback.className = 'text-body-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2 mb-4';
            feedback.classList.remove('hidden');
          }
        } catch (err) {
          btn.disabled = false;
          btn.textContent = 'Mark paid';
          if (feedback) {
            feedback.textContent = err.message || 'Update failed';
            feedback.className = 'text-body-sm text-error bg-error-container rounded-lg px-3 py-2 mb-4';
            feedback.classList.remove('hidden');
          }
        }
      });
    });
  }

  try {
    await reload();
  } catch (err) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-error py-8">${err.message}</td></tr>`;
    }
    return;
  }

  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeFilter = btn.getAttribute('data-tab') || 'all';
      reload().catch((err) => {
        if (feedback) {
          feedback.textContent = err.message;
          feedback.className = 'text-body-sm text-error bg-error-container rounded-lg px-3 py-2 mb-4';
          feedback.classList.remove('hidden');
        }
      });
    });
  });
}
