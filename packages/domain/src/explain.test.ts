import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildCounterfactual, buildExplanation } from './explain';
import type { EvaluatePolicyResult } from './evaluate-policy';

function base(
  partial: Partial<EvaluatePolicyResult> &
    Pick<EvaluatePolicyResult, 'outcome' | 'reasons'>,
): EvaluatePolicyResult {
  return {
    rulesFired: [],
    fingerprint: 'x',
    mathOk: true,
    payeeNormalized: 'acme',
    ...partial,
  };
}

describe('buildExplanation (A8)', () => {
  it('PAY: prosa humana sin volcar rule ids', () => {
    const text = buildExplanation(
      base({ outcome: 'PAY', reasons: ['allow'] }),
    );
    assert.match(text, /Autorizado/);
    assert.doesNotMatch(text, /math_ok:/);
  });

  it('HOLD new_payee', () => {
    const text = buildExplanation(
      base({ outcome: 'HOLD', reasons: ['new_payee'] }),
    );
    assert.match(text, /allowlist|beneficiario/i);
  });

  it('DENY duplicate', () => {
    const text = buildExplanation(
      base({ outcome: 'DENY', reasons: ['duplicate'] }),
    );
    assert.match(text, /duplicado/i);
  });

  it('DENY untrusted_content (inyección)', () => {
    const text = buildExplanation(
      base({ outcome: 'DENY', reasons: ['untrusted_content'] }),
    );
    assert.match(text, /inyecci[oó]n|instrucci[oó]n/i);
  });

  it('advisor HOLD recomienda', () => {
    const text = buildExplanation(
      base({
        outcome: 'HOLD',
        reasons: ['advise'],
        recommendedOutcome: 'PAY',
      }),
    );
    assert.match(text, /Advise|persona/i);
  });
});

describe('buildCounterfactual', () => {
  it('PAY menciona alternativa no-PAY', () => {
    const text = buildCounterfactual(
      base({ outcome: 'PAY', reasons: ['allow'] }),
    );
    assert.match(text, /HOLD|DENY/);
  });
});
