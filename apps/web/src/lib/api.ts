/**
 * Por defecto la UI llama a `{basePath}/backend/*` (rewrite Next → Nest).
 * Así evitamos CORS. En prod (dgartech.com/30x-EzAllow) basePath aplica.
 * Override: NEXT_PUBLIC_API_URL=http://localhost:3001
 */
const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/$/, '');
const API =
  process.env.NEXT_PUBLIC_API_URL ?? `${BASE_PATH}/backend`;
const TENANT = process.env.NEXT_PUBLIC_TENANT_ID ?? 'blinka-demo';

async function req<T>(
  path: string,
  init?: RequestInit & { idempotencyKey?: string },
): Promise<T> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-tenant-id': TENANT,
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (init?.idempotencyKey) {
    headers['idempotency-key'] = init.idempotencyKey;
  }

  const res = await fetch(`${API}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

export type PolicyWarning = {
  id: string;
  severity: 'low' | 'medium' | 'high';
  message: string;
};

export type Policy = {
  id: string;
  version: string;
  status: string;
  allowlistPayees: string[];
  hardCap: number;
  softCap: number;
  blockNewPayees: boolean;
  maxMismatchPercent: number;
  periodBudget: number;
  currency: string;
  allowFuzzyPayeeMatch?: boolean;
  trustLadderEnabled?: boolean;
  trustMinCleanPays?: number;
  trustSoftCapBoost?: number;
  autonomyWindowEnabled?: boolean;
  autonomyStartHour?: number;
  autonomyEndHour?: number;
  warnings?: PolicyWarning[];
};

export type PolicySuggestion = {
  kind: 'add_allowlist';
  payeeName: string;
  payeeNormalized?: string;
};

export type Tenant = {
  slug: string;
  name: string;
  autonomyMode: 'advise' | 'assist' | 'autopilot';
  activePolicyId: string | null;
};

export type Invoice = {
  id: string;
  fixtureId?: string;
  source?: string;
  payeeName: string;
  amount: number;
  currency: string;
  invoiceNumber: string;
  /** Fecha de emisión en el PDF / fixture */
  issueDate?: string;
  dueDate?: string;
  /** Cuándo entró a la bandeja (recibida en el sistema) */
  createdAt?: string;
  mathOk: boolean;
  status: string;
  tags?: string[];
  /** Categoría de gasto → banco (services/suppliers/payroll/ops/general) */
  paymentCategory?: string;
  expectedOutcome?: string;
};

export type BatchPlan = {
  remainingBudget: number;
  spent: number;
  leftover: number;
  selected: Array<{ id: string; amount: number; score: number; label?: string }>;
  deferred: Array<{
    id: string;
    amount: number;
    score: number;
    label?: string;
    reason: string;
  }>;
};

export type BatchResult = {
  commit: boolean;
  plan: BatchPlan;
  decisions: Decision[];
};

export type PaymentAccountRef = {
  accountId: string;
  bank: string;
  name: string;
  usage: string;
  priority: number;
  label: string;
  /** Monto descontado del saldo mock al PAY */
  debited?: number;
  /** Si la cuenta preferida no tenía saldo, se usó otra */
  routing?: {
    preferredUsage?: string;
    matchedUsage?: boolean;
    balanceFallback?: boolean;
    covered?: boolean;
    fromLabel?: string;
  };
};

export type PaymentAccount = {
  id: string;
  name: string;
  bank: string;
  usage: string;
  priority: number;
  currency: string;
  active: boolean;
  mockBalance: number;
};

export type Decision = {
  id: string;
  invoiceId: string;
  outcome: 'PAY' | 'HOLD' | 'DENY';
  explanation: string;
  counterfactual?: string;
  receiptHash: string;
  policyVersion: string;
  rulesFired: Array<{ id: string; message: string }>;
  recommendedOutcome?: 'PAY' | 'HOLD' | 'DENY';
  mockExecution?: { wouldPay: boolean; log: string };
  autonomyMode: string;
  evidence?: Record<string, unknown>;
  /** HOLD pendiente de permiso humano */
  awaitingHuman?: boolean;
  /** DENY por duplicado: se puede excepcionar si es falso positivo */
  canOverrideDuplicate?: boolean;
  resolvedByDecisionId?: string;
  /** Quién concedió/denegó el permiso */
  resolvedBy?: { id?: string; name: string; role?: string };
  paymentAccount?: PaymentAccountRef;
  reconcileStatus?: string;
  createdAt?: string;
  /** D3 - tras aprobar new_payee */
  policySuggestion?: PolicySuggestion;
};

export type ReviewInboxResult = {
  reviewed: number;
  pendingFound?: number;
  tally: { PAY: number; HOLD: number; DENY: number };
  decisions: Decision[];
  message: string;
};

export type AgentWave = {
  id: string;
  label: string;
  timeLocal: string;
  categories: string[];
};

export type AgentSchedule = {
  waves: AgentWave[];
  autonomyMode: string;
  hint: string;
};

export type AgentRunResult = {
  id?: string;
  tenantId: string;
  autonomyMode: string;
  waves: Array<{
    waveId: string;
    label: string;
    timeLocal: string;
    reviewed: number;
    tally: { PAY: number; HOLD: number; DENY: number };
  }>;
  totals: { PAY: number; HOLD: number; DENY: number };
  message: string;
  createdAt?: string;
};

export type EvalResult = {
  id?: string;
  metrics: {
    total: number;
    passed: number;
    falsePay: number;
    falseDeny: number;
    accuracy: number;
    autonomyRate: number;
  };
  passedGate: boolean;
  gate: string;
  cases: Array<{
    fixtureId: string;
    tags?: string[];
    expected: string;
    actual: string;
    ok: boolean;
    falsePay?: boolean;
  }>;
  createdAt?: string;
};

export const api = {
  health: () => req<{ ok: boolean; mongo?: { db?: string } }>('/health'),
  tenant: () => req<Tenant>('/v1/tenants/me'),
  patchTenant: (body: { autonomyMode: Tenant['autonomyMode'] }) =>
    req<Tenant>('/v1/tenants/me', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  resetDemo: () =>
    req<{
      ok: boolean;
      message: string;
      deleted: { invoices: number; decisions: number; evalRuns: number };
    }>('/v1/tenants/me/reset-demo', { method: 'POST' }),
  policyActive: () => req<Policy>('/v1/policies/active'),
  createPolicy: (body: Record<string, unknown>) =>
    req<Policy>('/v1/policies', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  activatePolicy: (id: string, opts?: { force?: boolean }) =>
    req<Policy>(`/v1/policies/${id}/activate`, {
      method: 'POST',
      body: JSON.stringify({ force: Boolean(opts?.force) }),
    }),
  analyzePolicy: (body: Record<string, unknown>) =>
    req<{ warnings: PolicyWarning[]; blocked: boolean }>('/v1/policies/analyze', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  promotePayee: (payeeName: string) =>
    req<{
      ok: boolean;
      already: boolean;
      message: string;
      policy: Policy;
    }>('/v1/policies/active/promote-payee', {
      method: 'POST',
      body: JSON.stringify({ payeeName }),
    }),
  fixtures: () => req<{ fixtures: string[] }>('/v1/invoices/fixtures'),
  invoices: () => req<Invoice[]>('/v1/invoices'),
  fromFixture: (fixtureId: string, opts?: { uniqueSuffix?: string }) =>
    req<Invoice>('/v1/invoices/from-fixture', {
      method: 'POST',
      body: JSON.stringify({
        fixtureId,
        ...(opts?.uniqueSuffix ? { uniqueSuffix: opts.uniqueSuffix } : {}),
      }),
    }),
  setInvoiceCategory: (id: string, paymentCategory: string) =>
    req<Invoice>(`/v1/invoices/${id}/category`, {
      method: 'PATCH',
      body: JSON.stringify({ paymentCategory }),
    }),
  decide: (invoiceId: string) =>
    req<Decision>('/v1/decisions', {
      method: 'POST',
      body: JSON.stringify({ invoiceId }),
      idempotencyKey:
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `demo-${Date.now()}`,
    }),
  decideBatch: (body: {
    invoiceIds: string[];
    remainingBudget: number;
    commit?: boolean;
  }) =>
    req<BatchResult>('/v1/decisions/batch', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  reviewInbox: (opts?: {
    invoiceIds?: string[];
    paymentCategories?: string[];
  }) =>
    req<ReviewInboxResult>('/v1/decisions/review-inbox', {
      method: 'POST',
      body: JSON.stringify(opts ?? {}),
    }),
  agentSchedule: () => req<AgentSchedule>('/v1/agent/schedule'),
  patchAgentSchedule: (waves: AgentWave[]) =>
    req<AgentSchedule>('/v1/agent/schedule', {
      method: 'PATCH',
      body: JSON.stringify({ waves }),
    }),
  agentRun: () =>
    req<AgentRunResult>('/v1/agent/runs', { method: 'POST' }),
  agentRunLatest: () =>
    req<AgentRunResult | null>('/v1/agent/runs/latest').catch(() => null),
  resolveDecision: (
    id: string,
    action: 'approve' | 'reject',
    resolvedBy?: { id?: string; name: string; role?: string },
  ) =>
    req<Decision>(`/v1/decisions/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ action, resolvedBy }),
      idempotencyKey:
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `resolve-${Date.now()}`,
    }),
  resolveBatch: (body: {
    decisionIds: string[];
    action: 'approve' | 'reject';
    resolvedBy?: { id?: string; name: string; role?: string };
  }) =>
    req<{
      reviewed: number;
      failed: number;
      message: string;
      decisions: Decision[];
      promotePayees: string[];
    }>('/v1/decisions/resolve-batch', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  reconcileDecision: (id: string) =>
    req<Decision>(`/v1/decisions/${id}/reconcile`, { method: 'POST' }),
  decisions: (outcome?: string) =>
    req<Decision[]>(
      outcome ? `/v1/decisions?outcome=${outcome}` : '/v1/decisions',
    ),
  decision: (id: string) => req<Decision>(`/v1/decisions/${id}`),
  accounts: () => req<PaymentAccount[]>('/v1/accounts'),
  createAccount: (body: {
    name: string;
    bank: string;
    usage: string;
    priority?: number;
    mockBalance?: number;
  }) =>
    req<PaymentAccount>('/v1/accounts', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  patchAccount: (
    id: string,
    body: Partial<{
      priority: number;
      active: boolean;
      mockBalance: number;
      name: string;
      usage: string;
    }>,
  ) =>
    req<PaymentAccount>(`/v1/accounts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  evalRun: () => req<EvalResult>('/v1/eval/runs', { method: 'POST' }),
  evalLatest: () =>
    req<EvalResult | null>('/v1/eval/runs/latest').catch(() => null),
};
