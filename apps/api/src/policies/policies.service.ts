import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { z } from 'zod';
import {
  analyzePolicy,
  hasHighSeverity,
  isUnsafePayeeName,
  normalizePayee,
} from '@ezallow/domain';
import { normalizeAutonomyMode } from '@ezallow/shared';
import { Tenant, TenantDocument } from '../tenants/tenant.schema';
import { Policy, PolicyDocument } from './policy.schema';

const CreatePolicyBody = z.object({
  version: z.string().min(1),
  allowlistPayees: z.array(z.string()).default([]),
  hardCap: z.number().nonnegative(),
  softCap: z.number().nonnegative(),
  blockNewPayees: z.boolean().default(true),
  maxMismatchPercent: z.number().nonnegative().default(5),
  periodBudget: z.number().nonnegative().default(25000),
  currency: z.string().default('USD'),
  allowFuzzyPayeeMatch: z.boolean().default(false),
  trustLadderEnabled: z.boolean().default(true),
  trustMinCleanPays: z.number().int().nonnegative().default(3),
  trustSoftCapBoost: z.number().positive().default(2),
  autonomyWindowEnabled: z.boolean().default(false),
  autonomyStartHour: z.number().int().min(0).max(23).default(8),
  autonomyEndHour: z.number().int().min(0).max(24).default(20),
});

@Injectable()
export class PoliciesService {
  constructor(
    @InjectModel(Policy.name) private readonly policies: Model<PolicyDocument>,
    @InjectModel(Tenant.name) private readonly tenants: Model<TenantDocument>,
  ) {}

  async getActive(tenantId: string) {
    const tenant = await this.tenants.findOne({ slug: tenantId });
    if (!tenant?.activePolicyId) {
      throw new NotFoundException('No active policy for tenant');
    }
    const policy = await this.policies.findById(tenant.activePolicyId).lean();
    if (!policy) throw new NotFoundException('Active policy not found');
    return this.toDto(policy);
  }

  async create(tenantId: string, body: Record<string, unknown>) {
    const parsed = CreatePolicyBody.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const data = parsed.data;
    try {
      const created = await this.policies.create({
        tenantId,
        version: data.version,
        status: 'draft',
        allowlistPayees: data.allowlistPayees,
        hardCap: data.hardCap,
        softCap: data.softCap,
        blockNewPayees: data.blockNewPayees,
        maxMismatchPercent: data.maxMismatchPercent,
        periodBudget: data.periodBudget,
        currency: data.currency,
        allowFuzzyPayeeMatch: data.allowFuzzyPayeeMatch,
        trustLadderEnabled: data.trustLadderEnabled,
        trustMinCleanPays: data.trustMinCleanPays,
        trustSoftCapBoost: data.trustSoftCapBoost,
        autonomyWindowEnabled: data.autonomyWindowEnabled,
        autonomyStartHour: data.autonomyStartHour,
        autonomyEndHour: data.autonomyEndHour,
      });
      return this.toDto(created.toObject());
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      if (code === 11000) {
        throw new BadRequestException(
          `Policy version ${data.version} already exists for tenant`,
        );
      }
      throw err;
    }
  }

  async activate(
    tenantId: string,
    policyId: string,
    opts: { force?: boolean } = {},
  ) {
    const policy = await this.policies.findOne({ _id: policyId, tenantId });
    if (!policy) throw new NotFoundException('Policy not found');

    const tenant = await this.tenants.findOne({ slug: tenantId });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const warnings = analyzePolicy({
      allowlistPayees: policy.allowlistPayees,
      hardCap: policy.hardCap,
      softCap: policy.softCap,
      periodBudget: policy.periodBudget,
      blockNewPayees: policy.blockNewPayees,
      maxMismatchPercent: policy.maxMismatchPercent,
      allowFuzzyPayeeMatch: policy.allowFuzzyPayeeMatch,
      currency: policy.currency,
      autonomyMode: normalizeAutonomyMode(tenant.autonomyMode),
    });

    if (hasHighSeverity(warnings) && !opts.force) {
      throw new BadRequestException({
        message:
          'Revisión de reglas: hay un aviso grave. Pasa force=true para activar igual',
        warnings,
      });
    }

    await this.policies.updateMany(
      { tenantId, status: 'active' },
      { $set: { status: 'archived' } },
    );
    policy.status = 'active';
    await policy.save();

    tenant.activePolicyId = policy._id;
    await tenant.save();

    return { ...this.toDto(policy.toObject()), warnings };
  }

  /** Preview A4b sin activar */
  async analyze(tenantId: string, body: Record<string, unknown>) {
    const parsed = CreatePolicyBody.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const tenant = await this.tenants.findOne({ slug: tenantId });
    const data = parsed.data;
    const warnings = analyzePolicy({
      ...data,
      autonomyMode: tenant
        ? normalizeAutonomyMode(tenant.autonomyMode)
        : undefined,
    });
    return { warnings, blocked: hasHighSeverity(warnings) };
  }

  /**
   * D3 - Exception→Policy: añade beneficiario a allowlist
   * (nueva versión + activate force).
   */
  async promotePayee(tenantId: string, payeeName: string) {
    const name = (payeeName ?? '').trim();
    if (!name) throw new BadRequestException('payeeName required');

    // D3 + seguridad: nunca promover nombre envenenado (inyección / bank redirect)
    if (isUnsafePayeeName(name)) {
      throw new BadRequestException(
        'payeeName rechazado: señales de inyección/redirect; no se promociona a allowlist',
      );
    }

    const active = await this.getActive(tenantId);
    const norm = normalizePayee(name);
    const already = active.allowlistPayees.some(
      (p) => normalizePayee(p) === norm,
    );
    if (already) {
      return {
        ok: true,
        already: true,
        message: `Ya estaba en allowlist: ${name}`,
        policy: active,
      };
    }

    const version = `promo-${Date.now().toString(36)}`;
    const created = await this.create(tenantId, {
      version,
      allowlistPayees: [...active.allowlistPayees, name],
      hardCap: active.hardCap,
      softCap: active.softCap,
      blockNewPayees: active.blockNewPayees,
      maxMismatchPercent: active.maxMismatchPercent,
      periodBudget: active.periodBudget,
      currency: active.currency,
      allowFuzzyPayeeMatch: active.allowFuzzyPayeeMatch,
      trustLadderEnabled: active.trustLadderEnabled,
      trustMinCleanPays: active.trustMinCleanPays,
      trustSoftCapBoost: active.trustSoftCapBoost,
      autonomyWindowEnabled: active.autonomyWindowEnabled,
      autonomyStartHour: active.autonomyStartHour,
      autonomyEndHour: active.autonomyEndHour,
    });

    const activated = await this.activate(tenantId, created.id!, { force: true });
    return {
      ok: true,
      already: false,
      message: `Regla promovida: ${name} → allowlist (policy ${activated.version})`,
      policy: activated,
    };
  }

  private toDto(p: {
    _id: { toString(): string };
    tenantId: string;
    version: string;
    status: string;
    allowlistPayees: string[];
    hardCap: number;
    softCap: number;
    blockNewPayees: boolean;
    maxMismatchPercent: number;
    periodBudget?: number;
    currency?: string;
    allowFuzzyPayeeMatch?: boolean;
    trustLadderEnabled?: boolean;
    trustMinCleanPays?: number;
    trustSoftCapBoost?: number;
    autonomyWindowEnabled?: boolean;
    autonomyStartHour?: number;
    autonomyEndHour?: number;
  }) {
    return {
      id: p._id.toString(),
      tenantId: p.tenantId,
      version: p.version,
      status: p.status,
      allowlistPayees: p.allowlistPayees,
      hardCap: p.hardCap,
      softCap: p.softCap,
      blockNewPayees: p.blockNewPayees,
      maxMismatchPercent: p.maxMismatchPercent,
      periodBudget: p.periodBudget ?? 25000,
      currency: p.currency ?? 'USD',
      allowFuzzyPayeeMatch: Boolean(p.allowFuzzyPayeeMatch),
      trustLadderEnabled: p.trustLadderEnabled !== false,
      trustMinCleanPays: p.trustMinCleanPays ?? 3,
      trustSoftCapBoost: p.trustSoftCapBoost ?? 2,
      autonomyWindowEnabled: Boolean(p.autonomyWindowEnabled),
      autonomyStartHour: p.autonomyStartHour ?? 8,
      autonomyEndHour: p.autonomyEndHour ?? 20,
    };
  }
}
