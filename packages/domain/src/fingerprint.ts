import { createHash } from 'node:crypto';
import { normalizeInvoiceNumber, normalizePayee } from './normalize-payee';

export type FingerprintInput = {
  tenantId: string;
  payeeName: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  issueDate?: string;
};

/**
 * A2 — fingerprint anti-duplicado determinista.
 * Mismos inputs canónicos → mismo hash (independiente del LLM).
 */
export function fingerprint(input: FingerprintInput): string {
  const payeeNormalized = normalizePayee(input.payeeName);
  const invoiceNumberNormalized = normalizeInvoiceNumber(input.invoiceNumber);
  const amountCents = Math.round(input.amount * 100);
  const currency = input.currency.trim().toUpperCase();
  const issue = input.issueDate?.trim() ?? '';

  const canonical = [
    input.tenantId.trim().toLowerCase(),
    payeeNormalized,
    invoiceNumberNormalized,
    String(amountCents),
    currency,
    issue,
  ].join('|');

  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
