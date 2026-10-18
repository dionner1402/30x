import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { TenantId } from '../tenant.decorator';
import type { AgentWaveConfig } from './agent-wave.types';
import { AgentService } from './agent.service';

@Controller('agent')
export class AgentController {
  constructor(private readonly agent: AgentService) {}

  @Get('schedule')
  getSchedule(@TenantId() tenantId: string) {
    return this.agent.getSchedule(tenantId);
  }

  @Patch('schedule')
  patchSchedule(
    @TenantId() tenantId: string,
    @Body() body: { waves?: AgentWaveConfig[] },
  ) {
    return this.agent.patchSchedule(tenantId, body);
  }

  @Post('runs')
  executeRun(@TenantId() tenantId: string) {
    return this.agent.executeRun(tenantId);
  }

  @Get('runs/latest')
  latestRun(@TenantId() tenantId: string) {
    return this.agent.latestRun(tenantId);
  }
}
