#!/usr/bin/env node
/**
 * E2E Demo Day (API) — arco N05→PAY, T-NEW→HOLD, T-SOFT→PAY, N01→PAY, T-DUP→DENY (+ override FP) + eval.
 * Requiere API en :3001 con Mongo listo.
 *
 *   pnpm e2e:demo
 */
import { randomUUID } from 'node:crypto';

const BASE = process.env.API_URL ?? 'http://127.0.0.1:3001';
const TENANT = process.env.TENANT_ID ?? 'blinka-demo';

const EXPECTED = [
  ['N05', 'PAY'],
  ['T-NEW', 'HOLD'],
  ['T-SOFT', 'PAY'],
  ['N01', 'PAY'],
  ['T-DUP', 'DENY'],
];

async function req(path, { method = 'GET', body, idempotencyKey } = {}) {
  const headers = {
    'x-tenant-id': TENANT,
    'content-type': 'application/json',
  };
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 240)}`);
  }
  return data;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log(`E2E Demo Day → ${BASE} tenant=${TENANT}`);

  const health = await req('/health');
  assert(health.ok === true, 'health.ok !== true');
  assert(health.mongo?.readyState === 1, `mongo not ready: ${JSON.stringify(health.mongo)}`);
  console.log(`  health OK db=${health.mongo?.db ?? '?'}`);

  const tenant = await req('/v1/tenants/me', {
    method: 'PATCH',
    body: { autonomyMode: 'autopilot' },
  });
  assert(tenant.autonomyMode === 'autopilot', `autonomy=${tenant.autonomyMode}`);
  console.log('  autonomy → operator');

  const policy = await req('/v1/policies/active');
  assert(policy?.softCap != null, 'no active policy');
  console.log(`  policy ${policy.version} soft=${policy.softCap} hard=${policy.hardCap}`);

  const uniqueSuffix = `e2e${Date.now().toString(36)}`;
  const results = [];

  for (const [fixtureId, want] of EXPECTED) {
    const inv = await req('/v1/invoices/from-fixture', {
      method: 'POST',
      body: { fixtureId, uniqueSuffix },
    });
    const decision = await req('/v1/decisions', {
      method: 'POST',
      body: { invoiceId: inv.id },
      idempotencyKey: randomUUID(),
    });
    const ok = decision.outcome === want;
    results.push({ fixtureId, want, got: decision.outcome, ok, id: decision.id });
    console.log(
      `  ${ok ? '✓' : '✗'} ${fixtureId} → ${decision.outcome} (esperado ${want}) · …${decision.id.slice(-6)}`,
    );
    if (!ok) {
      throw new Error(`outcome mismatch: ${fixtureId} got ${decision.outcome} want ${want}`);
    }
  }

  const n01 = results.find((r) => r.fixtureId === 'N01');
  const tdup = results.find((r) => r.fixtureId === 'T-DUP');
  assert(n01 && tdup, 'missing N01/T-DUP in results');

  const evalRun = await req('/v1/eval/runs', { method: 'POST' });
  const falsePay = evalRun.metrics?.falsePay;
  assert(falsePay === 0, `falsePay=${falsePay}`);
  console.log(`  eval GATE: ${evalRun.gate ?? `false_pay=${falsePay}`}`);

  console.log('\nGREEN — E2E Demo Day OK');
  process.exit(0);
}

main().catch((e) => {
  console.error('\nRED —', e.message || e);
  process.exit(1);
});
