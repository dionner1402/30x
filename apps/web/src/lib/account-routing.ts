import type { Invoice, PaymentAccount } from './api';

const USAGES = [
  'services',
  'suppliers',
  'payroll',
  'ops',
  'general',
] as const;

export type AccountUsage = (typeof USAGES)[number];

/** Misma heurística que la API: categoría → uso de cuenta. */
export function usageFromInvoice(
  inv?: Pick<
    Invoice,
    'paymentCategory' | 'tags' | 'payeeName' | 'fixtureId'
  > | null,
): AccountUsage {
  if (!inv) return 'suppliers';
  const cat = inv.paymentCategory?.toLowerCase();
  if (cat && (USAGES as readonly string[]).includes(cat)) {
    return cat as AccountUsage;
  }
  const tags = (inv.tags ?? []).map((t) => t.toLowerCase());
  for (const u of USAGES) {
    if (tags.includes(u)) return u;
  }
  const payee = (inv.payeeName ?? '').toLowerCase();
  if (/nomina|payroll|salary/.test(payee)) return 'payroll';
  if (/cloud|aws|saas|media|signa|didit|dapta|macondo/.test(payee)) {
    return 'services';
  }
  if (/ops|utilities|rent|latam ops/.test(payee)) return 'ops';
  return 'suppliers';
}

export type PickAccountResult = {
  account: PaymentAccount;
  /** Se eligió otra cuenta porque la preferida no cubría el monto */
  balanceFallback: boolean;
  fromLabel?: string;
  covered: boolean;
};

/**
 * Cuenta con saldo: usage preferido → general → otras (prioridad).
 * Si nadie cubre, cae al routing clásico (puede sobregirar en demo).
 */
export function pickPaymentAccount(
  accounts: PaymentAccount[],
  preferred: AccountUsage = 'suppliers',
  amount?: number,
): PickAccountResult | null {
  const active = accounts
    .filter((a) => a.active)
    .slice()
    .sort((a, b) => a.priority - b.priority);
  if (!active.length) return null;

  const need = Number(amount);
  const mustCover = Number.isFinite(need) && need > 0;
  const canPay = (a: PaymentAccount) =>
    !mustCover || Number(a.mockBalance) >= need;

  const preferredList = active.filter((a) => a.usage === preferred);
  const general = active.filter((a) => a.usage === 'general');
  const others = active.filter(
    (a) => a.usage !== preferred && a.usage !== 'general',
  );

  const funded =
    preferredList.find(canPay) ??
    general.find(canPay) ??
    others.find(canPay) ??
    active.find(canPay);

  if (funded) {
    const preferredFirst = preferredList[0];
    const switched = Boolean(
      preferredFirst && preferredFirst.id !== funded.id,
    );
    return {
      account: funded,
      balanceFallback: switched,
      fromLabel: preferredFirst
        ? `${preferredFirst.bank} · ${preferredFirst.name}`
        : undefined,
      covered: true,
    };
  }

  const match = preferredList[0] ?? general[0] ?? active[0];
  if (!match) return null;
  return {
    account: match,
    balanceFallback: false,
    covered: false,
  };
}

export function formatAccountLine(acc: {
  bank: string;
  name: string;
  usage?: string;
}): string {
  return `${acc.bank} · ${acc.name}`;
}
