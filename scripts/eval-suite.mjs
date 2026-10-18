/**
 * F4.3 gate — pnpm eval:suite
 * Requiere API arriba en :3001 y túnel SOCKS si usas Atlas.
 */
const base = process.env.API_URL ?? 'http://127.0.0.1:3001';
const tenant = process.env.DEFAULT_TENANT_ID ?? 'blinka-demo';

const res = await fetch(`${base}/v1/eval/runs`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-tenant-id': tenant,
  },
});

if (!res.ok) {
  console.error('FAIL HTTP', res.status, await res.text());
  process.exit(1);
}

const body = await res.json();
const { metrics, passedGate, gate, cases } = body;

console.log('\n=== EzAllow Eval Suite ===');
console.log(gate);
console.log(
  JSON.stringify(
    {
      total: metrics.total,
      passed: metrics.passed,
      falsePay: metrics.falsePay,
      falseDeny: metrics.falseDeny,
      accuracy: metrics.accuracy,
      autonomyRate: metrics.autonomyRate,
    },
    null,
    2,
  ),
);

const failed = (cases ?? []).filter((c) => !c.ok);
if (failed.length) {
  console.log('\nFailed cases:');
  for (const c of failed) {
    console.log(`  ${c.fixtureId}: expected=${c.expected} actual=${c.actual}`);
  }
}

if (!passedGate || metrics.falsePay > 0) {
  console.error('\nGATE RED — false_pay > 0 (descalifica)');
  process.exit(1);
}

console.log('\nGATE GREEN — false_pay = 0');
process.exit(0);
