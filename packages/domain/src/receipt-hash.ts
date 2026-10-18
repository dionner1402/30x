import { createHash } from 'node:crypto';
import type { DecisionOutcome } from '@ezallow/shared';

export type ReceiptHashInput = {
  tenantId: string;
  invoiceId: string;
  policyVersion: string;
  outcome: DecisionOutcome;
  autonomyMode: string;
  fingerprint: string;
  idempotencyKey: string;
  rulesFired: Array<{ id: string; message: string }>;
};

/**
 * A6 — hash del receipt (integridad / reproducibilidad).
 */
export function receiptHash(input: ReceiptHashInput): string {
  const canonical = JSON.stringify({
    tenantId: input.tenantId,
    invoiceId: input.invoiceId,
    policyVersion: input.policyVersion,
    outcome: input.outcome,
    autonomyMode: input.autonomyMode,
    fingerprint: input.fingerprint,
    idempotencyKey: input.idempotencyKey,
    rulesFired: input.rulesFired,
  });
  return 'sha256:' + createHash('sha256').update(canonical, 'utf8').digest('hex');
}
