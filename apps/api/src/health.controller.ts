import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import {
  DecisionOutcomeSchema,
  EZALLOW_VERSION,
  InvoiceSchema,
  PolicySchema,
  DecisionReceiptSchema,
} from '@ezallow/shared';
import type { Connection } from 'mongoose';

@Controller()
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Get('health')
  health() {
    return {
      ok: true,
      version: EZALLOW_VERSION,
      service: 'ezallow-api',
      mongo: {
        readyState: this.connection.readyState,
        db: this.connection.name,
      },
      schemas: {
        invoice: InvoiceSchema.shape.amount !== undefined,
        policy: PolicySchema.shape.hardCap !== undefined,
        receipt: DecisionReceiptSchema.shape.outcome !== undefined,
        outcomes: DecisionOutcomeSchema.options,
      },
    };
  }
}
