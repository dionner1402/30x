import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import type { AutonomyMode } from '@ezallow/shared';

export type TenantDocument = HydratedDocument<Tenant>;

@Schema({ collection: 'tenants', timestamps: true })
export class Tenant {
  @Prop({ required: true, unique: true, index: true })
  slug!: string;

  @Prop({ required: true })
  name!: string;

  /** Canónico: advise | assist | autopilot (legacy accepted on write via service) */
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
    default: 'autopilot',
  })
  autonomyMode!: AutonomyMode | 'advisor' | 'collaborator' | 'operator';

  @Prop({ type: Types.ObjectId, ref: 'Policy', default: null })
  activePolicyId!: Types.ObjectId | null;

  /** Corridas del agente — olas por categoría (ver DEFAULT_AGENT_WAVES). */
  @Prop({ type: [Object], default: undefined })
  agentWaves?: Array<{
    id: string;
    label: string;
    timeLocal: string;
    categories: string[];
  }>;
}

export const TenantSchema = SchemaFactory.createForClass(Tenant);
