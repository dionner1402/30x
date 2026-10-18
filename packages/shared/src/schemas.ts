import { z } from 'zod';
import {
  AutonomyModeSchema,
  AutonomyModeInputSchema,
  normalizeAutonomyMode,
  AUTONOMY_LADDER,
} from './autonomy';
import type { AutonomyMode } from './autonomy';

export {
  AutonomyModeSchema,
  AutonomyModeInputSchema,
  normalizeAutonomyMode,
  AUTONOMY_LADDER,
};
export type { AutonomyMode };

export const DecisionOutcomeSchema = z.enum(['PAY', 'HOLD', 'DENY']);
export type DecisionOutcome = z.infer<typeof DecisionOutcomeSchema>;

export const PolicyStatusSchema = z.enum(['draft', 'active', 'archived']);
export type PolicyStatus = z.infer<typeof PolicyStatusSchema>;

export const PolicySchema = z.object({
  id: z.string().optional(),
  tenantId: z.string().min(1),
  version: z.string().min(1),
  status: PolicyStatusSchema.default('draft'),
  allowlistPayees: z.array(z.string()).default([]),
  hardCap: z.number().nonnegative(),
  softCap: z.number().nonnegative(),
  requireApprovalAbove: z.number().nonnegative().optional(),
  periodBudget: z.number().nonnegative().optional(),
  blockNewPayees: z.boolean().default(true),
  maxMismatchPercent: z.number().nonnegative().default(5),
  currency: z.string().default('USD'),
  allowFuzzyPayeeMatch: z.boolean().default(false),
  createdAt: z.string().datetime().optional(),
});
export type Policy = z.infer<typeof PolicySchema>;

export const LineItemSchema = z.object({
  desc: z.string(),
  amount: z.number(),
});

export const InvoiceSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string().min(1),
  source: z.enum(['upload', 'fixture', 'email', 'chat']).default('fixture'),
  fixtureId: z.string().optional(),
  rawUri: z.string().optional(),
  payeeName: z.string().min(1),
  payeeNormalized: z.string().min(1),
  amount: z.number().nonnegative(),
  currency: z.string().default('USD'),
  invoiceNumber: z.string().min(1),
  issueDate: z.string().optional(),
  dueDate: z.string().optional(),
  lineItems: z.array(LineItemSchema).optional(),
  tax: z.number().optional(),
  agreedAmount: z.number().optional(),
  fingerprint: z.string().optional(),
  mathOk: z.boolean().optional(),
  status: z.enum(['draft', 'ready', 'decided']).default('ready'),
  tags: z.array(z.string()).default([]),
  createdAt: z.string().datetime().optional(),
});
export type Invoice = z.infer<typeof InvoiceSchema>;

export const RuleFiredSchema = z.object({
  id: z.string(),
  message: z.string(),
});
export type RuleFired = z.infer<typeof RuleFiredSchema>;

export const DecisionReceiptSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string().min(1),
  invoiceId: z.string().min(1),
  policyId: z.string().min(1),
  policyVersion: z.string().min(1),
  outcome: DecisionOutcomeSchema,
  autonomyMode: AutonomyModeInputSchema,
  rulesFired: z.array(RuleFiredSchema).default([]),
  evidence: z.record(z.unknown()).default({}),
  explanation: z.string().min(1),
  counterfactual: z.string().optional(),
  receiptHash: z.string().optional(),
  idempotencyKey: z.string().min(1),
  judgment: z
    .object({
      agreed: z.boolean(),
      scores: z.record(z.number()).optional(),
      notes: z.string().optional(),
    })
    .optional(),
  createdAt: z.string().datetime().optional(),
});
export type DecisionReceipt = z.infer<typeof DecisionReceiptSchema>;

export const HealthSchema = z.object({
  ok: z.literal(true),
  version: z.string(),
  service: z.string().optional(),
});
export type Health = z.infer<typeof HealthSchema>;
