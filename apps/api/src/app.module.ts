import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { join } from 'node:path';
import { AgentModule } from './agent/agent.module';
import { AccountsModule } from './accounts/accounts.module';
import { DecisionsModule } from './decisions/decisions.module';
import { EvalModule } from './eval/eval.module';
import { HealthController } from './health.controller';
import { InvoicesModule } from './invoices/invoices.module';
import { PoliciesModule } from './policies/policies.module';
import { TenantsModule } from './tenants/tenants.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(__dirname, '../../../.env'),
        join(process.cwd(), '../../.env'),
        join(process.cwd(), '.env'),
      ],
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const uri = config.get<string>('MONGODB_URI');
        if (!uri) {
          throw new Error('MONGODB_URI is required');
        }
        const proxyHost = config.get<string>('MONGODB_PROXY_HOST');
        const proxyPortRaw = config.get<string>('MONGODB_PROXY_PORT');
        const proxyPort = proxyPortRaw ? Number(proxyPortRaw) : undefined;
        // Acceso Atlas vía SOCKS (ssh -N -D 1080 …)
        if (proxyHost && proxyPort) {
          return {
            uri,
            proxyHost,
            proxyPort,
          };
        }
        return { uri };
      },
    }),
    TenantsModule,
    PoliciesModule,
    InvoicesModule,
    AccountsModule,
    DecisionsModule,
    AgentModule,
    EvalModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
