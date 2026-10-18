import type { AutonomyMode, DecisionOutcome } from '@ezallow/shared';
import { normalizeAutonomyMode } from '@ezallow/shared';
import { fingerprint } from './fingerprint';
import { mathCheck } from './math-check';
import { normalizePayee } from './normalize-payee';
import { scanInvoiceUntrustedContent } from './untrusted-content';

export type TrustLadderConfig = {
  /** Default true si se pasa payeeCleanPayCount */
  enabled?: boolean;
  /** PAY limpios previos del payee para ganar autoridad (default 3) */
  minCleanPays?: number;
  /** Multiplicador del softCap efectivo, tope hardCap (default 2) */
  softCapBoost?: number;
};

export type AutonomyWindowConfig = {
  enabled?: boolean;
  /** Hora local inclusive 0–23 (default 8) */
  startHour?: number;
  /** Hora local exclusive 0–24 (default 20) */
  endHour?: number;
};

export type PolicyInput = {
  allowlistPayees: string[];
  hardCap: number;
  softCap: number;
  periodBudget?: number;
  /** Gastado ya en el periodo (opcional) */
  periodSpent?: number;
  blockNewPayees?: boolean;
  maxMismatchPercent?: number;
  allowFuzzyPayeeMatch?: boolean;
  currency?: string;
  /** D1 — autoridad progresiva por historial de PAY limpios */
  trustLadder?: TrustLadderConfig;
  /** D1 — Assist/Autopilot solo dentro de ventana horaria */
  autonomyWindow?: AutonomyWindowConfig;
};

export type InvoiceInput = {
  tenantId: string;
  payeeName: string;
  amount: number;
  currency: string;
  invoiceNumber: string;
  issueDate?: string;
  lineItems?: Array<{ desc?: string; amount: number }>;
  tax?: number;
  agreedAmount?: number;
};

export type PolicyContext = {
  /** Canónico o legacy (advisor/collaborator/operator) */
  autonomyMode: AutonomyMode | string;
  /** Fingerprints ya vistos (decisiones previas) */
  knownFingerprints?: Set<string> | string[];
  remainingBudget?: number;
  /** PAY autónomos previos del mismo payee (sin human_approved) */
  payeeCleanPayCount?: number;
  /** Reloj inyectable (tests / ventana) */
  now?: Date;
};

export type RuleFired = { id: string; message: string };

export type EvaluatePolicyResult = {
  outcome: DecisionOutcome;
  rulesFired: RuleFired[];
  reasons: string[];
  fingerprint: string;
  mathOk: boolean;
  payeeNormalized: string;
  /** Si Advise y habría sido PAY: recomendación */
  recommendedOutcome?: DecisionOutcome;
};

function asSet(v?: Set<string> | string[]): Set<string> {
  if (!v) return new Set();
  return v instanceof Set ? v : new Set(v);
}

function isOnAllowlist(
  payeeNormalized: string,
  allowlist: string[],
): boolean {
  const normalizedList = allowlist.map((p) => normalizePayee(p));
  return normalizedList.includes(payeeNormalized);
}

/**
 * A4 — Policy engine con precedencia formal.
 * DENY hard → HOLD soft → ALLOW (PAY solo si autonomy lo permite).
 * Fail-closed: nunca PAY por defecto.
 */
export function evaluatePolicy(
  invoice: InvoiceInput,
  policy: PolicyInput,
  ctx: PolicyContext,
): EvaluatePolicyResult {
  const rulesFired: RuleFired[] = [];
  const reasons: string[] = [];
  const mode = normalizeAutonomyMode(ctx.autonomyMode);
  const payeeNormalized = normalizePayee(invoice.payeeName);
  const fp = fingerprint({
    tenantId: invoice.tenantId,
    payeeName: invoice.payeeName,
    invoiceNumber: invoice.invoiceNumber,
    amount: invoice.amount,
    currency: invoice.currency,
    issueDate: invoice.issueDate,
  });

  const math = mathCheck({
    amount: invoice.amount,
    lineItems: invoice.lineItems,
    tax: invoice.tax,
  });

  // --- DENY hard: contenido no confiable (inyección / bank redirect) ---
  // Fail-closed antes de allowlist/caps: el texto libre nunca puede empujar a PAY.
  const untrusted = scanInvoiceUntrustedContent({
    payeeName: invoice.payeeName,
    invoiceNumber: invoice.invoiceNumber,
    lineItems: invoice.lineItems,
  });
  if (!untrusted.clean) {
    const ids = untrusted.hits.map((h) => h.patternId).join(',');
    rulesFired.push({
      id: 'untrusted_content_injection',
      message: `señales de inyección/redirect en texto libre (${ids})`,
    });
    reasons.push('untrusted_content');
    return finish('DENY', rulesFired, reasons, fp, math.ok, payeeNormalized);
  }

  // --- DENY hard ---
  if (!math.ok) {
    rulesFired.push({
      id: 'math_fail',
      message: `sum=${math.sum} total=${invoice.amount} delta=${math.delta}`,
    });
    reasons.push('math_fail');
    return finish('DENY', rulesFired, reasons, fp, math.ok, payeeNormalized);
  }
  if (math.reason === 'math_ok') {
    rulesFired.push({ id: 'math_ok', message: 'líneas + tax = total' });
  }

  const known = asSet(ctx.knownFingerprints);
  if (known.has(fp)) {
    // Fail-closed: firma idéntica → DENY (no auto-PAY).
    // Excepción humana posible vía resolve (falso positivo / nº reutilizado).
    rulesFired.push({
      id: 'duplicate_fingerprint',
      message:
        'firma idéntica (proveedor + nº + monto + moneda) → DENY. Si fuera falso positivo, un humano puede excepcionar',
    });
    reasons.push('duplicate');
    return finish('DENY', rulesFired, reasons, fp, math.ok, payeeNormalized);
  }

  if (invoice.amount > policy.hardCap) {
    rulesFired.push({
      id: 'hard_cap_exceeded',
      message: `${invoice.amount} > hardCap ${policy.hardCap}`,
    });
    reasons.push('hard_cap');
    return finish('DENY', rulesFired, reasons, fp, math.ok, payeeNormalized);
  }

  // --- HOLD soft ---
  const blockNew = policy.blockNewPayees !== false;
  const onList = isOnAllowlist(payeeNormalized, policy.allowlistPayees);

  if (!onList && blockNew) {
    // fuzzy no auto-PAY por defecto
    if (!policy.allowFuzzyPayeeMatch) {
      rulesFired.push({
        id: 'block_new_payee',
        message: `${payeeNormalized} ∉ allowlist`,
      });
      reasons.push('new_payee');
      return finish('HOLD', rulesFired, reasons, fp, math.ok, payeeNormalized);
    }
  }

  if (onList) {
    rulesFired.push({
      id: 'allowlist_ok',
      message: 'payee normalizado en lista',
    });
  }

  // D1 Trust Ladder: allowlist + N PAY limpios → softCap efectivo más alto
  let effectiveSoftCap = policy.softCap;
  const ladder = policy.trustLadder;
  const ladderOn = ladder?.enabled !== false;
  const minPays = ladder?.minCleanPays ?? 3;
  const boost = ladder?.softCapBoost ?? 2;
  const cleanPays = ctx.payeeCleanPayCount ?? 0;
  if (
    ladderOn &&
    onList &&
    cleanPays >= minPays &&
    boost > 1 &&
    policy.softCap < policy.hardCap
  ) {
    effectiveSoftCap = Math.min(
      policy.hardCap,
      Math.round(policy.softCap * boost * 100) / 100,
    );
    if (effectiveSoftCap > policy.softCap) {
      rulesFired.push({
        id: 'standing_authority',
        message: `trust ladder: ${cleanPays} PAY limpios → softCap efectivo ${effectiveSoftCap} (base ${policy.softCap})`,
      });
    }
  }

  // Soft cap: Advise + Assist → HOLD. Autopilot lo salta (techo = hardCap).
  const enforceSoft = mode === 'advise' || mode === 'assist';
  if (invoice.amount > effectiveSoftCap) {
    if (enforceSoft) {
      rulesFired.push({
        id: 'over_soft_cap',
        message: `${invoice.amount} > softCap ${effectiveSoftCap} → HOLD (${mode})`,
      });
      reasons.push('soft_cap');
      return finish('HOLD', rulesFired, reasons, fp, math.ok, payeeNormalized);
    }
    rulesFired.push({
      id: 'soft_cap_waived_autopilot',
      message: `${invoice.amount} > softCap ${effectiveSoftCap} pero Autopilot permite hasta hardCap ${policy.hardCap}`,
    });
  } else {
    rulesFired.push({
      id: 'under_soft_cap',
      message: `${invoice.amount} ≤ softCap ${effectiveSoftCap}`,
    });
  }

  const maxMismatch = policy.maxMismatchPercent ?? 5;
  if (
    invoice.agreedAmount !== undefined &&
    invoice.agreedAmount > 0 &&
    Math.abs(invoice.amount - invoice.agreedAmount) / invoice.agreedAmount >
      maxMismatch / 100
  ) {
    const pct =
      (Math.abs(invoice.amount - invoice.agreedAmount) / invoice.agreedAmount) *
      100;
    rulesFired.push({
      id: 'mismatch',
      message: `amount vs agreed Δ ${pct.toFixed(1)}% > ${maxMismatch}%`,
    });
    reasons.push('mismatch');
    return finish('HOLD', rulesFired, reasons, fp, math.ok, payeeNormalized);
  }

  const remaining =
    ctx.remainingBudget ??
    (policy.periodBudget !== undefined
      ? policy.periodBudget - (policy.periodSpent ?? 0)
      : undefined);

  if (remaining !== undefined && invoice.amount > remaining) {
    rulesFired.push({
      id: 'budget_insufficient',
      message: `amount ${invoice.amount} > remainingBudget ${remaining}`,
    });
    reasons.push('budget');
    return finish('HOLD', rulesFired, reasons, fp, math.ok, payeeNormalized);
  }

  // --- ALLOW path ---
  if (mode === 'advise') {
    rulesFired.push({
      id: 'advise_escalate',
      message: 'Advise recomienda PAY pero siempre escala a humano',
    });
    reasons.push('advise');
    return finish(
      'HOLD',
      rulesFired,
      reasons,
      fp,
      math.ok,
      payeeNormalized,
      'PAY',
    );
  }

  // D1 Autonomy window: Assist + Autopilot fuera de horario → HOLD
  const win = policy.autonomyWindow;
  if (win?.enabled) {
    const start = win.startHour ?? 8;
    const end = win.endHour ?? 20;
    const hour = (ctx.now ?? new Date()).getHours();
    const inWindow =
      start === end
        ? true
        : start < end
          ? hour >= start && hour < end
          : hour >= start || hour < end;
    if (!inWindow) {
      rulesFired.push({
        id: 'outside_autonomy_window',
        message: `fuera de ventana ${start}:00–${end}:00 (hora ${hour})`,
      });
      reasons.push('autonomy_window');
      return finish(
        'HOLD',
        rulesFired,
        reasons,
        fp,
        math.ok,
        payeeNormalized,
        'PAY',
      );
    }
    rulesFired.push({
      id: 'autonomy_window_ok',
      message: `dentro de ventana ${start}:00–${end}:00`,
    });
  }

  // assist (≤ soft) | autopilot (≤ hard): PAY
  rulesFired.push({
    id: 'policy_allow',
    message: `${mode} → PAY`,
  });
  reasons.push('allow');
  return finish('PAY', rulesFired, reasons, fp, math.ok, payeeNormalized);
}

function finish(
  outcome: DecisionOutcome,
  rulesFired: RuleFired[],
  reasons: string[],
  fingerprint: string,
  mathOk: boolean,
  payeeNormalized: string,
  recommendedOutcome?: DecisionOutcome,
): EvaluatePolicyResult {
  return {
    outcome,
    rulesFired,
    reasons,
    fingerprint,
    mathOk,
    payeeNormalized,
    recommendedOutcome,
  };
}
