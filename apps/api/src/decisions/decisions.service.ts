import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  buildCounterfactual,
  buildExplanation,
  evaluatePolicy,
  normalizePayee,
  receiptHash,
  scheduleCashAware,
} from '@ezallow/domain';
import { normalizeAutonomyMode } from '@ezallow/shared';
import { AccountsService } from '../accounts/accounts.service';
import { Invoice, InvoiceDocument } from '../invoices/invoice.schema';
import { Policy, PolicyDocument } from '../policies/policy.schema';
import { Tenant, TenantDocument } from '../tenants/tenant.schema';
import { Decision, DecisionDocument } from './decision.schema';
import { mockExecute } from './mock-executor';
import { randomUUID } from 'node:crypto';

type DecideBatchCtx = {
  tenant: TenantDocument;
  policy: PolicyDocument;
  knownFingerprints: Set<string>;
  cleanPayCache: Map<string, number>;
  accountRows: Awaited<ReturnType<AccountsService['listActiveLean']>>;
  balances: Map<string, number>;
  pendingDebits: Array<{ accountId: string; amount: number }>;
  skipIdempotencyCheck?: boolean;
};

type ResolveBatchCtx = {
  tenant: TenantDocument;
  policy: PolicyDocument;
  accountRows: Awaited<ReturnType<AccountsService['listActiveLean']>>;
  balances: Map<string, number>;
  pendingDebits: Array<{ accountId: string; amount: number }>;
};

@Injectable()
export class DecisionsService {
  constructor(
    @InjectModel(Decision.name) private readonly decisions: Model<DecisionDocument>,
    @InjectModel(Invoice.name) private readonly invoices: Model<InvoiceDocument>,
    @InjectModel(Policy.name) private readonly policies: Model<PolicyDocument>,
    @InjectModel(Tenant.name) private readonly tenants: Model<TenantDocument>,
    private readonly accounts: AccountsService,
  ) {}

  /** D1 - PAY autónomos previos del mismo beneficiario (sin human_approved). */
  private async countCleanPays(
    tenantId: string,
    payeeName: string,
  ): Promise<number> {
    const norm = normalizePayee(payeeName);
    const invs = await this.invoices
      .find({ tenantId, payeeNormalized: norm })
      .select('_id')
      .lean();
    if (!invs.length) return 0;
    const ids = invs.map((i) => String(i._id));
    const pays = await this.decisions
      .find({ tenantId, outcome: 'PAY', invoiceId: { $in: ids } })
      .select('rulesFired')
      .lean();
    return pays.filter(
      (d) =>
        !(d.rulesFired ?? []).some(
          (r: { id?: string }) => r.id === 'human_approved',
        ),
    ).length;
  }

  private policyInputFromDoc(policy: PolicyDocument) {
    const p = policy as PolicyDocument & {
      trustLadderEnabled?: boolean;
      trustMinCleanPays?: number;
      trustSoftCapBoost?: number;
      autonomyWindowEnabled?: boolean;
      autonomyStartHour?: number;
      autonomyEndHour?: number;
    };
    return {
      allowlistPayees: p.allowlistPayees,
      hardCap: p.hardCap,
      softCap: p.softCap,
      periodBudget: p.periodBudget,
      blockNewPayees: p.blockNewPayees,
      maxMismatchPercent: p.maxMismatchPercent,
      allowFuzzyPayeeMatch: p.allowFuzzyPayeeMatch,
      currency: p.currency,
      trustLadder: {
        enabled: p.trustLadderEnabled !== false,
        minCleanPays: p.trustMinCleanPays ?? 3,
        softCapBoost: p.trustSoftCapBoost ?? 2,
      },
      autonomyWindow: p.autonomyWindowEnabled
        ? {
            enabled: true,
            startHour: p.autonomyStartHour ?? 8,
            endHour: p.autonomyEndHour ?? 20,
          }
        : undefined,
    };
  }

  private async attachPaymentAccount(
    invoice: {
      tags?: string[];
      fixtureId?: string;
      payeeName?: string;
      paymentCategory?: string;
      tenantId: string;
      amount: number;
    },
    batch?: DecideBatchCtx,
  ) {
    const usage = this.accounts.usageFromInvoice({
      paymentCategory: invoice.paymentCategory,
      tags: invoice.tags,
      fixtureId: invoice.fixtureId,
      payeeName: invoice.payeeName,
    });

    if (batch?.accountRows?.length) {
      const account = this.accounts.pickFromCached(
        batch.accountRows,
        batch.balances,
        usage,
        invoice.amount,
      );
      if (!account) return undefined;
      const prev = batch.balances.get(account.id) ?? account.mockBalance;
      batch.balances.set(
        account.id,
        Math.round((prev - invoice.amount) * 100) / 100,
      );
      batch.pendingDebits.push({
        accountId: account.id,
        amount: invoice.amount,
      });
      return {
        accountId: account.id,
        bank: account.bank,
        name: account.name,
        usage: account.usage,
        priority: account.priority,
        label: `${account.bank} · ${account.name}`,
        debited: invoice.amount,
        routing: account.routing,
      };
    }

    const account = await this.accounts.pickForPayment(
      invoice.tenantId,
      usage,
      invoice.amount,
    );
    if (!account) return undefined;
    await this.accounts.debit(invoice.tenantId, account.id, invoice.amount);
    const routing = (
      account as {
        routing?: {
          preferredUsage?: string;
          matchedUsage?: boolean;
          balanceFallback?: boolean;
          covered?: boolean;
          fromLabel?: string;
        };
      }
    ).routing;
    return {
      accountId: account.id,
      bank: account.bank,
      name: account.name,
      usage: account.usage,
      priority: account.priority,
      label: `${account.bank} · ${account.name}`,
      debited: invoice.amount,
      ...(routing
        ? {
            routing: {
              preferredUsage: routing.preferredUsage,
              matchedUsage: routing.matchedUsage,
              balanceFallback: routing.balanceFallback,
              covered: routing.covered,
              fromLabel: routing.fromLabel,
            },
          }
        : {}),
    };
  }

  /**
   * Cache de lote (review-inbox / agent runs): evita N× round-trips a Mongo
   * (tenant, policy, fingerprints, trust, cuentas) - crítico con Atlas vía SOCKS.
   */
  private async buildDecideBatch(tenantId: string): Promise<DecideBatchCtx> {
    const tenant = await this.tenants.findOne({ slug: tenantId });
    if (!tenant?.activePolicyId) {
      throw new NotFoundException('No active policy for tenant');
    }
    const policy = await this.policies.findById(tenant.activePolicyId);
    if (!policy) throw new NotFoundException('Active policy not found');

    const [prior, accountRows] = await Promise.all([
      this.decisions
        .find({ tenantId, fingerprint: { $exists: true } })
        .select('fingerprint')
        .lean(),
      this.accounts.listActiveLean(tenantId),
    ]);
    const knownFingerprints = new Set(
      prior.map((p) => p.fingerprint).filter((f): f is string => !!f),
    );
    const balances = new Map(
      accountRows.map((a) => [a._id.toString(), Number(a.mockBalance)]),
    );

    return {
      tenant,
      policy,
      knownFingerprints,
      cleanPayCache: new Map(),
      accountRows,
      balances,
      pendingDebits: [],
      skipIdempotencyCheck: true,
    };
  }

  async decide(
    tenantId: string,
    invoiceId: string,
    idempotencyKey: string,
    batch?: DecideBatchCtx,
    invoiceDoc?: InvoiceDocument,
  ) {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    if (!invoiceId?.trim()) {
      throw new BadRequestException('invoiceId is required');
    }

    if (!batch?.skipIdempotencyCheck) {
      const existing = await this.decisions
        .findOne({ idempotencyKey: idempotencyKey.trim() })
        .lean();
      if (existing) {
        if (existing.tenantId !== tenantId || existing.invoiceId !== invoiceId) {
          throw new BadRequestException(
            'Idempotency-Key already used for a different decision',
          );
        }
        return this.toDto(existing);
      }
    }

    const invoice =
      invoiceDoc ??
      (await this.invoices.findOne({ _id: invoiceId, tenantId }));
    if (!invoice) throw new NotFoundException('Invoice not found');

    const tenant =
      batch?.tenant ?? (await this.tenants.findOne({ slug: tenantId }));
    if (!tenant?.activePolicyId) {
      throw new NotFoundException('No active policy for tenant');
    }
    const policy =
      batch?.policy ?? (await this.policies.findById(tenant.activePolicyId));
    if (!policy) throw new NotFoundException('Active policy not found');

    // Fingerprints ya decididos (anti-duplicado)
    let knownFingerprints: string[];
    if (batch) {
      knownFingerprints = [...batch.knownFingerprints];
    } else {
      const prior = await this.decisions
        .find({ tenantId, fingerprint: { $exists: true } })
        .select('fingerprint')
        .lean();
      knownFingerprints = prior
        .map((p) => p.fingerprint)
        .filter((f): f is string => !!f);
    }

    const payeeKey = normalizePayee(invoice.payeeName);
    let payeeCleanPayCount: number;
    if (batch) {
      const cached = batch.cleanPayCache.get(payeeKey);
      if (cached !== undefined) {
        payeeCleanPayCount = cached;
      } else {
        payeeCleanPayCount = await this.countCleanPays(
          tenantId,
          invoice.payeeName,
        );
        batch.cleanPayCache.set(payeeKey, payeeCleanPayCount);
      }
    } else {
      payeeCleanPayCount = await this.countCleanPays(
        tenantId,
        invoice.payeeName,
      );
    }

    try {
      const evaluated = evaluatePolicy(
        {
          tenantId: invoice.tenantId,
          payeeName: invoice.payeeName,
          amount: invoice.amount,
          currency: invoice.currency,
          invoiceNumber: invoice.invoiceNumber,
          issueDate: invoice.issueDate,
          lineItems: invoice.lineItems,
          tax: invoice.tax,
          agreedAmount: invoice.agreedAmount,
        },
        this.policyInputFromDoc(policy),
        {
          autonomyMode: normalizeAutonomyMode(tenant.autonomyMode),
          knownFingerprints,
          remainingBudget: invoice.decisionHints?.remainingBudget,
          payeeCleanPayCount,
        },
      );

      // Fail-closed: nunca PAY si mathOk false
      let outcome = evaluated.outcome;
      if (!evaluated.mathOk && outcome === 'PAY') {
        outcome = 'DENY';
        evaluated.rulesFired.push({
          id: 'fail_closed_math',
          message: 'mathOk=false → forzado DENY',
        });
      }

      const autonomyMode = normalizeAutonomyMode(tenant.autonomyMode);
      const explanation = buildExplanation({ ...evaluated, outcome });
      const counterfactual = buildCounterfactual({ ...evaluated, outcome });
      const hash = receiptHash({
        tenantId,
        invoiceId: invoice.id,
        policyVersion: policy.version,
        outcome,
        autonomyMode,
        fingerprint: evaluated.fingerprint,
        idempotencyKey: idempotencyKey.trim(),
        rulesFired: evaluated.rulesFired,
      });

      const paymentAccount =
        outcome === 'PAY'
          ? await this.attachPaymentAccount(
              {
                tenantId,
                tags: invoice.tags,
                fixtureId: invoice.fixtureId,
                payeeName: invoice.payeeName,
                paymentCategory: invoice.paymentCategory,
                amount: invoice.amount,
              },
              batch,
            )
          : undefined;

      const mockExecution = mockExecute({
        outcome,
        invoiceId: invoice.id,
        amount: invoice.amount,
        currency: invoice.currency,
        payeeName: invoice.payeeName,
        accountLabel: paymentAccount?.label,
      });

      const created = await this.decisions.create({
        tenantId,
        invoiceId: invoice.id,
        policyId: policy.id,
        policyVersion: policy.version,
        outcome,
        autonomyMode,
        rulesFired: evaluated.rulesFired,
        evidence: {
          reasons: evaluated.reasons,
          mathOk: evaluated.mathOk,
          payeeNormalized: evaluated.payeeNormalized,
          recommendedOutcome: evaluated.recommendedOutcome,
          ...(paymentAccount ? { paymentAccount } : {}),
          ...(outcome === 'PAY'
            ? { reconcileStatus: 'pending' as const }
            : {}),
        },
        explanation,
        counterfactual,
        receiptHash: hash,
        idempotencyKey: idempotencyKey.trim(),
        fingerprint: evaluated.fingerprint,
        recommendedOutcome: evaluated.recommendedOutcome,
        mockExecution,
      });

      invoice.status = 'decided';
      await invoice.save();

      if (batch && evaluated.fingerprint) {
        batch.knownFingerprints.add(evaluated.fingerprint);
      }

      return this.toDto(created.toObject());
    } catch (err) {
      // Fail-closed: error no controlado → HOLD, nunca PAY
      const explanation =
        'Fail-closed: error en evaluación → HOLD (nunca PAY por excepción).';
      const autonomyMode = normalizeAutonomyMode(tenant.autonomyMode);
      const hash = receiptHash({
        tenantId,
        invoiceId: invoice.id,
        policyVersion: policy.version,
        outcome: 'HOLD',
        autonomyMode,
        fingerprint: invoice.fingerprint,
        idempotencyKey: idempotencyKey.trim(),
        rulesFired: [{ id: 'fail_closed_error', message: String(err) }],
      });
      const created = await this.decisions.create({
        tenantId,
        invoiceId: invoice.id,
        policyId: policy.id,
        policyVersion: policy.version,
        outcome: 'HOLD',
        autonomyMode,
        rulesFired: [{ id: 'fail_closed_error', message: String(err) }],
        evidence: { error: String(err) },
        explanation,
        counterfactual: 'Tras resolver el error, reintentar la decisión.',
        receiptHash: hash,
        idempotencyKey: idempotencyKey.trim(),
        fingerprint: invoice.fingerprint,
        mockExecution: mockExecute({
          outcome: 'HOLD',
          invoiceId: invoice.id,
          amount: invoice.amount,
          currency: invoice.currency,
          payeeName: invoice.payeeName,
        }),
      });
      if (batch && invoice.fingerprint) {
        batch.knownFingerprints.add(invoice.fingerprint);
      }
      return this.toDto(created.toObject());
    }
  }

  /**
   * A5 - batch cash-aware: elige subconjunto bajo budget; resto → HOLD budget_deferred.
   */
  async batch(
    tenantId: string,
    body: {
      invoiceIds?: string[];
      remainingBudget?: number;
      commit?: boolean;
    },
  ) {
    const ids = (body.invoiceIds ?? []).map((x) => String(x).trim()).filter(Boolean);
    if (!ids.length) {
      throw new BadRequestException('invoiceIds is required');
    }
    const remainingBudget = Number(body.remainingBudget);
    if (!Number.isFinite(remainingBudget) || remainingBudget < 0) {
      throw new BadRequestException('remainingBudget must be a number ≥ 0');
    }
    // Preview por defecto; commit solo si el cliente lo pide explícito
    const commit = body.commit === true;

    const tenant = await this.tenants.findOne({ slug: tenantId });
    if (!tenant?.activePolicyId) {
      throw new NotFoundException('No active policy for tenant');
    }
    const policy = await this.policies.findById(tenant.activePolicyId);
    if (!policy) throw new NotFoundException('Active policy not found');

    const prior = await this.decisions
      .find({ tenantId, fingerprint: { $exists: true } })
      .select('fingerprint')
      .lean();
    const knownFingerprints = prior
      .map((p) => p.fingerprint)
      .filter((f): f is string => !!f);

    const invoices = await this.invoices
      .find({ _id: { $in: ids }, tenantId, status: { $ne: 'decided' } })
      .lean();
    const byId = new Map(invoices.map((i) => [i._id.toString(), i]));

    const candidates: Array<{
      id: string;
      amount: number;
      dueDate?: string;
      eligible: boolean;
      label: string;
    }> = [];
    for (const id of ids) {
      const inv = byId.get(id);
      if (!inv) {
        candidates.push({
          id,
          amount: 0,
          eligible: false,
          label: 'missing_or_decided',
        });
        continue;
      }
      // Elegibilidad = policy ALLOW bajo Autopilot (probe); el scheduler elige el subconjunto
      const payeeCleanPayCount = await this.countCleanPays(
        tenantId,
        inv.payeeName,
      );
      const probe = evaluatePolicy(
        {
          tenantId: inv.tenantId,
          payeeName: inv.payeeName,
          amount: inv.amount,
          currency: inv.currency,
          invoiceNumber: inv.invoiceNumber,
          issueDate: inv.issueDate,
          lineItems: inv.lineItems,
          tax: inv.tax,
          agreedAmount: inv.agreedAmount,
        },
        this.policyInputFromDoc(policy),
        {
          autonomyMode: 'autopilot',
          knownFingerprints,
          payeeCleanPayCount,
        },
      );
      candidates.push({
        id,
        amount: inv.amount,
        dueDate: inv.dueDate,
        eligible: probe.outcome === 'PAY',
        label: inv.fixtureId ?? inv.payeeName,
      });
    }

    const plan = scheduleCashAware(candidates, remainingBudget);

    if (!commit) {
      return { commit: false, plan, decisions: [] as unknown[] };
    }

    // Probe usa Autopilot; el commit debe coincidir
    // (si el tenant está en Advise, decide() convertiría todo en HOLD).
    const prevMode = tenant.autonomyMode;
    const needSwitch = prevMode !== 'autopilot' && prevMode !== 'operator';
    if (needSwitch) {
      tenant.autonomyMode = 'autopilot';
      await tenant.save();
    }

    const decisions: unknown[] = [];
    try {
      for (const sel of plan.selected) {
        decisions.push(
          await this.decide(tenantId, sel.id, `batch-${randomUUID()}`),
        );
      }
      for (const def of plan.deferred) {
        if (def.reason === 'not_eligible') {
          // Decisión normal (HOLD/DENY) para no dejar facturas huérfanas en demo
          if (byId.has(def.id)) {
            decisions.push(
              await this.decide(tenantId, def.id, `batch-${randomUUID()}`),
            );
          }
          continue;
        }
        // budget_deferred → HOLD forzado con explicación cash-aware
        decisions.push(
          await this.holdBudgetDeferred(
            tenantId,
            def.id,
            remainingBudget,
            plan,
          ),
        );
      }
    } finally {
      if (needSwitch) {
        tenant.autonomyMode = prevMode;
        await tenant.save();
      }
    }

    return { commit: true, plan, decisions };
  }

  private async holdBudgetDeferred(
    tenantId: string,
    invoiceId: string,
    remainingBudget: number,
    plan: ReturnType<typeof scheduleCashAware>,
  ) {
    const invoice = await this.invoices.findOne({ _id: invoiceId, tenantId });
    if (!invoice) throw new NotFoundException('Invoice not found');
    const tenant = await this.tenants.findOne({ slug: tenantId });
    if (!tenant?.activePolicyId) {
      throw new NotFoundException('No active policy for tenant');
    }
    const policy = await this.policies.findById(tenant.activePolicyId);
    if (!policy) throw new NotFoundException('Active policy not found');

    const idempotencyKey = `batch-deferred-${invoiceId}-${Date.now()}`;
    const rulesFired = [
      {
        id: 'budget_deferred',
        message: `Cash-aware: amount ${invoice.amount} no cabe en remainingBudget ${remainingBudget} tras selección (spent=${plan.spent})`,
      },
    ];
    const explanation =
      'HOLD por cash-aware (budget_deferred). La factura es elegible a nivel individual, pero el presupuesto del lote priorizó otras.';
    const counterfactual = `Si remainingBudget ≥ ${plan.spent + invoice.amount}, esta factura habría entrado en el lote PAY.`;
    const hash = receiptHash({
      tenantId,
      invoiceId: invoice.id,
      policyVersion: policy.version,
      outcome: 'HOLD',
      autonomyMode: tenant.autonomyMode,
      fingerprint: invoice.fingerprint,
      idempotencyKey,
      rulesFired,
    });

    const created = await this.decisions.create({
      tenantId,
      invoiceId: invoice.id,
      policyId: policy.id,
      policyVersion: policy.version,
      outcome: 'HOLD',
      autonomyMode: tenant.autonomyMode,
      rulesFired,
      evidence: {
        cashAware: true,
        remainingBudget,
        spent: plan.spent,
        selectedIds: plan.selected.map((s) => s.id),
      },
      explanation,
      counterfactual,
      receiptHash: hash,
      idempotencyKey,
      fingerprint: invoice.fingerprint,
      mockExecution: mockExecute({
        outcome: 'HOLD',
        invoiceId: invoice.id,
        amount: invoice.amount,
        currency: invoice.currency,
        payeeName: invoice.payeeName,
      }),
    });
    invoice.status = 'decided';
    await invoice.save();
    return this.toDto(created.toObject());
  }

  /**
   * El agente revisa la bandeja de cuentas por pagar.
   * Si vienen invoiceIds (scope UI), solo esas; si no, todas las pendientes.
   */
  async reviewInbox(
    tenantId: string,
    opts?: {
      invoiceIds?: string[];
      paymentCategories?: string[];
      idempotencyPrefix?: string;
    },
  ) {
    const ids = (opts?.invoiceIds ?? [])
      .map((x) => String(x).trim())
      .filter(Boolean);
    const cats = (opts?.paymentCategories ?? [])
      .map((c) => String(c).trim())
      .filter(Boolean);

    const q: Record<string, unknown> = {
      tenantId,
      status: { $ne: 'decided' },
    };
    if (ids.length) {
      q._id = { $in: ids };
    } else if (cats.length && !cats.includes('*')) {
      q.paymentCategory = { $in: cats };
    }

    // Documentos (no lean): reutilizar en decide → evita N× findOne invoice
    const pending = await this.invoices.find(q).sort({ createdAt: 1 });

    const prefix = opts?.idempotencyPrefix ?? 'review-inbox';
    const batch = pending.length
      ? await this.buildDecideBatch(tenantId)
      : undefined;

    // Trust ladder: precargar conteos por payee (1× por beneficiario, no por factura)
    if (batch) {
      const byPayee = new Map<string, string>();
      for (const inv of pending) {
        const key = normalizePayee(inv.payeeName);
        if (!byPayee.has(key)) byPayee.set(key, inv.payeeName);
      }
      await Promise.all(
        [...byPayee.entries()].map(async ([key, name]) => {
          batch.cleanPayCache.set(
            key,
            await this.countCleanPays(tenantId, name),
          );
        }),
      );
    }

    const decisions: ReturnType<DecisionsService['toDto']>[] = [];
    for (const inv of pending) {
      const id = inv._id.toString();
      const d = await this.decide(
        tenantId,
        id,
        `${prefix}-${id}-${randomUUID()}`,
        batch,
        inv,
      );
      decisions.push(d);
    }

    if (batch?.pendingDebits.length) {
      await this.accounts.applyDebits(tenantId, batch.pendingDebits);
    }

    const tally = { PAY: 0, HOLD: 0, DENY: 0 };
    for (const d of decisions) {
      if (d.outcome === 'PAY' || d.outcome === 'HOLD' || d.outcome === 'DENY') {
        tally[d.outcome] += 1;
      }
    }

    return {
      reviewed: decisions.length,
      pendingFound: pending.length,
      tally,
      decisions,
      message:
        decisions.length === 0
          ? ids.length
            ? 'Nada pendiente en la vista actual. Carga el set Demo Day o elige «Ver todas».'
            : 'Bandeja vacía. Carga el set Demo Day y luego Revisar bandeja.'
          : `Agente revisó ${decisions.length}: ${tally.PAY} PAY · ${tally.HOLD} HOLD (permiso) · ${tally.DENY} DENY.`,
    };
  }

  /**
   * Lote de permiso humano: una sola carga de tenant/policy + N resolve.
   * Evita 24× round-trips extras (crítico con Atlas vía SOCKS).
   */
  async resolveBatch(
    tenantId: string,
    decisionIds: string[],
    action: 'approve' | 'reject',
    actor?: { id?: string; name?: string; role?: string },
  ) {
    const ids = [...new Set(decisionIds.map((x) => String(x).trim()).filter(Boolean))];
    if (!ids.length) {
      throw new BadRequestException('decisionIds required');
    }
    if (action !== 'approve' && action !== 'reject') {
      throw new BadRequestException('action must be approve | reject');
    }

    const tenant = await this.tenants.findOne({ slug: tenantId });
    if (!tenant?.activePolicyId) {
      throw new NotFoundException('No active policy for tenant');
    }
    const policy = await this.policies.findById(tenant.activePolicyId);
    if (!policy) throw new NotFoundException('Active policy not found');

    const accountRows =
      action === 'approve' ? await this.accounts.listActiveLean(tenantId) : [];
    const balances = new Map(
      accountRows.map((a) => [a._id.toString(), Number(a.mockBalance)]),
    );
    const pendingDebits: Array<{ accountId: string; amount: number }> = [];
    const payCtx: ResolveBatchCtx = {
      tenant,
      policy,
      accountRows,
      balances,
      pendingDebits,
    };

    const decisions: ReturnType<DecisionsService['toDto']>[] = [];
    const promotePayees: string[] = [];
    let failed = 0;
    const errors: Array<{ id: string; error: string }> = [];

    for (const id of ids) {
      try {
        const d = await this.resolve(
          tenantId,
          id,
          action,
          `resolve-batch-${id}-${randomUUID()}`,
          actor,
          payCtx,
        );
        decisions.push(d);
        const sug = (
          d as ReturnType<DecisionsService['toDto']> & {
            policySuggestion?: { kind?: string; payeeName?: string };
          }
        ).policySuggestion;
        if (sug?.kind === 'add_allowlist' && sug.payeeName) {
          promotePayees.push(sug.payeeName);
        }
      } catch (err) {
        failed += 1;
        errors.push({ id, error: String(err) });
      }
    }

    if (pendingDebits.length) {
      await this.accounts.applyDebits(tenantId, pendingDebits);
    }

    const ok = decisions.length;
    const verb = action === 'approve' ? 'aprobó' : 'rechazó';
    return {
      reviewed: ok,
      failed,
      tally: {
        PAY: action === 'approve' ? ok : 0,
        HOLD: 0,
        DENY: action === 'reject' ? ok : 0,
      },
      decisions,
      promotePayees: [...new Set(promotePayees)],
      errors,
      message:
        failed === 0
          ? `Lote: ${ok} HOLD → ${action === 'approve' ? 'PAY' : 'DENY'} (${verb}).`
          : `Lote: ${ok} ok · ${failed} error.`,
    };
  }

  /**
   * Permiso humano:
   * - HOLD → approve=PAY / reject=DENY
   * - DENY por duplicado → solo approve = excepción (falso positivo) → PAY
   * Append-only: nueva decisión; el prior queda enlazado en evidence.
   */
  async resolve(
    tenantId: string,
    decisionId: string,
    action: 'approve' | 'reject',
    idempotencyKey: string,
    actor?: { id?: string; name?: string; role?: string },
    ctx?: ResolveBatchCtx,
  ) {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    if (action !== 'approve' && action !== 'reject') {
      throw new BadRequestException('action must be approve | reject');
    }

    const existingKey = await this.decisions
      .findOne({ idempotencyKey: idempotencyKey.trim() })
      .lean();
    if (existingKey) {
      if (existingKey.tenantId !== tenantId) {
        throw new BadRequestException(
          'Idempotency-Key already used for a different decision',
        );
      }
      return this.toDto(existingKey);
    }

    const prior = await this.decisions.findOne({ _id: decisionId, tenantId });
    if (!prior) throw new NotFoundException('Decision not found');

    const priorRules = (prior.rulesFired ?? []) as Array<{ id?: string }>;
    const isDupDeny =
      prior.outcome === 'DENY' &&
      priorRules.some((r) => r.id === 'duplicate_fingerprint');

    if (prior.outcome === 'HOLD') {
      /* ok */
    } else if (isDupDeny && action === 'approve') {
      /* excepción falso positivo */
    } else if (isDupDeny && action === 'reject') {
      throw new BadRequestException(
        'El DENY por duplicado ya es el rechazo. Usa «Excepcionar» solo si es falso positivo.',
      );
    } else {
      throw new BadRequestException(
        'Solo HOLD (permiso) o DENY por duplicado (excepción FP) se pueden resolver',
      );
    }

    const priorEvidence = (prior.evidence ?? {}) as Record<string, unknown>;
    if (priorEvidence.resolvedByDecisionId) {
      throw new BadRequestException('Esta decisión ya fue resuelta por un humano');
    }

    const invoice = await this.invoices.findOne({
      _id: prior.invoiceId,
      tenantId,
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const tenant =
      ctx?.tenant ?? (await this.tenants.findOne({ slug: tenantId }));
    if (!tenant?.activePolicyId) {
      throw new NotFoundException('No active policy for tenant');
    }
    const policy =
      ctx?.policy ?? (await this.policies.findById(tenant.activePolicyId));
    if (!policy) throw new NotFoundException('Active policy not found');

    const resolvedBy = {
      id: (actor?.id ?? 'demo.finanzas').trim() || 'demo.finanzas',
      name: (actor?.name ?? 'Finanzas').trim() || 'Finanzas',
      role: (actor?.role ?? 'Autorizado').trim() || 'Autorizado',
    };
    const who = `${resolvedBy.name} · ${resolvedBy.role}`;

    const outcome = action === 'approve' ? 'PAY' : 'DENY';
    const overrideDup = isDupDeny && action === 'approve';
    const ruleId = overrideDup
      ? 'human_override_duplicate'
      : action === 'approve'
        ? 'human_approved'
        : 'human_rejected';
    const rulesFired = [
      {
        id: ruleId,
        message: overrideDup
          ? `${who} excepcionó DENY por duplicado → PAY (falso positivo / revisión humana)`
          : action === 'approve'
            ? `${who} aprobó el HOLD → PAY (permiso explícito)`
            : `${who} rechazó el HOLD → DENY`,
      },
      {
        id: overrideDup ? 'prior_deny_duplicate' : 'prior_hold',
        message: `Resuelve decisión ${prior.id}`,
      },
    ];
    const explanation = overrideDup
      ? `Excepción concedida por ${who}: el motor denegó por firma idéntica (fail-closed); se trató como falso positivo y se autorizó el pago.`
      : action === 'approve'
        ? `Permiso concedido por ${who}. El agente había escalado (HOLD); se autorizó el pago.`
        : `Permiso denegado por ${who}. El agente había escalado (HOLD); se rechazó el pago.`;
    const counterfactual = overrideDup
      ? 'Sin la excepción humana, el DENY por duplicado se habría mantenido.'
      : action === 'approve'
        ? 'Si se hubiera rechazado, el outcome habría sido DENY.'
        : 'Si se hubiera aprobado, el outcome habría sido PAY (mock rail WOULD_PAY).';
    const payBatch: DecideBatchCtx | undefined =
      outcome === 'PAY' && ctx?.accountRows
        ? {
            tenant,
            policy,
            knownFingerprints: new Set(),
            cleanPayCache: new Map(),
            accountRows: ctx.accountRows,
            balances: ctx.balances,
            pendingDebits: ctx.pendingDebits,
          }
        : undefined;

    const paymentAccount =
      outcome === 'PAY'
        ? await this.attachPaymentAccount(
            {
              tenantId,
              tags: invoice.tags,
              fixtureId: invoice.fixtureId,
              payeeName: invoice.payeeName,
              paymentCategory: invoice.paymentCategory,
              amount: invoice.amount,
            },
            payBatch,
          )
        : undefined;

    const hash = receiptHash({
      tenantId,
      invoiceId: invoice.id,
      policyVersion: policy.version,
      outcome,
      autonomyMode: tenant.autonomyMode,
      fingerprint: invoice.fingerprint,
      idempotencyKey: idempotencyKey.trim(),
      rulesFired,
    });
    const mockExecution = mockExecute({
      outcome,
      invoiceId: invoice.id,
      amount: invoice.amount,
      currency: invoice.currency,
      payeeName: invoice.payeeName,
      accountLabel: paymentAccount?.label,
    });

    const created = await this.decisions.create({
      tenantId,
      invoiceId: invoice.id,
      policyId: policy.id,
      policyVersion: policy.version,
      outcome,
      autonomyMode: tenant.autonomyMode,
      rulesFired,
      evidence: {
        humanResolution: action,
        priorDecisionId: prior.id,
        recommendedOutcome: prior.recommendedOutcome,
        resolvedBy,
        ...(paymentAccount ? { paymentAccount } : {}),
        ...(outcome === 'PAY' ? { reconcileStatus: 'pending' } : {}),
      },
      explanation,
      counterfactual,
      receiptHash: hash,
      idempotencyKey: idempotencyKey.trim(),
      fingerprint: invoice.fingerprint,
      recommendedOutcome: prior.recommendedOutcome,
      mockExecution,
    });

    prior.evidence = {
      ...priorEvidence,
      resolvedByDecisionId: created.id,
      humanResolution: action,
      resolvedBy,
    };
    await prior.save();

    invoice.status = 'decided';
    await invoice.save();

    const dto = this.toDto(created.toObject());
    // D3 - Exception→Policy: si aprobó un HOLD de beneficiario nuevo, sugerir allowlist
    const wasNewPayee = priorRules.some((r) => r.id === 'block_new_payee');
    if (action === 'approve' && wasNewPayee && prior.outcome === 'HOLD') {
      return {
        ...dto,
        policySuggestion: {
          kind: 'add_allowlist' as const,
          payeeName: invoice.payeeName,
          payeeNormalized: invoice.payeeNormalized ?? normalizePayee(invoice.payeeName),
        },
      };
    }
    return dto;
  }

  /** Conciliación mock: marca un PAY como conciliado en el ledger. */
  async reconcile(tenantId: string, decisionId: string) {
    const row = await this.decisions.findOne({ _id: decisionId, tenantId });
    if (!row) throw new NotFoundException('Decision not found');
    if (row.outcome !== 'PAY') {
      throw new BadRequestException('Solo se concilian decisiones PAY');
    }
    const evidence = (row.evidence ?? {}) as Record<string, unknown>;
    row.evidence = {
      ...evidence,
      reconcileStatus: 'reconciled',
      reconciledAt: new Date().toISOString(),
    };
    await row.save();
    return this.toDto(row.toObject());
  }

  async list(tenantId: string, outcome?: string) {
    const q: Record<string, unknown> = { tenantId };
    if (outcome) q.outcome = outcome;
    const rows = await this.decisions
      .find(q)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    return rows.map((r) => this.toDto(r));
  }

  async get(tenantId: string, id: string) {
    const row = await this.decisions.findOne({ _id: id, tenantId }).lean();
    if (!row) throw new NotFoundException('Decision not found');
    return this.toDto(row);
  }

  private toDto(doc: Record<string, unknown> | DecisionDocument) {
    const d = doc as Record<string, unknown> & {
      _id: { toString(): string };
      createdAt?: Date;
    };
    const evidence = (d.evidence ?? {}) as Record<string, unknown>;
    return {
      id: d._id.toString(),
      tenantId: d.tenantId,
      invoiceId: d.invoiceId,
      policyId: d.policyId,
      policyVersion: d.policyVersion,
      outcome: d.outcome,
      autonomyMode: d.autonomyMode,
      rulesFired: d.rulesFired,
      evidence,
      explanation: d.explanation,
      counterfactual: d.counterfactual,
      receiptHash: d.receiptHash,
      idempotencyKey: d.idempotencyKey,
      fingerprint: d.fingerprint,
      recommendedOutcome: d.recommendedOutcome,
      mockExecution: d.mockExecution,
      createdAt: d.createdAt
        ? new Date(d.createdAt).toISOString()
        : undefined,
      awaitingHuman:
        d.outcome === 'HOLD' && !evidence.resolvedByDecisionId,
      /** DENY por firma idéntica: humano puede excepcionar (falso positivo). */
      canOverrideDuplicate:
        d.outcome === 'DENY' &&
        !evidence.resolvedByDecisionId &&
        ((d.rulesFired as Array<{ id?: string }> | undefined) ?? []).some(
          (r) => r.id === 'duplicate_fingerprint',
        ),
      resolvedByDecisionId: evidence.resolvedByDecisionId as
        | string
        | undefined,
      resolvedBy: evidence.resolvedBy as
        | { id?: string; name: string; role?: string }
        | undefined,
      paymentAccount: evidence.paymentAccount,
      reconcileStatus: evidence.reconcileStatus as string | undefined,
    };
  }
}
