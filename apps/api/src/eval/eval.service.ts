import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Model } from 'mongoose';
import { evaluatePolicy } from '@ezallow/domain';
import { normalizeAutonomyMode } from '@ezallow/shared';
import { extractFromFixture, listFixtureIds } from '../invoices/fixture-extractor';
import { Policy, PolicyDocument } from '../policies/policy.schema';
import { Tenant, TenantDocument } from '../tenants/tenant.schema';
import { EvalRun, EvalRunDocument } from './eval-run.schema';

type CaseResult = {
  fixtureId: string;
  tags: string[];
  expected: string;
  actual: string;
  ok: boolean;
  falsePay: boolean;
};

@Injectable()
export class EvalService {
  constructor(
    @InjectModel(EvalRun.name) private readonly runs: Model<EvalRunDocument>,
    @InjectModel(Policy.name) private readonly policies: Model<PolicyDocument>,
    @InjectModel(Tenant.name) private readonly tenants: Model<TenantDocument>,
  ) {}

  async runSuite(tenantId: string) {
    const tenant = await this.tenants.findOne({ slug: tenantId });
    if (!tenant?.activePolicyId) {
      throw new Error('No active policy: activate demo policy first');
    }
    const policyDoc = await this.policies.findById(tenant.activePolicyId);
    if (!policyDoc) throw new Error('Active policy not found');

    const policy = {
      allowlistPayees: policyDoc.allowlistPayees,
      hardCap: policyDoc.hardCap,
      softCap: policyDoc.softCap,
      periodBudget: policyDoc.periodBudget,
      blockNewPayees: policyDoc.blockNewPayees,
      maxMismatchPercent: policyDoc.maxMismatchPercent,
      allowFuzzyPayeeMatch: policyDoc.allowFuzzyPayeeMatch,
      currency: policyDoc.currency,
    };

    const order = this.orderedFixtureIds();
    const knownFingerprints = new Set<string>();
    const cases: CaseResult[] = [];

    for (const fixtureId of order) {
      const extracted = extractFromFixture(fixtureId);
      const expected = extracted.expectedOutcome ?? 'PAY';
      const tags = extracted.tags ?? [];
      const raw = this.readFixtureRaw(fixtureId);
      const mode = normalizeAutonomyMode(
        (raw.autonomyMode as string | undefined) ??
          (extracted as { autonomyMode?: string }).autonomyMode ??
          'autopilot',
      );

      const result = evaluatePolicy(
        {
          tenantId: extracted.invoice.tenantId,
          payeeName: extracted.invoice.payeeName,
          amount: extracted.invoice.amount,
          currency: extracted.invoice.currency,
          invoiceNumber: extracted.invoice.invoiceNumber,
          issueDate: extracted.invoice.issueDate,
          lineItems: extracted.invoice.lineItems,
          tax: extracted.invoice.tax,
          agreedAmount: extracted.invoice.agreedAmount,
        },
        policy,
        {
          autonomyMode: mode,
          knownFingerprints,
          remainingBudget: extracted.context?.remainingBudget,
        },
      );

      const actual = result.outcome;
      const ok = actual === expected;
      const falsePay = actual === 'PAY' && expected !== 'PAY';

      cases.push({
        fixtureId,
        tags,
        expected,
        actual,
        ok,
        falsePay,
      });

      // Acumular fingerprints solo de decisiones "pagadas" o cualquier decisión
      // T-DUP necesita que N01 ya esté en known (misma huella)
      knownFingerprints.add(result.fingerprint);
    }

    const total = cases.length;
    const passed = cases.filter((c) => c.ok).length;
    const falsePay = cases.filter((c) => c.falsePay).length;
    const falseDeny = cases.filter(
      (c) =>
        c.tags.includes('happy') &&
        c.expected === 'PAY' &&
        c.actual !== 'PAY',
    ).length;
    const happy = cases.filter((c) => c.tags.includes('happy'));
    const happyAutonomous = happy.filter((c) => c.actual === 'PAY').length;
    const autonomyRate =
      happy.length === 0 ? 0 : happyAutonomous / happy.length;
    const accuracy = total === 0 ? 0 : passed / total;

    const metrics = {
      total,
      passed,
      falsePay,
      falseDeny,
      accuracy: Math.round(accuracy * 1000) / 1000,
      autonomyRate: Math.round(autonomyRate * 1000) / 1000,
    };

    const passedGate = falsePay === 0;
    const saved = await this.runs.create({
      tenantId,
      cases,
      metrics,
      passedGate,
    });

    return {
      id: saved.id,
      tenantId,
      cases,
      metrics,
      passedGate,
      gate: passedGate
        ? 'PASS false_pay=0'
        : `FAIL false_pay=${falsePay} (descalifica)`,
    };
  }

  async latest(tenantId: string) {
    const row = await this.runs
      .findOne({ tenantId })
      .sort({ createdAt: -1 })
      .lean();
    if (!row) return null;
    const doc = row as typeof row & { createdAt?: Date | string };
    const falsePay = Number(doc.metrics?.falsePay ?? 0);
    const passedGate = Boolean(doc.passedGate) && falsePay === 0;
    return {
      id: String(doc._id),
      tenantId: doc.tenantId,
      cases: doc.cases,
      metrics: doc.metrics,
      passedGate,
      gate: passedGate
        ? 'PASS false_pay=0'
        : `FAIL false_pay=${falsePay} (descalifica)`,
      createdAt: doc.createdAt
        ? new Date(doc.createdAt).toISOString()
        : undefined,
    };
  }

  private orderedFixtureIds(): string[] {
    // Manifest order: normals then traps (N01 before T-DUP)
    try {
      return listFixtureIds();
    } catch {
      return [];
    }
  }

  private readFixtureRaw(fixtureId: string): Record<string, unknown> {
    const candidates = [
      join(process.cwd(), 'fixtures', 'invoices', `${fixtureId}.json`),
      join(process.cwd(), '../../fixtures', 'invoices', `${fixtureId}.json`),
    ];
    for (const p of candidates) {
      if (existsSync(p)) {
        return JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>;
      }
    }
    return {};
  }
}
