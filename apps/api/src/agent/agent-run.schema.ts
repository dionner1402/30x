import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AgentRunDocument = HydratedDocument<AgentRun>;

@Schema({ collection: 'agent_runs', timestamps: true })
export class AgentRun {
  @Prop({ required: true, index: true })
  tenantId!: string;

  @Prop({ required: true })
  autonomyMode!: string;

  @Prop({
    type: [
      {
        waveId: String,
        label: String,
        timeLocal: String,
        reviewed: Number,
        tally: { PAY: Number, HOLD: Number, DENY: Number },
      },
    ],
    default: [],
  })
  waves!: Array<{
    waveId: string;
    label: string;
    timeLocal: string;
    reviewed: number;
    tally: { PAY: number; HOLD: number; DENY: number };
  }>;

  @Prop({
    type: { PAY: Number, HOLD: Number, DENY: Number },
    required: true,
  })
  totals!: { PAY: number; HOLD: number; DENY: number };

  @Prop({ required: true })
  message!: string;
}

export const AgentRunSchema = SchemaFactory.createForClass(AgentRun);
