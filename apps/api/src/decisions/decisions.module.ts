import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccountsModule } from '../accounts/accounts.module';
import { Invoice, InvoiceSchema } from '../invoices/invoice.schema';
import { Policy, PolicySchema } from '../policies/policy.schema';
import { Tenant, TenantSchema } from '../tenants/tenant.schema';
import { Decision, DecisionSchema } from './decision.schema';
import { DecisionsController } from './decisions.controller';
import { DecisionsService } from './decisions.service';

@Module({
  imports: [
    AccountsModule,
    MongooseModule.forFeature([
      { name: Decision.name, schema: DecisionSchema },
      { name: Invoice.name, schema: InvoiceSchema },
      { name: Policy.name, schema: PolicySchema },
      { name: Tenant.name, schema: TenantSchema },
    ]),
  ],
  controllers: [DecisionsController],
  providers: [DecisionsService],
  exports: [DecisionsService],
})
export class DecisionsModule {}
