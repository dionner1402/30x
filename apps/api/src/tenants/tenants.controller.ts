import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { TenantId } from '../tenant.decorator';
import { TenantsService } from './tenants.service';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get('me')
  me(@TenantId() tenantId: string) {
    return this.tenants.getMe(tenantId);
  }

  @Patch('me')
  patch(
    @TenantId() tenantId: string,
    @Body() body: { autonomyMode?: string },
  ) {
    return this.tenants.patchMe(tenantId, body);
  }

  /** Borra facturas + decisiones + eval del tenant (demo). */
  @Post('me/reset-demo')
  resetDemo(@TenantId() tenantId: string) {
    return this.tenants.resetDemo(tenantId);
  }
}
