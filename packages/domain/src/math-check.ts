export type LineItem = { desc?: string; amount: number };

export type MathCheckInput = {
  amount: number;
  lineItems?: LineItem[];
  tax?: number;
  /** Tolerancia absoluta en unidad de moneda (default 0.01) */
  epsilon?: number;
};

export type MathCheckResult = {
  ok: boolean;
  sum: number | null;
  delta: number | null;
  reason: string;
};

/**
 * A3 — Math integrity gate.
 * Sin lineItems: no se puede verificar → ok=true (skip), reason=no_line_items.
 * Con lineItems: sum(+tax) debe coincidir con amount dentro de epsilon.
 */
export function mathCheck(input: MathCheckInput): MathCheckResult {
  const epsilon = input.epsilon ?? 0.01;
  const items = input.lineItems;

  if (!items || items.length === 0) {
    return {
      ok: true,
      sum: null,
      delta: null,
      reason: 'no_line_items',
    };
  }

  const linesSum = items.reduce((acc, item) => acc + item.amount, 0);
  const tax = input.tax ?? 0;
  const sum = roundMoney(linesSum + tax);
  const delta = roundMoney(Math.abs(sum - input.amount));
  const ok = delta <= epsilon;

  return {
    ok,
    sum,
    delta,
    reason: ok ? 'math_ok' : 'math_mismatch',
  };
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}
