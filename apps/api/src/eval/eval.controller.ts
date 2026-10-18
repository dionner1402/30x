import { Controller, Get, Post } from '@nestjs/common';
import { TenantId } from '../tenant.decorator';
import { EvalService } from './eval.service';

@Controller('eval')
export class EvalController {
  constructor(private readonly evalService: EvalService) {}

  @Post('runs')
  run(@TenantId() tenantId: string) {
    return this.evalService.runSuite(tenantId);
  }

  @Get('runs/latest')
  latest(@TenantId() tenantId: string) {
    return this.evalService.latest(tenantId);
  }
}
