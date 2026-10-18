import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { analyzePolicy, hasHighSeverity } from './analyze-policy';

const base = {
  allowlistPayees: ['acme supplies llc'],
  hardCap: 5000,
  softCap: 1000,
  blockNewPayees: true,
  periodBudget: 25000,
};

describe('analyzePolicy (A4b)', () => {
  it('limpia → sin high', () => {
    const w = analyzePolicy(base);
    assert.equal(hasHighSeverity(w), false);
  });

  it('soft > hard → high', () => {
    const w = analyzePolicy({ ...base, softCap: 6000 });
    assert.ok(w.some((x) => x.id === 'soft_gt_hard' && x.severity === 'high'));
  });

  it('fuzzy + open payees → high', () => {
    const w = analyzePolicy({
      ...base,
      allowFuzzyPayeeMatch: true,
      blockNewPayees: false,
    });
    assert.ok(w.some((x) => x.id === 'fuzzy_open_payees'));
  });

  it('fuzzy + operator + soft alto → high', () => {
    const w = analyzePolicy({
      ...base,
      softCap: 3000,
      allowFuzzyPayeeMatch: true,
      autonomyMode: 'autopilot',
    });
    assert.ok(hasHighSeverity(w));
  });
});
