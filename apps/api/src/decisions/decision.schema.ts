import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type DecisionDocument = HydratedDocument<Decision>;

@Schema({ collection: 'decisions', timestamps: { createdAt: true, updatedAt: false } })
export class Decision {
  @Prop({ required: true, index: true })
  tenantId!: string;

  @Prop({ required: true, index: true })
  invoiceId!: string;

  @Prop({ required: true })
  policyId!: string;

  @Prop({ required: true })
  policyVersion!: string;

  @Prop({ required: true, enum: ['PAY', 'HOLD', 'DENY'] })
  outcome!: 'PAY' | 'HOLD' | 'DENY';

  @Prop({
    required: true,
    enum: [
      'advise',
      'assist',
      'autopilot',
      'advisor',
      'collaborator',
      'operator',
    ],
  })
  autonomyMode!: string;

  @Prop({ type: [{ id: String, message: String }], default: [] })
  rulesFired!: Array<{ id: string; message: string }>;

  @Prop({ type: Object, default: {} })
  evidence!: Record<string, unknown>;

  @Prop({ required: true })
  explanation!: string;

  @Prop()
  counterfactual?: string;

  @Prop({ required: true })
  receiptHash!: string;

  @Prop({ required: true, unique: true })
  idempotencyKey!: string;

  @Prop()
  fingerprint?: string;

  @Prop()
  recommendedOutcome?: string;

  @Prop({ type: Object })
  mockExecution?: { wouldPay: boolean; log: string };
}

export const DecisionSchema = SchemaFactory.createForClass(Decision);
DecisionSchema.index({ tenantId: 1, createdAt: -1 });
DecisionSchema.index({ tenantId: 1, outcome: 1 });
