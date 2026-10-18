import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluatePolicy } from './evaluate-policy';

const invoice = {
  tenantId: 'blinka-demo',
  payeeName: 'ACME Supplies LLC',
  amount: 420,
  currency: 'USD',
  invoiceNumber: 'INV-AUTO',
  lineItems: [{ amount: 400 }, { amount: 20 }],
  tax: 0,
  agreedAmount: 420,
};

const overSoft = {
  ...invoice,
  amount: 2400,
  invoiceNumber: 'INV-SOFT',
  lineItems: [{ amount: 2400 }],
  agreedAmount: 2400,
};

const policy = {
  allowlistPayees: ['acme supplies llc'],
  hardCap: 5000,
  softCap: 1000,
  blockNewPayees: true,
};

describe('autonomy ladder Advise → Assist → Autopilot', () => {
  it('autopilot → PAY en allow path', () => {
    const r = evaluatePolicy(invoice, policy, { autonomyMode: 'autopilot' });
    assert.equal(r.outcome, 'PAY');
    assert.equal(r.recommendedOutcome, undefined);
  });

  it('assist → PAY bajo soft', () => {
    const r = evaluatePolicy(invoice, policy, { autonomyMode: 'assist' });
    assert.equal(r.outcome, 'PAY');
  });

  it('advise → HOLD + recommendedOutcome PAY', () => {
    const r = evaluatePolicy(invoice, policy, { autonomyMode: 'advise' });
    assert.equal(r.outcome, 'HOLD');
    assert.equal(r.recommendedOutcome, 'PAY');
    assert.ok(r.reasons.includes('advise'));
  });

  it('legacy operator alias → autopilot PAY', () => {
    const r = evaluatePolicy(invoice, policy, { autonomyMode: 'autopilot' });
    assert.equal(r.outcome, 'PAY');
  });

  it('assist over soft → HOLD', () => {
    const r = evaluatePolicy(overSoft, policy, { autonomyMode: 'assist' });
    assert.equal(r.outcome, 'HOLD');
    assert.ok(r.reasons.includes('soft_cap'));
  });

  it('autopilot over soft (bajo hard) → PAY', () => {
    const r = evaluatePolicy(overSoft, policy, { autonomyMode: 'autopilot' });
    assert.equal(r.outcome, 'PAY');
    assert.ok(
      r.rulesFired.some((x) => x.id === 'soft_cap_waived_autopilot'),
    );
  });

  it('advise no suaviza DENY (math fail)', () => {
    const r = evaluatePolicy(
      { ...invoice, amount: 999, lineItems: [{ amount: 1 }] },
      policy,
      { autonomyMode: 'advise' },
    );
    assert.equal(r.outcome, 'DENY');
  });

  it('advise over soft → HOLD soft (no recommend PAY)', () => {
    const r = evaluatePolicy(overSoft, policy, { autonomyMode: 'advise' });
    assert.equal(r.outcome, 'HOLD');
    assert.ok(r.reasons.includes('soft_cap'));
  });
});
