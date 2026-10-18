import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { TenantId } from '../tenant.decorator';
import { PoliciesService } from './policies.service';

@Controller('policies')
export class PoliciesController {
  constructor(private readonly policies: PoliciesService) {}

  @Get('active')
  active(@TenantId() tenantId: string) {
    return this.policies.getActive(tenantId);
  }

  /** D3 — promover beneficiario a allowlist (Exception→Policy) */
  @Post('active/promote-payee')
  promotePayee(
    @TenantId() tenantId: string,
    @Body() body: { payeeName?: string },
  ) {
    return this.policies.promotePayee(tenantId, body?.payeeName ?? '');
  }

  @Post()
  create(@TenantId() tenantId: string, @Body() body: Record<string, unknown>) {
    return this.policies.create(tenantId, body);
  }

  /** A4b — preview warnings sin activar */
  @Post('analyze')
  analyze(@TenantId() tenantId: string, @Body() body: Record<string, unknown>) {
    return this.policies.analyze(tenantId, body);
  }

  @Post(':id/activate')
  activate(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body?: { force?: boolean },
  ) {
    return this.policies.activate(tenantId, id, { force: Boolean(body?.force) });
  }
}
