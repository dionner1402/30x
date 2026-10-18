/**
 * M12 - MockPaymentExecutor: nunca mueve dinero; solo log si PAY.
 */
export function mockExecute(input: {
  outcome: string;
  invoiceId: string;
  amount: number;
  currency: string;
  payeeName: string;
  accountLabel?: string;
}): { wouldPay: boolean; log: string } {
  if (input.outcome !== 'PAY') {
    return {
      wouldPay: false,
      log: `Mock rail omitido: outcome=${input.outcome} (sin pago)`,
    };
  }
  const from = input.accountLabel
    ? ` desde «${input.accountLabel}»`
    : '';
  return {
    wouldPay: true,
    log: `Mock rail · WOULD_PAY · ${input.currency} ${input.amount} → "${input.payeeName}"${from} · invoice …${input.invoiceId.slice(-6)} · sin rail real`,
  };
}
