import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { TenantId } from '../tenant.decorator';
import { InvoicesService } from './invoices.service';

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get('fixtures')
  fixtures() {
    return this.invoices.listFixtures();
  }

  @Get()
  list(@TenantId() tenantId: string) {
    return this.invoices.list(tenantId);
  }

  @Get(':id')
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.invoices.get(tenantId, id);
  }

  @Post('from-fixture')
  fromFixture(
    @TenantId() tenantId: string,
    @Body() body: { fixtureId?: string; uniqueSuffix?: string },
  ) {
    return this.invoices.fromFixture(tenantId, body.fixtureId ?? '', {
      uniqueSuffix: body.uniqueSuffix,
    });
  }

  @Patch(':id/category')
  setCategory(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: { paymentCategory?: string },
  ) {
    return this.invoices.setPaymentCategory(
      tenantId,
      id,
      body.paymentCategory ?? 'suppliers',
    );
  }

  @Post('upload')
  upload(@TenantId() tenantId: string, @Body() body: { note?: string }) {
    return this.invoices.uploadMeta(tenantId, body);
  }
}
