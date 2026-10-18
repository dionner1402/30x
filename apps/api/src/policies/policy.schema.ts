import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PolicyDocument = HydratedDocument<Policy>;

@Schema({ collection: 'policies', timestamps: true })
export class Policy {
  @Prop({ required: true, index: true })
  tenantId!: string;

  @Prop({ required: true })
  version!: string;

  @Prop({
    required: true,
    enum: ['draft', 'active', 'archived'],
    default: 'draft',
  })
  status!: 'draft' | 'active' | 'archived';

  @Prop({ type: [String], default: [] })
  allowlistPayees!: string[];

  @Prop({ required: true })
  hardCap!: number;

  @Prop({ required: true })
  softCap!: number;

  @Prop({ required: true, default: true })
  blockNewPayees!: boolean;

  @Prop({ required: true, default: 5 })
  maxMismatchPercent!: number;

  @Prop({ default: 25000 })
  periodBudget!: number;

  @Prop({ default: 'USD' })
  currency!: string;

  @Prop({ default: false })
  allowFuzzyPayeeMatch!: boolean;

  /** D1 Trust Ladder — on by default */
  @Prop({ default: true })
  trustLadderEnabled!: boolean;

  @Prop({ default: 3 })
  trustMinCleanPays!: number;

  @Prop({ default: 2 })
  trustSoftCapBoost!: number;

  /** D1 Autonomy window — off by default (no rompe eval) */
  @Prop({ default: false })
  autonomyWindowEnabled!: boolean;

  @Prop({ default: 8 })
  autonomyStartHour!: number;

  @Prop({ default: 20 })
  autonomyEndHour!: number;
}

export const PolicySchema = SchemaFactory.createForClass(Policy);
PolicySchema.index({ tenantId: 1, version: 1 }, { unique: true });
