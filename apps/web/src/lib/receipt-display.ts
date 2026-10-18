import type { Decision } from './api';

type Rule = { id: string; message: string };

function money(n: number | string): string {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return String(n);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: v % 1 === 0 ? 0 : 2,
  }).format(v);
}

/**
 * Regla técnica → título + detalle para personal de finanzas (recibo UI).
 * Los ids crudos siguen en el ledger; aquí solo presentamos.
 */
export function humanizeRule(rule: Rule): { title: string; detail: string } {
  const id = rule.id;
  const msg = rule.message ?? '';

  switch (id) {
    case 'math_ok':
      return {
        title: 'Las cuentas cuadran',
        detail: 'Líneas e impuestos coinciden con el total de la factura.',
      };
    case 'math_fail':
    case 'fail_closed_math':
      return {
        title: 'Las cuentas no cuadran',
        detail:
          'Líneas e impuestos no coinciden con el total. Por seguridad no se paga.',
      };
    case 'allowlist_ok':
      return {
        title: 'Proveedor autorizado',
        detail: 'Está en la lista de beneficiarios permitidos por la empresa.',
      };
    case 'block_new_payee':
      return {
        title: 'Proveedor nuevo',
        detail:
          'No está en la lista de autorizados. Hace falta permiso de una persona.',
      };
    case 'standing_authority': {
      const m = msg.match(
        /(\d+)\s*PAY[^\d]*(\d+(?:\.\d+)?)[^\d]*(\d+(?:\.\d+)?)/i,
      );
      if (m) {
        return {
          title: 'Historial de confianza',
          detail: `Ya hay ${m[1]} pagos limpios con este proveedor. El tope de autonomía sube de ${money(m[3])} a ${money(m[2])}.`,
        };
      }
      return {
        title: 'Historial de confianza',
        detail:
          'Por pagos limpios previos, el tope de autonomía se amplió (sigue bajo el máximo de la política).',
      };
    }
    case 'under_soft_cap': {
      const m = msg.match(/(\d+(?:\.\d+)?)\s*≤\s*softCap\s*(\d+(?:\.\d+)?)/i);
      if (m) {
        return {
          title: 'Dentro del tope de autonomía',
          detail: `${money(m[1])} está dentro del límite de ${money(m[2])} para pago automático.`,
        };
      }
      return {
        title: 'Dentro del tope de autonomía',
        detail: 'El monto cabe en el límite para que el agente pague solo.',
      };
    }
    case 'over_soft_cap': {
      const m = msg.match(/(\d+(?:\.\d+)?)\s*>\s*softCap\s*(\d+(?:\.\d+)?)/i);
      if (m) {
        return {
          title: 'Sobre el tope de autonomía',
          detail: `${money(m[1])} supera el límite de ${money(m[2])}. Se pide permiso humano.`,
        };
      }
      return {
        title: 'Sobre el tope de autonomía',
        detail: 'El monto pide revisión de una persona antes de pagar.',
      };
    }
    case 'soft_cap_waived_autopilot': {
      const m = msg.match(
        /(\d+(?:\.\d+)?).*softCap\s*(\d+(?:\.\d+)?).*hardCap\s*(\d+(?:\.\d+)?)/i,
      );
      if (m) {
        return {
          title: 'Autopilot: tope ampliado',
          detail: `${money(m[1])} supera el tope habitual (${money(m[2])}), pero en Autopilot se permite hasta ${money(m[3])}.`,
        };
      }
      return {
        title: 'Autopilot: tope ampliado',
        detail:
          'El monto supera el tope habitual, pero el modo Autopilot permite pagar hasta el máximo de política.',
      };
    }
    case 'hard_cap_exceeded': {
      const m = msg.match(/(\d+(?:\.\d+)?).*hardCap\s*(\d+(?:\.\d+)?)/i);
      if (m) {
        return {
          title: 'Fuera del máximo permitido',
          detail: `${money(m[1])} supera el tope máximo de ${money(m[2])}. No se puede pagar.`,
        };
      }
      return {
        title: 'Fuera del máximo permitido',
        detail: 'El monto supera el tope máximo de la política.',
      };
    }
    case 'duplicate_fingerprint':
    case 'duplicate':
      return {
        title: 'Duplicado (firma idéntica)',
        detail:
          'Misma firma que una ya pagada o vista. Por seguridad se deniega. Si fuera un falso positivo, una persona puede excepcionar.',
      };
    case 'human_override_duplicate':
      return {
        title: 'Excepción humana (falso positivo)',
        detail:
          msg ||
          'Una persona revisó el DENY por duplicado y autorizó el pago de todas formas.',
      };
    case 'mismatch':
      return {
        title: 'Monto distinto a lo acordado',
        detail:
          'La diferencia con lo pactado supera el margen permitido. Requiere revisión.',
      };
    case 'budget_insufficient':
      return {
        title: 'Sin presupuesto suficiente',
        detail: 'No alcanza el presupuesto restante del periodo para este pago.',
      };
    case 'budget_deferred':
      return {
        title: 'Diferido por presupuesto',
        detail:
          'Hay facturas más urgentes o el presupuesto no alcanza; se deja para después.',
      };
    case 'advise_escalate':
    case 'advisor_escalate':
      return {
        title: 'Modo Advise: siempre humano',
        detail:
          'El agente recomienda pagar, pero en Advise nunca paga solo: pide confirmación.',
      };
    case 'policy_allow': {
      const mode = /autopilot/i.test(msg)
        ? 'Autopilot'
        : /assist/i.test(msg)
          ? 'Assist'
          : /advise/i.test(msg)
            ? 'Advise'
            : null;
      return {
        title: 'Autorizado automáticamente',
        detail: mode
          ? `En modo ${mode}, con los chequeos en orden, el agente puede pagar sin pedir permiso.`
          : 'Con los chequeos en orden, el modo de autonomía permite pagar.',
      };
    }
    case 'untrusted_content':
    case 'untrusted_content_injection':
      return {
        title: 'Texto sospechoso en la factura',
        detail:
          'Parece una instrucción al agente o un intento de cambiar datos de pago. Se bloquea por seguridad.',
      };
    case 'outside_autonomy_window':
      return {
        title: 'Fuera de horario de autonomía',
        detail:
          'Fuera de la ventana horaria configurada. Se pide permiso humano.',
      };
    case 'autonomy_window_ok':
      return {
        title: 'Dentro del horario permitido',
        detail: 'La decisión cae en la ventana horaria de autonomía.',
      };
    case 'human_approved':
      return {
        title: 'Permiso humano concedido',
        detail: msg || 'Una persona autorizada aprobó el pago.',
      };
    case 'human_rejected':
      return {
        title: 'Permiso humano denegado',
        detail: msg || 'Una persona autorizada rechazó el pago.',
      };
    case 'fail_closed_error':
      return {
        title: 'Error controlado',
        detail:
          'Hubo un fallo al evaluar. Por seguridad se escaló (nunca se paga por error).',
      };
    default:
      return {
        title: id.replace(/_/g, ' '),
        detail: msg || 'Chequeo de política.',
      };
  }
}

/** Motivo corto para la tabla (como boceto). */
export function motiveFromRules(
  outcome: string,
  rules: Rule[] = [],
  resolvedBy?: { name: string; role?: string } | null,
): string {
  const ids = new Set(rules.map((r) => r.id));

  if (ids.has('human_override_duplicate')) {
    return resolvedBy?.name
      ? `${resolvedBy.name} excepcionó`
      : 'Excepción (FP)';
  }
  if (ids.has('duplicate_fingerprint') || ids.has('duplicate')) {
    return 'Duplicado → DENY';
  }
  if (ids.has('math_fail') || ids.has('fail_closed_math')) {
    return 'Cuentas no cuadran';
  }
  if (ids.has('hard_cap_exceeded')) {
    return 'Sobre el máximo';
  }
  if (ids.has('block_new_payee')) {
    return 'Proveedor nuevo';
  }
  if (ids.has('over_soft_cap')) {
    return 'Pide permiso (monto)';
  }
  if (ids.has('mismatch')) {
    return 'Desfase vs acordado';
  }
  if (ids.has('budget_insufficient') || ids.has('budget_deferred')) {
    return ids.has('budget_deferred')
      ? 'Diferido por presupuesto'
      : 'Sin presupuesto';
  }
  if (ids.has('advise_escalate') || ids.has('advisor_escalate')) {
    return 'Advise → humano';
  }
  if (ids.has('soft_cap_waived_autopilot')) {
    return 'Autopilot · sobre tope habitual';
  }
  if (ids.has('untrusted_content') || ids.has('untrusted_content_injection')) {
    return 'Texto sospechoso';
  }
  if (ids.has('human_approved')) {
    return resolvedBy?.name
      ? `${resolvedBy.name} aprobó`
      : 'Permiso concedido';
  }
  if (ids.has('human_rejected')) {
    return resolvedBy?.name
      ? `${resolvedBy.name} rechazó`
      : 'Permiso denegado';
  }
  if (outcome === 'PAY' && (ids.has('policy_allow') || ids.has('allowlist_ok'))) {
    return 'Autorizado (política OK)';
  }
  if (outcome === 'PAY') return 'Autorizado';
  if (outcome === 'HOLD') return 'Pide permiso';
  if (outcome === 'DENY') return 'Denegado';
  return '-';
}

function reasonsFromRules(rules: Rule[]): Set<string> {
  const s = new Set<string>();
  for (const r of rules) {
    if (r.id === 'math_fail' || r.id === 'fail_closed_math') s.add('math_fail');
    if (r.id === 'duplicate_fingerprint') s.add('duplicate');
    if (r.id === 'hard_cap_exceeded') s.add('hard_cap');
    if (r.id === 'block_new_payee') s.add('new_payee');
    if (r.id === 'over_soft_cap') s.add('soft_cap');
    if (r.id === 'mismatch') s.add('mismatch');
    if (r.id === 'budget_insufficient' || r.id === 'budget_deferred') {
      s.add('budget');
    }
    if (r.id === 'advise_escalate' || r.id === 'advisor_escalate') {
      s.add('advise');
    }
    if (r.id === 'soft_cap_waived_autopilot') s.add('soft_waived');
    if (r.id === 'human_approved') s.add('human_approved');
    if (r.id === 'human_rejected') s.add('human_rejected');
    if (r.id === 'human_override_duplicate') s.add('dup_override');
    if (
      r.id === 'untrusted_content' ||
      r.id === 'untrusted_content_injection'
    ) {
      s.add('untrusted_content');
    }
  }
  return s;
}

const MODE_LABEL: Record<string, string> = {
  advise: 'Advise',
  assist: 'Assist',
  autopilot: 'Autopilot',
  advisor: 'Advise',
  collaborator: 'Assist',
  operator: 'Autopilot',
};

export function autonomyLabel(mode?: string | null): string {
  if (!mode) return '-';
  return MODE_LABEL[mode] ?? mode;
}

/** Versión de política legible (oculta ids e2e feos). */
export function policyVersionLabel(version?: string | null): string {
  if (!version) return '-';
  if (/^e2e/i.test(version)) return 'prueba (e2e)';
  return version;
}

/** Prosa humana siempre fresca (aunque el ledger tenga texto viejo). */
export function displayExplanation(d: Decision): string {
  const reasons = reasonsFromRules(d.rulesFired ?? []);
  const outcome = d.outcome;

  if (outcome === 'PAY') {
    if (reasons.has('dup_override')) {
      const who = d.resolvedBy
        ? d.resolvedBy.role
          ? `${d.resolvedBy.name} (${d.resolvedBy.role})`
          : d.resolvedBy.name
        : 'una persona autorizada';
      return `Autorizado por excepción de ${who}: el motor había denegado por firma idéntica (fail-closed); se trató como falso positivo.`;
    }
    if (reasons.has('human_approved')) {
      const who = d.resolvedBy
        ? d.resolvedBy.role
          ? `${d.resolvedBy.name} (${d.resolvedBy.role})`
          : d.resolvedBy.name
        : 'una persona autorizada';
      return `Autorizado con permiso de ${who}: el agente había pedido confirmación y se concedió el pago.`;
    }
    if (reasons.has('soft_waived')) {
      return 'Autorizado en Autopilot: el monto supera el tope habitual pero cabe en el máximo de la política. Cuentas y proveedor en orden.';
    }
    return 'Autorizado: las cuentas cuadran, el proveedor está permitido y el monto cabe en los límites. El modo de autonomía permite pagar.';
  }
  if (outcome === 'DENY' && reasons.has('human_rejected')) {
    const who = d.resolvedBy
      ? d.resolvedBy.role
        ? `${d.resolvedBy.name} (${d.resolvedBy.role})`
        : d.resolvedBy.name
      : 'una persona autorizada';
    return `Denegado por ${who}: el agente había pedido permiso y se rechazó el pago.`;
  }
  if (outcome === 'HOLD') {
    if (
      d.recommendedOutcome === 'PAY' ||
      reasons.has('advise') ||
      reasons.has('advisor')
    ) {
      return 'El agente recomienda pagar, pero en Advise siempre pide confirmación a una persona.';
    }
    if (reasons.has('new_payee')) {
      return 'En espera: proveedor nuevo, aún no está en la lista de autorizados. Parece un cobro real; falta permiso.';
    }
    if (reasons.has('soft_cap')) {
      return 'En espera: el monto supera el tope de autonomía. Hace falta revisión de una persona.';
    }
    if (reasons.has('mismatch')) {
      return 'En espera: el monto no cuadra con lo acordado dentro del margen permitido.';
    }
    if (reasons.has('budget')) {
      return 'En espera: no alcanza el presupuesto (o hay facturas más urgentes). Se deja para después.';
    }
    return 'En espera: la política pide confirmación de una persona antes de autorizar.';
  }
  if (reasons.has('math_fail')) {
    return 'Denegado: las líneas e impuestos no cuadran con el total. Por seguridad no se paga.';
  }
  if (reasons.has('duplicate')) {
    return 'Denegado por duplicado: firma idéntica a una factura ya vista (fail-closed). No se paga dos veces, salvo que una persona excepcione por falso positivo.';
  }
  if (reasons.has('hard_cap')) {
    return 'Denegado: el monto supera el máximo permitido por la política.';
  }
  if (reasons.has('untrusted_content')) {
    return 'Denegado: el texto de la factura parece manipulación. Por seguridad no se paga.';
  }
  return 'Denegado: una regla de política bloqueó el pago.';
}

export function displayCounterfactual(d: Decision): string {
  const reasons = reasonsFromRules(d.rulesFired ?? []);
  if (d.outcome === 'PAY') {
    return 'Si las cuentas no cuadraran, el proveedor no estuviera autorizado, o el monto se saliera de los límites / presupuesto, no se habría pagado: se pediría permiso o se denegaría.';
  }
  if (reasons.has('math_fail')) {
    return 'Si líneas e impuestos coincidieran con el total, se seguiría revisando proveedor y montos.';
  }
  if (reasons.has('duplicate')) {
    return 'Si los datos clave fueran distintos no habría match. Si un humano excepciona (falso positivo), el resultado sería PAY.';
  }
  if (reasons.has('hard_cap')) {
    return 'Si el máximo de política cubriera el monto y el resto estuviera en orden, podría autorizarse.';
  }
  if (reasons.has('new_payee')) {
    return 'Si el proveedor estuviera en la lista de autorizados y el monto cupiera en el tope, el agente habría podido pagar.';
  }
  if (reasons.has('soft_cap')) {
    return 'Si el monto cupiera en el tope, estuvieras en Autopilot, o una persona aprobara, se pagaría.';
  }
  if (reasons.has('mismatch')) {
    return 'Si el monto coincidiera con lo acordado (dentro del margen), seguiría el flujo normal.';
  }
  if (reasons.has('budget')) {
    return 'Con más presupuesto (o sin diferir otras facturas), podría haberse pagado.';
  }
  if (reasons.has('advise') || reasons.has('advisor')) {
    return 'En Assist o Autopilot, con las mismas comprobaciones, el agente habría pagado solo.';
  }
  return (
    d.counterfactual ||
    'Si cambiara la condición que bloqueó el pago, el resultado podría ser distinto.'
  );
}

/** Texto del rail mock para humanos (sin WOULD_PAY / ids). */
export function displayMockRail(d: Decision): string | null {
  const m = d.mockExecution;
  if (!m) return null;
  if (!m.wouldPay) {
    return 'No se simula envío al banco: esta decisión no autoriza pago.';
  }
  const acct = d.paymentAccount?.label
    ? ` desde «${d.paymentAccount.label}»`
    : '';
  return `Simulación: se habría enviado el pago${acct}. EzAllow no mueve dinero: el rail real (Blinka u otro) ejecutaría después.`;
}
