/**
 * Tags canónicos del brief / fixtures (misma semántica en toda la UI).
 */
export const CANONICAL_TAGS = [
  'happy',
  'duplicate',
  'new_payee',
  'over_soft',
  'over_hard',
  'mismatch',
  'budget',
  'math',
  'injection',
] as const;

export type CanonicalTag = (typeof CANONICAL_TAGS)[number];

const FIXTURE_TAG: Record<string, CanonicalTag> = {
  N01: 'happy',
  N02: 'happy',
  N03: 'happy',
  N04: 'happy',
  N05: 'happy',
  N06: 'happy',
  N07: 'happy',
  N08: 'happy',
  N09: 'happy',
  N10: 'happy',
  N11: 'happy',
  N12: 'happy',
  N13: 'happy',
  N14: 'happy',
  N15: 'happy',
  'T-DUP': 'duplicate',
  'T-NEW': 'new_payee',
  'T-SOFT': 'over_soft',
  'T-OVER': 'over_hard',
  'T-MISMATCH': 'mismatch',
  'T-BUDGET': 'budget',
  'T-MATH': 'math',
  'T-INJECT': 'injection',
  'T-INJECT-BANK': 'injection',
};

/** Quita sufijo demo `-{d|c|u|e2e|fb}…` (o cola alfanumérica larga) del invoiceNumber. */
export function displayInvoiceId(invoiceNumber?: string | null): string {
  if (!invoiceNumber) return '-';
  return invoiceNumber
    .replace(/-(?:[dcu]|e2e|fb)[a-z0-9]+$/i, '')
    .replace(/-[a-z0-9]{10,}$/i, '');
}

export function resolveTag(input: {
  tags?: string[] | null;
  fixtureId?: string | null;
  expectedOutcome?: string | null;
}): CanonicalTag | string {
  const fromFixture = input.fixtureId
    ? FIXTURE_TAG[input.fixtureId]
    : undefined;
  if (fromFixture) return fromFixture;

  const raw = (input.tags ?? [])
    .map((t) => t.trim().toLowerCase())
    .find(Boolean);
  if (raw && (CANONICAL_TAGS as readonly string[]).includes(raw)) {
    return raw as CanonicalTag;
  }
  if (raw) return raw;

  if (input.expectedOutcome === 'PAY') return 'happy';
  return 'fixture';
}

export function tagTone(
  tag: string,
): 'ok' | 'warn' | 'danger' | 'neutral' {
  if (tag === 'happy') return 'ok';
  if (
    tag === 'duplicate' ||
    tag === 'over_hard' ||
    tag === 'math' ||
    tag === 'injection'
  ) {
    return 'danger';
  }
  if (
    tag === 'new_payee' ||
    tag === 'over_soft' ||
    tag === 'mismatch' ||
    tag === 'budget'
  ) {
    return 'warn';
  }
  return 'neutral';
}

/** Etiqueta visible en UI (ES). El id canónico sigue en inglés en datos. */
export function tagLabel(tag: string): string {
  const map: Record<string, string> = {
    happy: 'caso normal',
    duplicate: 'duplicado',
    new_payee: 'proveedor nuevo',
    over_soft: 'sobre tope habitual',
    over_hard: 'sobre el máximo',
    mismatch: 'desfase vs acordado',
    budget: 'presupuesto',
    math: 'cuentas no cuadran',
    injection: 'texto sospechoso',
    fixture: 'demo',
  };
  return map[tag] ?? tag;
}
