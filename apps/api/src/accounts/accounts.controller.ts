import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { TenantId } from '../tenant.decorator';
import { AccountsService } from './accounts.service';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  list(@TenantId() tenantId: string) {
    return this.accounts.list(tenantId);
  }

  @Post()
  create(
    @TenantId() tenantId: string,
    @Body()
    body: {
      name?: string;
      bank?: string;
      usage?: string;
      priority?: number;
      mockBalance?: number;
      currency?: string;
    },
  ) {
    return this.accounts.create(tenantId, body);
  }

  @Patch(':id')
  patch(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body()
    body: {
      priority?: number;
      active?: boolean;
      mockBalance?: number;
      name?: string;
      usage?: string;
    },
  ) {
    return this.accounts.patch(tenantId, id, body);
  }
}
