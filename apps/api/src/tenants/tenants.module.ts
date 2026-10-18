import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccountsModule } from '../accounts/accounts.module';
import { Decision, DecisionSchema } from '../decisions/decision.schema';
import { EvalRun, EvalRunSchema } from '../eval/eval-run.schema';
import { Invoice, InvoiceSchema } from '../invoices/invoice.schema';
import { Policy, PolicySchema } from '../policies/policy.schema';
import { Tenant, TenantSchema } from './tenant.schema';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

@Module({
  imports: [
    AccountsModule,
    MongooseModule.forFeature([
      { name: Tenant.name, schema: TenantSchema },
      { name: Policy.name, schema: PolicySchema },
      { name: Invoice.name, schema: InvoiceSchema },
      { name: Decision.name, schema: DecisionSchema },
      { name: EvalRun.name, schema: EvalRunSchema },
    ]),
  ],
  controllers: [TenantsController],
  providers: [TenantsService],
  exports: [TenantsService, MongooseModule],
})
export class TenantsModule {}
