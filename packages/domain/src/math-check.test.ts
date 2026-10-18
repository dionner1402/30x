import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mathCheck } from './math-check';

describe('mathCheck (A3)', () => {
  it('OK cuando líneas + tax = total', () => {
    const r = mathCheck({
      amount: 420,
      lineItems: [
        { desc: 'widgets', amount: 300 },
        { desc: 'shipping', amount: 100 },
      ],
      tax: 20,
    });
    assert.equal(r.ok, true);
    assert.equal(r.sum, 420);
    assert.equal(r.reason, 'math_ok');
  });

  it('FAIL cuando la suma no cuadra', () => {
    const r = mathCheck({
      amount: 500,
      lineItems: [{ desc: 'a', amount: 100 }],
      tax: 0,
    });
    assert.equal(r.ok, false);
    assert.equal(r.sum, 100);
    assert.equal(r.delta, 400);
    assert.equal(r.reason, 'math_mismatch');
  });

  it('OK dentro de epsilon (0.01)', () => {
    const r = mathCheck({
      amount: 10.0,
      lineItems: [{ desc: 'a', amount: 9.995 }],
      epsilon: 0.01,
    });
    assert.equal(r.ok, true);
  });

  it('FAIL fuera de epsilon', () => {
    const r = mathCheck({
      amount: 10,
      lineItems: [{ desc: 'a', amount: 9.98 }],
      epsilon: 0.01,
    });
    assert.equal(r.ok, false);
  });

  it('skip OK si no hay lineItems', () => {
    const r = mathCheck({ amount: 100 });
    assert.equal(r.ok, true);
    assert.equal(r.reason, 'no_line_items');
    assert.equal(r.sum, null);
  });

  it('tax undefined se trata como 0', () => {
    const r = mathCheck({
      amount: 50,
      lineItems: [{ amount: 50 }],
    });
    assert.equal(r.ok, true);
  });
});
