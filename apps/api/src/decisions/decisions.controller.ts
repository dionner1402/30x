import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { TenantId } from '../tenant.decorator';
import { DecisionsService } from './decisions.service';

@Controller('decisions')
export class DecisionsController {
  constructor(private readonly decisions: DecisionsService) {}

  @Post()
  decide(
    @TenantId() tenantId: string,
    @Body() body: { invoiceId?: string },
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.decisions.decide(
      tenantId,
      body.invoiceId ?? '',
      idempotencyKey ?? '',
    );
  }

  /** A5 — cash-aware batch. Body: { invoiceIds, remainingBudget, commit? } */
  @Post('batch')
  batch(
    @TenantId() tenantId: string,
    @Body()
    body: {
      invoiceIds?: string[];
      remainingBudget?: number;
      commit?: boolean;
    },
  ) {
    return this.decisions.batch(tenantId, body);
  }

  /** Agente revisa facturas pendientes (opcional: invoiceIds del scope UI). */
  @Post('review-inbox')
  reviewInbox(
    @TenantId() tenantId: string,
    @Body()
    body?: {
      invoiceIds?: string[];
      paymentCategories?: string[];
    },
  ) {
    return this.decisions.reviewInbox(tenantId, {
      invoiceIds: body?.invoiceIds,
      paymentCategories: body?.paymentCategories,
    });
  }

  /** Lote de permiso: N HOLD → PAY/DENY en una llamada (tenant/policy cacheados). */
  @Post('resolve-batch')
  resolveBatch(
    @TenantId() tenantId: string,
    @Body()
    body: {
      decisionIds?: string[];
      action?: 'approve' | 'reject';
      resolvedBy?: { id?: string; name?: string; role?: string };
    },
  ) {
    return this.decisions.resolveBatch(
      tenantId,
      body.decisionIds ?? [],
      body.action ?? 'approve',
      body.resolvedBy,
    );
  }

  /** Humano resuelve HOLD: approve → PAY · reject → DENY (append-only). */
  @Post(':id/resolve')
  resolve(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body()
    body: {
      action?: 'approve' | 'reject';
      /** Quién concede/deniega el permiso (demo sin auth). */
      resolvedBy?: { id?: string; name?: string; role?: string };
    },
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.decisions.resolve(
      tenantId,
      id,
      body.action ?? 'approve',
      idempotencyKey ?? '',
      body.resolvedBy,
    );
  }

  /** Conciliación mock del historial PAY. */
  @Post(':id/reconcile')
  reconcile(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.decisions.reconcile(tenantId, id);
  }

  @Get()
  list(
    @TenantId() tenantId: string,
    @Query('outcome') outcome?: string,
  ) {
    return this.decisions.list(tenantId, outcome);
  }

  @Get(':id')
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.decisions.get(tenantId, id);
  }
}
