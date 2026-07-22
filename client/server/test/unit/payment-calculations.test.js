import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDueAmount,
  computePaymentSummary,
  computeLodgingSubtotal,
} from '../../src/services/payment.service.js';
import { buildInvoicePaymentSections } from '../../src/services/email.service.js';

describe('billing calculations', () => {
  it('supports fixed, percentage-derived, cleared, and full discounts', () => {
    assert.equal(computeDueAmount(10_000, 1_500), 8_500);
    assert.equal(computeDueAmount(10_000, 2_000), 8_000);
    assert.equal(computeDueAmount(10_000, 0), 10_000);
    assert.equal(computeDueAmount(10_000, 10_000), 0);
  });

  it('recalculates partial and complete payment balances', () => {
    const invoice = { subtotal: 10_000, discount_amount: 1_000, status: 'Pending' };
    const partial = computePaymentSummary(invoice, [
      { type: 'Deposit', amount: 2_000 },
      { type: 'Settlement', amount: 3_000 },
    ]);
    assert.deepEqual(partial, {
      total_due: 9_000,
      amount_paid: 5_000,
      balance_due: 4_000,
      credit_balance: 0,
    });

    const settled = computePaymentSummary(invoice, [
      { type: 'Settlement', amount: 9_000 },
    ]);
    assert.equal(settled.balance_due, 0);
    assert.equal(settled.amount_paid, 9_000);
  });

  it('reports a zero balance for a fully waived invoice', () => {
    assert.deepEqual(
      computePaymentSummary(
        { subtotal: 10_000, discount_amount: 10_000, status: 'Paid' },
        []
      ),
      {
        total_due: 0,
        amount_paid: 0,
        balance_due: 0,
        credit_balance: 0,
      }
    );
  });

  it('derives lodging-only subtotal for room invoices (excludes meals and fees)', () => {
    const lodging = computeLodgingSubtotal({
      subtotal: 12_000,
      meals: [{ subtotal: 1_500 }, { subtotal: 500 }],
      fees: [{ amount: 200, quantity: 1 }],
    });
    assert.equal(lodging, 9_800);
    assert.equal(computeDueAmount(12_000, 980), 11_020);
  });

  it('renders a clear payment history and remaining balance in invoice emails', () => {
    const html = buildInvoicePaymentSections({
      summary: {
        total_due: 10_000,
        amount_paid: 4_000,
        balance_due: 6_000,
      },
      transactions: [{
        type: 'Deposit',
        amount: 4_000,
        method: 'Bank Transfer',
        notes: 'Initial deposit',
        recorded_at: '2026-07-21T04:00:00.000Z',
      }],
    });
    assert.match(html, /Payment summary/);
    assert.match(html, /Payments received/);
    assert.match(html, /Balance due/);
    assert.match(html, /₱6,000\.00/);
    assert.match(html, /Payment history/);
    assert.match(html, /Deposit · Bank Transfer/);
    assert.match(html, /Initial deposit/);
  });
});
