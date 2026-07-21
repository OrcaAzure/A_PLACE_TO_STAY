import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDueAmount,
  computePaymentSummary,
} from '../../src/services/payment.service.js';

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
});
