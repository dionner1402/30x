import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type InvoiceDocument = HydratedDocument<Invoice>;

@Schema({ collection: 'invoices', timestamps: true })
export class Invoice {
  @Prop({ required: true, index: true })
  tenantId!: string;

  @Prop({ required: true, enum: ['upload', 'fixture', 'email', 'chat'], default: 'fixture' })
  source!: string;

  @Prop()
  fixtureId?: string;

  @Prop({ required: true })
  payeeName!: string;

  @Prop({ required: true })
  payeeNormalized!: string;

  @Prop({ required: true })
  amount!: number;

  @Prop({ required: true, default: 'USD' })
  currency!: string;

  @Prop({ required: true })
  invoiceNumber!: string;

  @Prop()
  issueDate?: string;

  @Prop()
  dueDate?: string;

  @Prop({ type: [{ desc: String, amount: Number }], default: [] })
  lineItems!: Array<{ desc?: string; amount: number }>;

  @Prop()
  tax?: number;

  @Prop()
  agreedAmount?: number;

  @Prop({ required: true, index: true })
  fingerprint!: string;

  @Prop({ required: true })
  mathOk!: boolean;

  @Prop({
    required: true,
    enum: ['draft', 'ready', 'decided'],
    default: 'ready',
  })
  status!: string;

  @Prop({ type: [String], default: [] })
  tags!: string[];

  /**
   * Categoría de gasto → elige cuenta bancaria (services/suppliers/…).
   * Distinta de `tags` (trampas del brief: happy, duplicate…).
   */
  @Prop({
    enum: ['services', 'suppliers', 'payroll', 'ops', 'general'],
    default: 'suppliers',
  })
  paymentCategory!: string;

  @Prop()
  expectedOutcome?: string;

  /** Hints de fixture (ej. T-BUDGET) */
  @Prop({ type: Object })
  decisionHints?: { remainingBudget?: number };
}

export const InvoiceSchema = SchemaFactory.createForClass(Invoice);
InvoiceSchema.index({ tenantId: 1, fingerprint: 1 });
InvoiceSchema.index({ tenantId: 1, createdAt: -1 });
