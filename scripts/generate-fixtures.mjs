import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd(), 'fixtures');
mkdirSync(join(root, 'invoices'), { recursive: true });
mkdirSync(join(root, 'policies'), { recursive: true });

const allowlist = [
  'ACME Supplies LLC',
  'Cloudflare Inc',
  'Juan Perez Consulting',
  'Latam Ops Ltd',
  'Didit Labs SAS',
  'Braven Payee Co',
  'Dapta Services LLC',
  'Macondo Soft Ltd',
  'Signa Media Inc',
  'Creditop SpA',
];

const policy = {
  version: '1.2.0',
  tenantId: 'blinka-demo',
  allowlistPayees: allowlist.map((p) => p.toLowerCase()),
  hardCap: 5000,
  softCap: 1000,
  periodBudget: 25000,
  blockNewPayees: true,
  maxMismatchPercent: 5,
  currency: 'USD',
  allowFuzzyPayeeMatch: false,
};
writeFileSync(join(root, 'policies', 'demo.json'), JSON.stringify(policy, null, 2));

/** @type {Array<Record<string, unknown>>} */
const fixtures = [];

function add(f) {
  fixtures.push(f);
  writeFileSync(join(root, 'invoices', `${f.fixtureId}.json`), JSON.stringify(f, null, 2));
}

// --- 15 happy / normal ---
const normals = [
  { id: 'N01', payee: 'ACME Supplies LLC', amount: 420, inv: 'INV-2041', lines: [300, 100], tax: 20 },
  { id: 'N02', payee: 'Cloudflare Inc', amount: 180, inv: 'INV-2102', lines: [180], tax: 0 },
  { id: 'N03', payee: 'Juan Perez Consulting', amount: 750, inv: 'JP-331', lines: [750], tax: 0 },
  { id: 'N04', payee: 'Latam Ops Ltd', amount: 560, inv: 'LO-908', lines: [500, 60], tax: 0 },
  { id: 'N05', payee: 'Didit Labs SAS', amount: 990, inv: 'DL-100', lines: [900, 90], tax: 0 },
  { id: 'N06', payee: 'Braven Payee Co', amount: 320, inv: 'BR-44', lines: [300], tax: 20 },
  { id: 'N07', payee: 'Dapta Services LLC', amount: 410, inv: 'DP-12', lines: [410], tax: 0 },
  { id: 'N08', payee: 'Macondo Soft Ltd', amount: 275, inv: 'MS-77', lines: [250, 25], tax: 0 },
  { id: 'N09', payee: 'Signa Media Inc', amount: 640, inv: 'SG-201', lines: [600], tax: 40 },
  { id: 'N10', payee: 'Creditop SpA', amount: 155, inv: 'CR-9', lines: [155], tax: 0 },
  { id: 'N11', payee: 'ACME Supplies LLC', amount: 88, inv: 'INV-2045', lines: [80], tax: 8 },
  { id: 'N12', payee: 'Cloudflare Inc', amount: 499, inv: 'INV-2110', lines: [499], tax: 0 },
  { id: 'N13', payee: 'Latam Ops Ltd', amount: 812, inv: 'LO-920', lines: [800], tax: 12 },
  { id: 'N14', payee: 'Juan Perez Consulting', amount: 200, inv: 'JP-340', lines: [200], tax: 0 },
  { id: 'N15', payee: 'Didit Labs SAS', amount: 950, inv: 'DL-111', lines: [900, 50], tax: 0 },
];

for (const n of normals) {
  add({
    fixtureId: n.id,
    tags: ['happy'],
    expectedOutcome: 'PAY',
    autonomyMode: 'autopilot',
    invoice: {
      tenantId: 'blinka-demo',
      source: 'fixture',
      payeeName: n.payee,
      amount: n.amount,
      currency: 'USD',
      invoiceNumber: n.inv,
      issueDate: '2026-10-01',
      dueDate: '2026-10-30',
      lineItems: n.lines.map((amount, i) => ({ desc: `line-${i + 1}`, amount })),
      tax: n.tax,
      agreedAmount: n.amount,
    },
  });
}

// --- Trampas ---
add({
  fixtureId: 'T-DUP',
  tags: ['duplicate'],
  expectedOutcome: 'DENY',
  autonomyMode: 'autopilot',
  notes: 'Mismo fingerprint que N01 (requiere N01 decidido antes en eval)',
  duplicateOf: 'N01',
  invoice: {
    tenantId: 'blinka-demo',
    source: 'fixture',
    payeeName: 'ACME Supplies LLC',
    amount: 420,
    currency: 'USD',
    invoiceNumber: 'INV-2041',
    issueDate: '2026-10-01',
    lineItems: [
      { desc: 'line-1', amount: 300 },
      { desc: 'line-2', amount: 100 },
    ],
    tax: 20,
    agreedAmount: 420,
  },
});

add({
  fixtureId: 'T-NEW',
  tags: ['new_payee'],
  expectedOutcome: 'HOLD',
  autonomyMode: 'autopilot',
  invoice: {
    tenantId: 'blinka-demo',
    source: 'fixture',
    payeeName: 'Nova Vendor SAS',
    amount: 300,
    currency: 'USD',
    invoiceNumber: 'INV-2048',
    issueDate: '2026-10-02',
    lineItems: [{ desc: 'services', amount: 300 }],
    tax: 0,
    agreedAmount: 300,
  },
});

add({
  fixtureId: 'T-MISMATCH',
  tags: ['mismatch'],
  expectedOutcome: 'HOLD',
  autonomyMode: 'autopilot',
  invoice: {
    tenantId: 'blinka-demo',
    source: 'fixture',
    payeeName: 'ACME Supplies LLC',
    amount: 420,
    currency: 'USD',
    invoiceNumber: 'INV-2199',
    issueDate: '2026-10-03',
    lineItems: [
      { desc: 'line-1', amount: 300 },
      { desc: 'line-2', amount: 100 },
    ],
    tax: 20,
    agreedAmount: 300,
  },
});

add({
  fixtureId: 'T-OVER',
  tags: ['over_hard'],
  expectedOutcome: 'DENY',
  autonomyMode: 'autopilot',
  invoice: {
    tenantId: 'blinka-demo',
    source: 'fixture',
    payeeName: 'Cloudflare Inc',
    amount: 6200,
    currency: 'USD',
    invoiceNumber: 'INV-2051',
    issueDate: '2026-10-04',
    agreedAmount: 6200,
  },
});

add({
  fixtureId: 'T-SOFT',
  tags: ['over_soft'],
  expectedOutcome: 'HOLD',
  autonomyMode: 'autopilot',
  invoice: {
    tenantId: 'blinka-demo',
    source: 'fixture',
    payeeName: 'Latam Ops Ltd',
    amount: 2400,
    currency: 'USD',
    invoiceNumber: 'INV-2052',
    issueDate: '2026-10-05',
    agreedAmount: 2400,
  },
});

add({
  fixtureId: 'T-BUDGET',
  tags: ['budget'],
  expectedOutcome: 'HOLD',
  autonomyMode: 'autopilot',
  context: { remainingBudget: 100 },
  invoice: {
    tenantId: 'blinka-demo',
    source: 'fixture',
    payeeName: 'ACME Supplies LLC',
    amount: 420,
    currency: 'USD',
    invoiceNumber: 'INV-2060',
    issueDate: '2026-10-06',
    lineItems: [
      { desc: 'line-1', amount: 300 },
      { desc: 'line-2', amount: 100 },
    ],
    tax: 20,
    agreedAmount: 420,
  },
});

add({
  fixtureId: 'T-MATH',
  tags: ['math'],
  expectedOutcome: 'DENY',
  autonomyMode: 'autopilot',
  invoice: {
    tenantId: 'blinka-demo',
    source: 'fixture',
    payeeName: 'ACME Supplies LLC',
    amount: 500,
    currency: 'USD',
    invoiceNumber: 'INV-2070',
    issueDate: '2026-10-07',
    lineItems: [{ desc: 'broken', amount: 100 }],
    tax: 0,
    agreedAmount: 500,
  },
});

const manifest = {
  tenantId: 'blinka-demo',
  policy: 'policies/demo.json',
  count: fixtures.length,
  normals: fixtures.filter((f) => f.tags?.includes('happy')).length,
  traps: fixtures.filter((f) => !f.tags?.includes('happy')).length,
  fixtures: fixtures.map((f) => ({
    fixtureId: f.fixtureId,
    tags: f.tags,
    expectedOutcome: f.expectedOutcome,
    file: `invoices/${f.fixtureId}.json`,
  })),
};

writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(
  `OK fixtures=${manifest.count} normals=${manifest.normals} traps=${manifest.traps}`,
);
