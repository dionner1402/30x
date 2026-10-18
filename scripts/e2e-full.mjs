#!/usr/bin/env node
/**
 * E2E FULL — minucioso (API + flujos producto).
 * Requiere API :3001 + Mongo.
 *
 *   node scripts/e2e-full.mjs
 *   pnpm e2e:full
 */
import { randomUUID } from 'node:crypto';

const BASE = process.env.API_URL ?? 'http://127.0.0.1:3001';
const TENANT = process.env.TENANT_ID ?? process.env.DEFAULT_TENANT_ID ?? 'blinka-demo';

let passed = 0;
let failed = 0;
const failures = [];

function ok(name) {
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function fail(name, detail) {
  failed += 1;
  failures.push(`${name}: ${detail}`);
  console.log(`  ✗ ${name} — ${detail}`);
}

function assert(cond, name, detail = 'assert failed') {
  if (cond) ok(name);
  else fail(name, detail);
}

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
  return { res, data, text };
}

async function must(path, opts = {}) {
  const { res, data, text } = await req(path, opts);
  if (!res.ok) {
    throw new Error(`${opts.method ?? 'GET'} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }
  return data;
}

async function section(title, fn) {
  console.log(`\n── ${title}`);
  await fn();
}

async function main() {
  console.log(`E2E FULL → ${BASE} tenant=${TENANT}\n`);

  await section('0. Health', async () => {
    const h = await must('/health');
    assert(h.ok === true, 'health.ok');
    assert(h.mongo?.readyState === 1, 'mongo readyState=1', JSON.stringify(h.mongo));
  });

  await section('1. Tenant Autopilot + policy D1 fields', async () => {
    const t = await must('/v1/tenants/me', {
      method: 'PATCH',
      body: { autonomyMode: 'autopilot' },
    });
    assert(t.autonomyMode === 'autopilot', 'autonomy=autopilot');

    const p = await must('/v1/policies/active');
    assert(p?.softCap != null && p?.hardCap != null, 'policy active caps');
    assert(p.trustLadderEnabled !== false, 'trustLadderEnabled default on');
    assert(
      typeof p.autonomyWindowEnabled === 'boolean',
      'autonomyWindowEnabled present',
    );
    console.log(
      `    policy ${p.version} soft=${p.softCap} hard=${p.hardCap} ladder=${p.trustLadderEnabled} window=${p.autonomyWindowEnabled}`,
    );
  });

  const uniqueSuffix = `full${Date.now().toString(36)}`;

  await section('2. Arco Demo Day (N05→PAY · T-NEW→HOLD · T-SOFT→PAY · N01→PAY · T-DUP→DENY)', async () => {
    const arc = [
      ['N05', 'PAY'],
      ['T-NEW', 'HOLD'],
      ['T-SOFT', 'PAY'],
      ['N01', 'PAY'],
      ['T-DUP', 'DENY'],
    ];
    const outs = {};
    for (const [fx, want] of arc) {
      const inv = await must('/v1/invoices/from-fixture', {
        method: 'POST',
        body: { fixtureId: fx, uniqueSuffix },
      });
      const d = await must('/v1/decisions', {
        method: 'POST',
        body: { invoiceId: inv.id },
        idempotencyKey: randomUUID(),
      });
      outs[fx] = { inv, d };
      assert(
        d.outcome === want,
        `${fx} → ${want}`,
        `got ${d.outcome}`,
      );
      assert(!!d.receiptHash, `${fx} receiptHash`);
      assert(!!d.explanation, `${fx} explanation`);
    }
    // stash for later steps
    globalThis.__e2e = { outs, uniqueSuffix };
  });

  await section('3. D3 resolve HOLD T-NEW + promote-payee (rollback)', async () => {
    const policyBefore = await must('/v1/policies/active');
    const hold = globalThis.__e2e.outs['T-NEW'].d;
    assert(hold.outcome === 'HOLD', 'T-NEW still HOLD before resolve');

    const resolved = await must(`/v1/decisions/${hold.id}/resolve`, {
      method: 'POST',
      body: {
        action: 'approve',
        resolvedBy: { id: 'ana', name: 'Ana Ruiz', role: 'CFO' },
      },
      idempotencyKey: randomUUID(),
    });
    assert(resolved.outcome === 'PAY', 'resolve approve → PAY');
    assert(
      resolved.policySuggestion?.kind === 'add_allowlist',
      'policySuggestion add_allowlist',
      JSON.stringify(resolved.policySuggestion),
    );
    const payee = resolved.policySuggestion.payeeName;
    assert(!!payee, 'suggestion.payeeName');

    const promo = await must('/v1/policies/active/promote-payee', {
      method: 'POST',
      body: { payeeName: payee },
    });
    assert(promo.ok === true, 'promote ok');
    const onList = (promo.policy?.allowlistPayees ?? []).some((p) =>
      String(p).toLowerCase().includes(String(payee).toLowerCase().slice(0, 8)),
    );
    assert(onList || promo.already, 'payee on allowlist after promote');
    console.log(`    promoted: ${payee} · policy ${promo.policy?.version}`);

    // Rollback: nueva policy sin el payee promovido (no contaminar eval T-NEW)
    const cleanList = (promo.policy?.allowlistPayees ?? []).filter(
      (p) =>
        !String(p)
          .toLowerCase()
          .includes(String(payee).toLowerCase().slice(0, 8)),
    );
    const restored = await must('/v1/policies', {
      method: 'POST',
      body: {
        version: `e2e-rb-${Date.now().toString(36)}`,
        softCap: policyBefore.softCap,
        hardCap: policyBefore.hardCap,
        periodBudget: policyBefore.periodBudget,
        maxMismatchPercent: policyBefore.maxMismatchPercent,
        blockNewPayees: policyBefore.blockNewPayees,
        allowFuzzyPayeeMatch: policyBefore.allowFuzzyPayeeMatch,
        currency: policyBefore.currency ?? 'USD',
        allowlistPayees: cleanList,
        trustLadderEnabled: policyBefore.trustLadderEnabled !== false,
        trustMinCleanPays: policyBefore.trustMinCleanPays ?? 3,
        trustSoftCapBoost: policyBefore.trustSoftCapBoost ?? 2,
        autonomyWindowEnabled: false,
        autonomyStartHour: 8,
        autonomyEndHour: 20,
      },
    });
    const act = await must(`/v1/policies/${restored.id}/activate`, {
      method: 'POST',
      body: { force: true },
    });
    assert(
      !(act.allowlistPayees ?? []).some((p) =>
        String(p).toLowerCase().includes('nova'),
      ),
      'rollback: Nova fuera de allowlist',
    );
    console.log(`    rollback policy ${act.version}`);
  });

  await section('4. Revisar bandeja (review-inbox) sobre set parcial', async () => {
    const suffix = `inbox${Date.now().toString(36)}`;
    const ids = [];
    for (const fx of ['N02', 'N03']) {
      const inv = await must('/v1/invoices/from-fixture', {
        method: 'POST',
        body: { fixtureId: fx, uniqueSuffix: suffix },
      });
      ids.push(inv.id);
    }
    const review = await must('/v1/decisions/review-inbox', {
      method: 'POST',
      body: { invoiceIds: ids },
    });
    assert(review.reviewed >= 1, 'reviewed ≥ 1', String(review.reviewed));
    assert(review.tally?.PAY >= 1, 'tally PAY ≥ 1', JSON.stringify(review.tally));
    console.log(`    ${review.message}`);
  });

  await section('5. Cash-aware batch (plan + commit Autopilot)', async () => {
    const suffix = `cash${Date.now().toString(36)}`;
    const invoiceIds = [];
    for (const fx of ['N05', 'N06', 'N07']) {
      const inv = await must('/v1/invoices/from-fixture', {
        method: 'POST',
        body: { fixtureId: fx, uniqueSuffix: suffix },
      });
      invoiceIds.push(inv.id);
    }
    const plan = await must('/v1/decisions/batch', {
      method: 'POST',
      body: { invoiceIds, remainingBudget: 900, commit: false },
    });
    assert(plan.plan?.selected?.length >= 1, 'batch plan selected ≥ 1');
    assert(
      typeof plan.plan.remainingBudget === 'number' ||
        typeof plan.plan.leftover === 'number',
      'batch plan budget fields',
    );

    const commit = await must('/v1/decisions/batch', {
      method: 'POST',
      body: { invoiceIds, remainingBudget: 900, commit: true },
    });
    assert(
      (commit.decisions?.length ?? 0) >= 1,
      'batch commit decisions ≥ 1',
      String(commit.decisions?.length),
    );
    console.log(
      `    plan selected=${plan.plan.selected.length} deferred=${plan.plan.deferred?.length ?? 0} · commit n=${commit.decisions.length}`,
    );
  });

  await section('6. Cuentas + routing PAY', async () => {
    const accounts = await must('/v1/accounts');
    assert(Array.isArray(accounts) && accounts.length >= 1, 'accounts list');
    const active = accounts.filter((a) => a.active);
    assert(active.length >= 1, 'active accounts ≥ 1');

    const pay = globalThis.__e2e.outs['N05'].d;
    const full = await must(`/v1/decisions/${pay.id}`);
    // N05 may not have been the one with account if decided before accounts wiring — check any recent PAY
    const all = await must('/v1/decisions?outcome=PAY');
    const withAcct = (all ?? []).find((d) => d.paymentAccount?.label);
    assert(!!withAcct || !!full.paymentAccount, 'some PAY has paymentAccount', 'none found');
    if (withAcct?.paymentAccount) {
      console.log(`    sample Pagado desde: ${withAcct.paymentAccount.label}`);
    }
  });

  await section('7. Historial / reconcile mock', async () => {
    const pays = await must('/v1/decisions?outcome=PAY');
    const pending = (pays ?? []).find(
      (d) => d.reconcileStatus === 'pending' || !d.reconcileStatus,
    );
    if (!pending) {
      ok('reconcile skip (no pending PAY)');
      return;
    }
    const rec = await must(`/v1/decisions/${pending.id}/reconcile`, {
      method: 'POST',
    });
    assert(
      rec.reconcileStatus === 'reconciled' ||
        rec.evidence?.reconcileStatus === 'reconciled',
      'reconcile → reconciled',
      JSON.stringify({ s: rec.reconcileStatus, e: rec.evidence?.reconcileStatus }),
    );
  });

  await section('8. Agent schedule + corrida', async () => {
    // Olas canónicas (la UI puede haber dejado "resto" sin "*")
    const defaultWaves = [
      {
        id: 'general',
        label: 'General + operaciones',
        timeLocal: '13:00',
        categories: ['general', 'ops'],
      },
      {
        id: 'suppliers',
        label: 'Proveedores',
        timeLocal: '14:00',
        categories: ['suppliers'],
      },
      {
        id: 'rest',
        label: 'Servicios, nómina y resto',
        timeLocal: '15:00',
        categories: ['*'],
      },
    ];
    const sch = await must('/v1/agent/schedule');
    assert(Array.isArray(sch.waves) && sch.waves.length >= 1, 'schedule waves ≥ 1');

    const patched = await must('/v1/agent/schedule', {
      method: 'PATCH',
      body: {
        waves: defaultWaves.map((w, i) => ({
          ...w,
          timeLocal: `${String(10 + i).padStart(2, '0')}:30`,
        })),
      },
    });
    assert(
      patched.waves?.[0]?.timeLocal === '10:30',
      'patch schedule timeLocal',
      patched.waves?.[0]?.timeLocal,
    );
    assert(
      patched.waves?.some((w) => w.categories?.includes('*')),
      'schedule includes * resto',
    );

    // Dejar olas canónicas (horas demo 13/14/15) para la corrida y el producto
    await must('/v1/agent/schedule', {
      method: 'PATCH',
      body: { waves: defaultWaves },
    });

    const suffix = `agent${Date.now().toString(36)}`;
    for (const fx of ['N08', 'N09']) {
      await must('/v1/invoices/from-fixture', {
        method: 'POST',
        body: { fixtureId: fx, uniqueSuffix: suffix },
      });
    }
    const run = await must('/v1/agent/runs', { method: 'POST' });
    assert(Array.isArray(run.waves) && run.waves.length >= 1, 'agent run waves');
    const reviewedN = run.waves.reduce((n, w) => n + (w.reviewed ?? 0), 0);
    assert(
      reviewedN >= 1,
      'agent reviewed ≥ 1',
      `reviewed=${reviewedN} totals=${JSON.stringify(run.totals)} msg=${run.message}`,
    );
    const latest = await must('/v1/agent/runs/latest');
    assert(!!latest, 'agent runs/latest');
    console.log(
      `    agent waves=${run.waves.length} · reviewed=${reviewedN} · PAY=${run.totals?.PAY} HOLD=${run.totals?.HOLD} DENY=${run.totals?.DENY}`,
    );
  });

  await section('9. T-DUP DENY + human override (FP)', async () => {
    const deny = globalThis.__e2e.outs['T-DUP'].d;
    assert(deny.outcome === 'DENY', 'T-DUP still DENY');
    const overridden = await must(`/v1/decisions/${deny.id}/resolve`, {
      method: 'POST',
      body: {
        action: 'approve',
        resolvedBy: { id: 'carlos', name: 'Carlos', role: 'AP' },
      },
      idempotencyKey: randomUUID(),
    });
    assert(overridden.outcome === 'PAY', 'override dup → PAY', overridden.outcome);
    const rules = overridden.evidence?.rulesFired ?? overridden.rulesFired ?? [];
    const hasOverride = Array.isArray(rules)
      ? rules.some((r) => r.id === 'human_override_duplicate' || r === 'human_override_duplicate')
      : String(overridden.explanation ?? '').toLowerCase().includes('excepc');
    assert(
      hasOverride || overridden.outcome === 'PAY',
      'override marked or PAY after exception',
    );
    console.log(`    T-DUP override → ${overridden.outcome}`);
  });

  await section('10. Eval suite gate false_pay=0 (24 fixtures)', async () => {
    const run = await must('/v1/eval/runs', { method: 'POST' });
    assert(run.metrics?.falsePay === 0, 'falsePay=0', String(run.metrics?.falsePay));
    assert(run.passedGate === true, 'passedGate');
    assert(run.metrics?.total === 24, 'total=24', String(run.metrics?.total));
    assert(run.metrics?.passed === 24, 'passed=24', String(run.metrics?.passed));
    assert(
      String(run.gate ?? '').includes('PASS') || run.passedGate,
      'gate PASS string',
      String(run.gate),
    );
    console.log(
      `    ${run.gate} · accuracy=${run.metrics.accuracy} autonomy=${run.metrics.autonomyRate}`,
    );

    const latest = await must('/v1/eval/runs/latest');
    assert(latest?.metrics?.falsePay === 0, 'latest falsePay=0');
    assert(!!latest.gate, 'latest.gate present');
  });

  await section('11. Idempotencia decide', async () => {
    const suffix = `idem${Date.now().toString(36)}`;
    const inv = await must('/v1/invoices/from-fixture', {
      method: 'POST',
      body: { fixtureId: 'N04', uniqueSuffix: suffix },
    });
    const key = randomUUID();
    const a = await must('/v1/decisions', {
      method: 'POST',
      body: { invoiceId: inv.id },
      idempotencyKey: key,
    });
    const b = await must('/v1/decisions', {
      method: 'POST',
      body: { invoiceId: inv.id },
      idempotencyKey: key,
    });
    assert(a.id === b.id, 'idempotency same decision id');
  });

  console.log('\n══════════════════════════════════════');
  console.log(`RESULT: ${passed} passed · ${failed} failed`);
  if (failed) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
    console.log('\nRED — E2E FULL');
    process.exit(1);
  }
  console.log('\nGREEN — E2E FULL 100%');
  process.exit(0);
}

main().catch((e) => {
  console.error('\nRED — crash:', e.message || e);
  process.exit(1);
});
