import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import {
  fingerprint,
  mathCheck,
  normalizePayee,
} from '@ezallow/domain';

const PaymentCategorySchema = z.enum([
  'services',
  'suppliers',
  'payroll',
  'ops',
  'general',
]);

/** Categoría demo por fixture (variedad Banco A/B/C). */
const FIXTURE_CATEGORY: Record<string, z.infer<typeof PaymentCategorySchema>> = {
  N01: 'suppliers',
  N02: 'services',
  N03: 'suppliers',
  N04: 'ops',
  N05: 'services',
  N06: 'suppliers',
  N07: 'services',
  N08: 'services',
  N09: 'services',
  N10: 'suppliers',
  N11: 'suppliers',
  N12: 'services',
  N13: 'ops',
  N14: 'suppliers',
  N15: 'services',
  'T-DUP': 'suppliers',
  'T-NEW': 'suppliers',
  'T-SOFT': 'ops',
  'T-OVER': 'services',
  'T-MISMATCH': 'suppliers',
  'T-BUDGET': 'suppliers',
  'T-MATH': 'suppliers',
  'T-INJECT': 'suppliers',
  'T-INJECT-BANK': 'suppliers',
};

const FixtureFileSchema = z.object({
  fixtureId: z.string(),
  tags: z.array(z.string()).default([]),
  /** Categoría de pago explícita (opcional; si falta, mapa demo / default). */
  paymentCategory: PaymentCategorySchema.optional(),
  expectedOutcome: z.enum(['PAY', 'HOLD', 'DENY']).optional(),
  autonomyMode: z
    .enum([
      'advise',
      'assist',
      'autopilot',
      'advisor',
      'collaborator',
      'operator',
    ])
    .optional(),
  context: z
    .object({
      remainingBudget: z.number().optional(),
    })
    .optional(),
  duplicateOf: z.string().optional(),
  invoice: z.object({
    tenantId: z.string().default('blinka-demo'),
    source: z.enum(['upload', 'fixture', 'email', 'chat']).default('fixture'),
    payeeName: z.string(),
    amount: z.number(),
    currency: z.string().default('USD'),
    invoiceNumber: z.string(),
    issueDate: z.string().optional(),
    dueDate: z.string().optional(),
    lineItems: z
      .array(z.object({ desc: z.string().optional(), amount: z.number() }))
      .optional(),
    tax: z.number().optional(),
    agreedAmount: z.number().optional(),
  }),
});

export type ExtractedFixture = {
  fixtureId: string;
  tags: string[];
  paymentCategory: z.infer<typeof PaymentCategorySchema>;
  expectedOutcome?: 'PAY' | 'HOLD' | 'DENY';
  context?: { remainingBudget?: number };
  duplicateOf?: string;
  invoice: {
    tenantId: string;
    source: string;
    fixtureId: string;
    payeeName: string;
    payeeNormalized: string;
    amount: number;
    currency: string;
    invoiceNumber: string;
    issueDate?: string;
    dueDate?: string;
    lineItems: Array<{ desc?: string; amount: number }>;
    tax?: number;
    agreedAmount?: number;
    fingerprint: string;
    mathOk: boolean;
    status: 'ready';
    tags: string[];
    paymentCategory: z.infer<typeof PaymentCategorySchema>;
    expectedOutcome?: string;
    decisionHints?: { remainingBudget?: number };
  };
};

function fixturesRoot(): string {
  const candidates = [
    join(process.cwd(), 'fixtures'),
    join(process.cwd(), '../../fixtures'),
    join(__dirname, '../../../../fixtures'),
  ];
  for (const c of candidates) {
    if (existsSync(join(c, 'manifest.json'))) return c;
  }
  throw new Error('fixtures/ not found (run from monorepo root or keep fixtures/)');
}

/**
 * M6 — FixtureExtractor: lee JSON tipado, normaliza payee, math + fingerprint.
 * Sin LLM.
 */
export function extractFromFixture(fixtureId: string): ExtractedFixture {
  const root = fixturesRoot();
  const path = join(root, 'invoices', `${fixtureId}.json`);
  if (!existsSync(path)) {
    throw new Error(`Fixture not found: ${fixtureId}`);
  }
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const parsed = FixtureFileSchema.parse(raw);
  const inv = parsed.invoice;
  const payeeNormalized = normalizePayee(inv.payeeName);
  const math = mathCheck({
    amount: inv.amount,
    lineItems: inv.lineItems,
    tax: inv.tax,
  });
  const fp = fingerprint({
    tenantId: inv.tenantId,
    payeeName: inv.payeeName,
    invoiceNumber: inv.invoiceNumber,
    amount: inv.amount,
    currency: inv.currency,
    issueDate: inv.issueDate,
  });

  const paymentCategory =
    parsed.paymentCategory ??
    FIXTURE_CATEGORY[parsed.fixtureId] ??
    'suppliers';

  return {
    fixtureId: parsed.fixtureId,
    tags: parsed.tags,
    paymentCategory,
    expectedOutcome: parsed.expectedOutcome,
    context: parsed.context,
    duplicateOf: parsed.duplicateOf,
    invoice: {
      tenantId: inv.tenantId,
      source: 'fixture',
      fixtureId: parsed.fixtureId,
      payeeName: inv.payeeName,
      payeeNormalized,
      amount: inv.amount,
      currency: inv.currency,
      invoiceNumber: inv.invoiceNumber,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      lineItems: inv.lineItems ?? [],
      tax: inv.tax,
      agreedAmount: inv.agreedAmount,
      fingerprint: fp,
      mathOk: math.ok,
      status: 'ready',
      tags: parsed.tags,
      paymentCategory,
      expectedOutcome: parsed.expectedOutcome,
      decisionHints: parsed.context?.remainingBudget !== undefined
        ? { remainingBudget: parsed.context.remainingBudget }
        : undefined,
    },
  };
}

export function listFixtureIds(): string[] {
  const root = fixturesRoot();
  const manifest = JSON.parse(
    readFileSync(join(root, 'manifest.json'), 'utf8'),
  ) as { fixtures: Array<{ fixtureId: string }> };
  return manifest.fixtures.map((f) => f.fixtureId);
}
