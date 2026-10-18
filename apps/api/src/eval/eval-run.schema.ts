import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type EvalRunDocument = HydratedDocument<EvalRun>;

@Schema({ collection: 'eval_runs', timestamps: true })
export class EvalRun {
  @Prop({ required: true, index: true })
  tenantId!: string;

  @Prop({ type: Array, default: [] })
  cases!: Array<{
    fixtureId: string;
    tags: string[];
    expected: string;
    actual: string;
    ok: boolean;
    falsePay: boolean;
  }>;

  @Prop({ type: Object, required: true })
  metrics!: {
    total: number;
    passed: number;
    falsePay: number;
    falseDeny: number;
    accuracy: number;
    autonomyRate: number;
  };

  @Prop({ required: true })
  passedGate!: boolean;
}

export const EvalRunSchema = SchemaFactory.createForClass(EvalRun);
