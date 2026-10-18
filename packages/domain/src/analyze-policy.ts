import type { AutonomyMode } from '@ezallow/shared';
import { normalizeAutonomyMode } from '@ezallow/shared';
import type { PolicyInput } from './evaluate-policy';

export type PolicyWarningSeverity = 'low' | 'medium' | 'high';

export type PolicyWarning = {
  id: string;
  severity: PolicyWarningSeverity;
  message: string;
};

export type AnalyzePolicyInput = PolicyInput & {
  autonomyMode?: AutonomyMode | string;
};

/**
 * A4b - analizador estático antes de activate.
 * No ejecuta facturas: solo inconsistencias / defaults inseguros.
 */
export function analyzePolicy(policy: AnalyzePolicyInput): PolicyWarning[] {
  const warnings: PolicyWarning[] = [];

  if (policy.softCap > policy.hardCap) {
    warnings.push({
      id: 'soft_gt_hard',
      severity: 'high',
      message: `softCap (${policy.softCap}) > hardCap (${policy.hardCap}): inconsistente`,
    });
  }

  if (policy.hardCap <= 0) {
    warnings.push({
      id: 'hard_cap_zero',
      severity: 'high',
      message: 'hardCap ≤ 0 bloquea casi todo o es misconfig',
    });
  }

  if (policy.allowFuzzyPayeeMatch && policy.blockNewPayees === false) {
    warnings.push({
      id: 'fuzzy_open_payees',
      severity: 'high',
      message:
        'allowFuzzyPayeeMatch + blockNewPayees=false → superficie amplia de falso PAY',
    });
  }

  const mode = policy.autonomyMode
    ? normalizeAutonomyMode(policy.autonomyMode)
    : undefined;
  if (
    policy.allowFuzzyPayeeMatch &&
    (mode === 'autopilot' || mode === 'assist')
  ) {
    const softRatio =
      policy.hardCap > 0 ? policy.softCap / policy.hardCap : 1;
    if (softRatio >= 0.5) {
      warnings.push({
        id: 'fuzzy_operator_soft',
        severity: 'high',
        message:
          'Fuzzy + autonomía auto-PAY + softCap alto (≥50% hard): default inseguro',
      });
    } else {
      warnings.push({
        id: 'fuzzy_operator',
        severity: 'medium',
        message: 'Fuzzy payee match con autonomía que puede PAY: revisar allowlist',
      });
    }
  }

  if (
    (!policy.allowlistPayees || policy.allowlistPayees.length === 0) &&
    policy.blockNewPayees !== false
  ) {
    warnings.push({
      id: 'empty_allowlist',
      severity: 'medium',
      message: 'Allowlist vacía + blockNewPayees → todo beneficiario nuevo será HOLD',
    });
  }

  if (
    policy.periodBudget !== undefined &&
    policy.periodBudget < policy.softCap
  ) {
    warnings.push({
      id: 'budget_lt_soft',
      severity: 'medium',
      message: `periodBudget (${policy.periodBudget}) < softCap (${policy.softCap})`,
    });
  }

  if (policy.softCap === policy.hardCap && policy.softCap > 0) {
    warnings.push({
      id: 'soft_eq_hard',
      severity: 'low',
      message: 'softCap = hardCap: no hay zona HOLD por monto intermedio',
    });
  }

  return warnings;
}

export function hasHighSeverity(warnings: PolicyWarning[]): boolean {
  return warnings.some((w) => w.severity === 'high');
}
