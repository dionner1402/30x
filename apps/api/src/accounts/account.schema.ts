import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AccountDocument = HydratedDocument<Account>;

/** Uso operativo de la cuenta bancaria de la empresa. */
export const ACCOUNT_USAGES = [
  'services',
  'suppliers',
  'payroll',
  'ops',
  'general',
] as const;
export type AccountUsage = (typeof ACCOUNT_USAGES)[number];

@Schema({ collection: 'payment_accounts', timestamps: true })
export class Account {
  @Prop({ required: true, index: true })
  tenantId!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  bank!: string;

  @Prop({ required: true, enum: ACCOUNT_USAGES })
  usage!: AccountUsage;

  /** 1 = máxima prioridad al elegir cuenta para un PAY */
  @Prop({ required: true, default: 50 })
  priority!: number;

  @Prop({ default: 'USD' })
  currency!: string;

  @Prop({ default: true })
  active!: boolean;

  /** Saldo simulado (demo) */
  @Prop({ default: 0 })
  mockBalance!: number;
}

export const AccountSchema = SchemaFactory.createForClass(Account);
AccountSchema.index({ tenantId: 1, usage: 1, priority: 1 });
/** Evita seeds duplicados (React Strict Mode / dobles GET). */
AccountSchema.index(
  { tenantId: 1, bank: 1, name: 1, usage: 1 },
  { unique: true },
);
