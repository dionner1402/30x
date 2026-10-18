import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Policy, PolicySchema } from '../policies/policy.schema';
import { Tenant, TenantSchema } from '../tenants/tenant.schema';
import { EvalController } from './eval.controller';
import { EvalRun, EvalRunSchema } from './eval-run.schema';
import { EvalService } from './eval.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: EvalRun.name, schema: EvalRunSchema },
      { name: Policy.name, schema: PolicySchema },
      { name: Tenant.name, schema: TenantSchema },
    ]),
  ],
  controllers: [EvalController],
  providers: [EvalService],
  exports: [EvalService],
})
export class EvalModule {}
