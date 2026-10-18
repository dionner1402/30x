export { mathCheck } from './math-check';
export type { LineItem, MathCheckInput, MathCheckResult } from './math-check';

export { fingerprint } from './fingerprint';
export type { FingerprintInput } from './fingerprint';

export { normalizePayee, normalizeInvoiceNumber } from './normalize-payee';

export { evaluatePolicy } from './evaluate-policy';
export type {
  PolicyInput,
  InvoiceInput,
  PolicyContext,
  EvaluatePolicyResult,
  RuleFired as DomainRuleFired,
} from './evaluate-policy';

export { buildExplanation, buildCounterfactual } from './explain';
export { receiptHash } from './receipt-hash';
export type { ReceiptHashInput } from './receipt-hash';

export { scheduleCashAware, cashAwareScore } from './cash-aware';
export type {
  CashAwareCandidate,
  CashAwareResult,
  CashAwareSelection,
} from './cash-aware';

export { analyzePolicy, hasHighSeverity } from './analyze-policy';
export type {
  AnalyzePolicyInput,
  PolicyWarning,
  PolicyWarningSeverity,
} from './analyze-policy';

export {
  detectInjectionSignals,
  scanInvoiceUntrustedContent,
  isUnsafePayeeName,
} from './untrusted-content';
export type {
  InjectionHit,
  UntrustedScanResult,
  InvoiceTextFields,
} from './untrusted-content';



