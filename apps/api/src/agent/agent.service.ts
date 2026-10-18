import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { normalizeAutonomyMode } from '@ezallow/shared';
import { DecisionsService } from '../decisions/decisions.service';
import { Tenant, TenantDocument } from '../tenants/tenant.schema';
import {
  AgentWaveConfig,
  DEFAULT_AGENT_WAVES,
} from './agent-wave.types';
import { AgentRun, AgentRunDocument } from './agent-run.schema';

@Injectable()
export class AgentService {
  constructor(
    @InjectModel(Tenant.name) private readonly tenants: Model<TenantDocument>,
    @InjectModel(AgentRun.name)
    private readonly runs: Model<AgentRunDocument>,
    private readonly decisions: DecisionsService,
  ) {}

  async getSchedule(tenantId: string) {
    const tenant = await this.tenants.findOne({ slug: tenantId });
    if (!tenant) throw new NotFoundException('tenant');
    const waves = this.resolveWaves(tenant);
    const mode = normalizeAutonomyMode(tenant.autonomyMode);
    return {
      waves,
      autonomyMode: mode,
      hint:
        mode === 'advise'
          ? 'En Advise el agente no auto-PAY: espera HOLD con recomendación.'
          : mode === 'assist'
            ? 'Assist auto-PAY hasta soft cap; el resto HOLD.'
            : 'Autopilot auto-PAY hasta hard cap (fail-closed).',
    };
  }

  async patchSchedule(
    tenantId: string,
    body: { waves?: AgentWaveConfig[] },
  ) {
    const tenant = await this.tenants.findOne({ slug: tenantId });
    if (!tenant) throw new NotFoundException('tenant');
    if (body.waves) {
      this.validateWaves(body.waves);
      tenant.agentWaves = body.waves;
      await tenant.save();
    }
    return this.getSchedule(tenantId);
  }

  async latestRun(tenantId: string) {
    const doc = await this.runs
      .findOne({ tenantId })
      .sort({ createdAt: -1 })
      .lean();
    if (!doc) return null;
    return this.toRunDto(doc);
  }

  async executeRun(tenantId: string) {
    const tenant = await this.tenants.findOne({ slug: tenantId });
    if (!tenant) throw new NotFoundException('tenant');

    const autonomyMode = normalizeAutonomyMode(tenant.autonomyMode);
    const waves = this.resolveWaves(tenant);
    const runId = randomUUID();

    const waveResults: AgentRun['waves'] = [];
    const totals = { PAY: 0, HOLD: 0, DENY: 0 };

    for (const wave of waves) {
      const cats = wave.categories.includes('*') ? ['*'] : wave.categories;
      const res = await this.decisions.reviewInbox(tenantId, {
        paymentCategories: cats,
        idempotencyPrefix: `agent-run-${runId}-${wave.id}`,
      });
      waveResults.push({
        waveId: wave.id,
        label: wave.label,
        timeLocal: wave.timeLocal,
        reviewed: res.reviewed,
        tally: res.tally,
      });
      totals.PAY += res.tally.PAY;
      totals.HOLD += res.tally.HOLD;
      totals.DENY += res.tally.DENY;
    }

    const reviewed = waveResults.reduce((n, w) => n + w.reviewed, 0);
    const message =
      reviewed === 0
        ? 'Corrida completa: no había facturas pendientes. Carga fixtures y vuelve a ejecutar.'
        : `Corrida del agente: ${reviewed} facturas · ${totals.PAY} PAY · ${totals.HOLD} HOLD · ${totals.DENY} DENY.`;

    const saved = await this.runs.create({
      tenantId,
      autonomyMode,
      waves: waveResults,
      totals,
      message,
    });

    return this.toRunDto(saved.toObject());
  }

  private resolveWaves(tenant: TenantDocument): AgentWaveConfig[] {
    const custom = tenant.agentWaves;
    if (custom?.length) return custom as AgentWaveConfig[];
    return DEFAULT_AGENT_WAVES;
  }

  private validateWaves(waves: AgentWaveConfig[]) {
    if (!waves.length) {
      throw new BadRequestException('waves must not be empty');
    }
    for (const w of waves) {
      if (!w.id?.trim() || !w.label?.trim()) {
        throw new BadRequestException('each wave needs id and label');
      }
      if (!/^\d{2}:\d{2}$/.test(w.timeLocal ?? '')) {
        throw new BadRequestException(`invalid timeLocal on wave ${w.id}`);
      }
      if (!w.categories?.length) {
        throw new BadRequestException(`wave ${w.id} needs categories`);
      }
    }
  }

  private toRunDto(doc: {
    _id?: { toString(): string };
    tenantId: string;
    autonomyMode: string;
    waves: AgentRun['waves'];
    totals: AgentRun['totals'];
    message: string;
    createdAt?: Date;
    updatedAt?: Date;
  }) {
    return {
      id: doc._id?.toString(),
      tenantId: doc.tenantId,
      autonomyMode: doc.autonomyMode,
      waves: doc.waves,
      totals: doc.totals,
      message: doc.message,
      createdAt: doc.createdAt,
    };
  }
}
