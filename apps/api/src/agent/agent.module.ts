import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DecisionsModule } from '../decisions/decisions.module';
import { Tenant, TenantSchema } from '../tenants/tenant.schema';
import { AgentRun, AgentRunSchema } from './agent-run.schema';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';

@Module({
  imports: [
    DecisionsModule,
    MongooseModule.forFeature([
      { name: Tenant.name, schema: TenantSchema },
      { name: AgentRun.name, schema: AgentRunSchema },
    ]),
  ],
  controllers: [AgentController],
  providers: [AgentService],
})
export class AgentModule {}
