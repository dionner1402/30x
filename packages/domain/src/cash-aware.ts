/**
 * A5 — Cash-aware scheduler (greedy admisible).
 * Elige subconjunto bajo remainingBudget; el resto → deferred (budget_deferred).
 */

export type CashAwareCandidate = {
  id: string;
  amount: number;
  /** ISO date YYYY-MM-DD opcional — más urgente = prioriza */
  dueDate?: string;
  /** Solo entran candidatos ya elegibles para PAY a nivel individual */
  eligible: boolean;
  label?: string;
};

export type CashAwareSelection = {
  id: string;
  amount: number;
  score: number;
  label?: string;
};

export type CashAwareResult = {
  remainingBudget: number;
  selected: CashAwareSelection[];
  deferred: Array<CashAwareSelection & { reason: 'budget_deferred' | 'not_eligible' }>;
  spent: number;
  leftover: number;
};

function daysUntil(dueDate: string | undefined, now: Date): number {
  if (!dueDate) return 365;
  const due = new Date(dueDate + 'T00:00:00Z');
  if (Number.isNaN(due.getTime())) return 365;
  const ms = due.getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

/**
 * Score: urgencia primero; a igual due, montos menores (mejor fill bajo budget).
 * Mayor score = pagar primero.
 */
export function cashAwareScore(
  c: Pick<CashAwareCandidate, 'amount' | 'dueDate'>,
  now: Date = new Date(),
): number {
  const days = daysUntil(c.dueDate, now);
  const urgency = 1_000_000 / (1 + days); // due hoy ≈ 1e6
  return urgency - c.amount; // desempate: más pequeño cabe mejor en el lote
}

/**
 * Greedy v1: filtrar elegibles → ordenar por score desc → añadir si cabe.
 */
export function scheduleCashAware(
  candidates: CashAwareCandidate[],
  remainingBudget: number,
  now: Date = new Date(),
): CashAwareResult {
  const budget = Math.max(0, remainingBudget);
  const deferred: CashAwareResult['deferred'] = [];
  const pool: CashAwareSelection[] = [];

  for (const c of candidates) {
    if (!c.eligible || c.amount <= 0 || !Number.isFinite(c.amount)) {
      deferred.push({
        id: c.id,
        amount: c.amount,
        score: 0,
        label: c.label,
        reason: 'not_eligible',
      });
      continue;
    }
    pool.push({
      id: c.id,
      amount: c.amount,
      score: cashAwareScore(c, now),
      label: c.label,
    });
  }

  pool.sort((a, b) => b.score - a.score || a.amount - b.amount);

  const selected: CashAwareSelection[] = [];
  let spent = 0;
  let left = budget;

  for (const item of pool) {
    if (item.amount <= left) {
      selected.push(item);
      spent += item.amount;
      left -= item.amount;
    } else {
      deferred.push({ ...item, reason: 'budget_deferred' });
    }
  }

  return {
    remainingBudget: budget,
    selected,
    deferred,
    spent,
    leftover: left,
  };
}
