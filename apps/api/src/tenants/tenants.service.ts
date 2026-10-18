import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  normalizeAutonomyMode,
  type AutonomyMode,
} from '@ezallow/shared';
import { AccountsService } from '../accounts/accounts.service';
import { Decision, DecisionDocument } from '../decisions/decision.schema';
import { EvalRun, EvalRunDocument } from '../eval/eval-run.schema';
import { Invoice, InvoiceDocument } from '../invoices/invoice.schema';
import { Policy, PolicyDocument } from '../policies/policy.schema';
import { Tenant, TenantDocument } from './tenant.schema';

@Injectable()
export class TenantsService implements OnModuleInit {
  constructor(
    @InjectModel(Tenant.name) private readonly tenants: Model<TenantDocument>,
    @InjectModel(Policy.name) private readonly policies: Model<PolicyDocument>,
    @InjectModel(Invoice.name) private readonly invoices: Model<InvoiceDocument>,
    @InjectModel(Decision.name)
    private readonly decisions: Model<DecisionDocument>,
    @InjectModel(EvalRun.name) private readonly evalRuns: Model<EvalRunDocument>,
    private readonly accounts: AccountsService,
  ) {}

  async onModuleInit() {
    await this.ensureDemoTenant();
  }

  async ensureDemoTenant() {
    const slug = process.env.DEFAULT_TENANT_ID || 'blinka-demo';
    let tenant = await this.tenants.findOne({ slug });
    if (!tenant) {
      tenant = await this.tenants.create({
        slug,
        name: 'Blinka Demo',
        autonomyMode: 'autopilot',
        activePolicyId: null,
      });
    } else {
      const canon = normalizeAutonomyMode(tenant.autonomyMode);
      if (tenant.autonomyMode !== canon) {
        tenant.autonomyMode = canon;
        await tenant.save();
      }
    }

    let policy = await this.policies.findOne({
      tenantId: slug,
      status: 'active',
    });
    if (!policy) {
      policy = await this.policies.create({
        tenantId: slug,
        version: '1.2.0',
        status: 'active',
        allowlistPayees: [
          'acme supplies llc',
          'cloudflare inc',
          'juan perez consulting',
          'latam ops ltd',
        ],
        hardCap: 5000,
        softCap: 1000,
        blockNewPayees: true,
        maxMismatchPercent: 5,
        periodBudget: 25000,
        currency: 'USD',
        allowFuzzyPayeeMatch: false,
      });
      tenant.activePolicyId = policy._id;
      await tenant.save();
    } else if (!tenant.activePolicyId) {
      tenant.activePolicyId = policy._id;
      await tenant.save();
    }
  }

  async getMe(slug: string) {
    const tenant = await this.tenants.findOne({ slug }).lean();
    if (!tenant) throw new NotFoundException(`Tenant ${slug} not found`);
    return {
      slug: tenant.slug,
      name: tenant.name,
      autonomyMode: normalizeAutonomyMode(tenant.autonomyMode),
      activePolicyId: tenant.activePolicyId?.toString() ?? null,
    };
  }

  async patchMe(
    slug: string,
    body: { autonomyMode?: string },
  ) {
    const tenant = await this.tenants.findOne({ slug });
    if (!tenant) throw new NotFoundException(`Tenant ${slug} not found`);
    if (body.autonomyMode) {
      tenant.autonomyMode = normalizeAutonomyMode(body.autonomyMode);
    }
    await tenant.save();
    return this.getMe(slug);
  }

  /**
   * Limpia ledger de demo: facturas, decisiones, eval runs.
   * Conserva política y cuentas; restaura saldos mock. Fuerza Autopilot.
   */
  async resetDemo(slug: string) {
    const tenant = await this.tenants.findOne({ slug });
    if (!tenant) throw new NotFoundException(`Tenant ${slug} not found`);

    const [inv, dec, ev] = await Promise.all([
      this.invoices.deleteMany({ tenantId: slug }),
      this.decisions.deleteMany({ tenantId: slug }),
      this.evalRuns.deleteMany({ tenantId: slug }),
    ]);

    await this.accounts.resetDemoBalances(slug);

    tenant.autonomyMode = 'autopilot';
    await tenant.save();

    return {
      ok: true,
      autonomyMode: 'autopilot' as AutonomyMode,
      deleted: {
        invoices: inv.deletedCount ?? 0,
        decisions: dec.deletedCount ?? 0,
        evalRuns: ev.deletedCount ?? 0,
      },
      message:
        'Demo limpia: facturas, decisiones y eval borrados; saldos de cuentas restaurados. Autonomía = Autopilot. Recarga el set Demo Day.',
    };
  }
}
