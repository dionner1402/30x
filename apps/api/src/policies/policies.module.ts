import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Tenant, TenantSchema } from '../tenants/tenant.schema';
import { PoliciesController } from './policies.controller';
import { PoliciesService } from './policies.service';
import { Policy, PolicySchema } from './policy.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Policy.name, schema: PolicySchema },
      { name: Tenant.name, schema: TenantSchema },
    ]),
  ],
  controllers: [PoliciesController],
  providers: [PoliciesService],
  exports: [PoliciesService, MongooseModule],
})
export class PoliciesModule {}
