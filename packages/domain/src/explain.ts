import type { DecisionOutcome } from '@ezallow/shared';
import type { EvaluatePolicyResult } from './evaluate-policy';

/**
 * A8 - explicación + counterfactual deterministas (sin LLM).
 * Prosa corta para humanos; el detalle auditable vive en rulesFired.
 */
export function buildExplanation(result: EvaluatePolicyResult): string {
  const reasons = new Set(result.reasons);

  if (result.outcome === 'PAY') {
    return 'Autorizado: math, allowlist y caps en orden. El modo de autonomía permite PAY.';
  }

  if (result.outcome === 'HOLD') {
    if (
      result.recommendedOutcome === 'PAY' ||
      reasons.has('advise') ||
      reasons.has('advisor')
    ) {
      return 'Advise recomienda autorizar, pero siempre escala a una persona. No hay auto-pago en este modo.';
    }
    if (reasons.has('new_payee')) {
      return 'En espera: beneficiario nuevo fuera de allowlist. Parece cobro real; no está permitido aún.';
    }
    if (reasons.has('soft_cap')) {
      return 'En espera: el monto supera el soft cap. Requiere revisión humana antes de pagar.';
    }
    if (reasons.has('mismatch')) {
      return 'En espera: el monto no cuadra con lo acordado dentro del margen permitido.';
    }
    if (reasons.has('budget')) {
      return 'En espera: no alcanza el presupuesto restante del periodo.';
    }
    return 'En espera (HOLD): la política pide una persona antes de autorizar.';
  }

  // DENY
  if (reasons.has('untrusted_content')) {
    return 'Denegado: el texto de la factura parece instrucción al agente (inyección / redirect bancario). Fail-closed; reenvía documento limpio.';
  }
  if (reasons.has('math_fail')) {
    return 'Denegado: las líneas + impuesto no cuadran con el total. Fail-closed.';
  }
  if (reasons.has('duplicate')) {
    return 'Denegado por duplicado: firma idéntica a una factura ya vista (fail-closed). No se paga dos veces; un humano puede excepcionar si es falso positivo.';
  }
  if (reasons.has('hard_cap')) {
    return 'Denegado: el monto supera el hard cap. Fuera de política.';
  }
  return 'Denegado: una regla dura de política bloqueó el pago.';
}

export function buildCounterfactual(result: EvaluatePolicyResult): string {
  const reasons = new Set(result.reasons);
  if (result.outcome === 'PAY') {
    return 'Si fallara math, allowlist, soft/hard cap o presupuesto, no habría PAY: HOLD o DENY según la regla.';
  }
  if (reasons.has('untrusted_content')) {
    return 'Si el texto libre no llevara payload de inyección/redirect, se reevaluaría por math, allowlist y caps.';
  }
  if (reasons.has('math_fail')) {
    return 'Si líneas + tax coincidieran con el total, se reevaluaría por allowlist y caps.';
  }
  if (reasons.has('duplicate')) {
    return 'Si los datos clave fueran distintos no habría match. Un humano puede excepcionar el DENY si es falso positivo.';
  }
  if (reasons.has('hard_cap')) {
    return 'Si hardCap ≥ monto y el resto de reglas OK, avanzaría a soft/budget.';
  }
  if (reasons.has('new_payee')) {
    return 'Si el beneficiario estuviera en allowlist y el monto ≤ soft cap, el outcome habría sido PAY.';
  }
  if (reasons.has('soft_cap')) {
    return 'Si softCap ≥ monto (o un humano aprueba), pasaría a PAY.';
  }
  if (reasons.has('mismatch')) {
    return 'Si el monto coincidiera con lo acordado (dentro del % permitido), seguiría el flujo normal.';
  }
  if (reasons.has('budget')) {
    return 'Si remainingBudget ≥ monto, el outcome habría sido PAY (u HOLD por otras reglas).';
  }
  if (reasons.has('advise') || reasons.has('advisor')) {
    return 'En modo Assist o Autopilot, con las mismas reglas, el outcome habría sido PAY.';
  }
  return 'Cambiando la regla que bloqueó el PAY, el outcome podría ser distinto.';
}

export function summarizeOutcome(outcome: DecisionOutcome): string {
  return outcome;
}
