import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fingerprint } from './fingerprint';
import { normalizePayee } from './normalize-payee';

describe('fingerprint (A2)', () => {
  const base = {
    tenantId: 'blinka-demo',
    payeeName: 'ACME Supplies LLC',
    invoiceNumber: 'INV-2041',
    amount: 420,
    currency: 'USD',
    issueDate: '2026-10-01',
  };

  it('mismo documento → mismo hash', () => {
    const a = fingerprint(base);
    const b = fingerprint({ ...base });
    assert.equal(a, b);
    assert.equal(a.length, 64);
  });

  it('variantes de payee normalizan igual → mismo hash', () => {
    const a = fingerprint(base);
    const b = fingerprint({
      ...base,
      payeeName: 'acme supplies, llc.',
    });
    assert.equal(normalizePayee(base.payeeName), normalizePayee('acme supplies, llc.'));
    assert.equal(a, b);
  });

  it('invoice number distinto → hash distinto', () => {
    const a = fingerprint(base);
    const b = fingerprint({ ...base, invoiceNumber: 'INV-2042' });
    assert.notEqual(a, b);
  });

  it('amount distinto → hash distinto', () => {
    const a = fingerprint(base);
    const b = fingerprint({ ...base, amount: 421 });
    assert.notEqual(a, b);
  });

  it('currency case-insensitive', () => {
    const a = fingerprint(base);
    const b = fingerprint({ ...base, currency: 'usd' });
    assert.equal(a, b);
  });
});
