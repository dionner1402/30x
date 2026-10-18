'use client';

import Link from 'next/link';
import {
  Play,
  Sparkles,
  Unplug,
  Upload,
  Wallet,
  Waypoints,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Guide } from '../../components/Guide';
import { Pagination, paginate } from '../../components/Pagination';
import { Shell } from '../../components/Shell';
import { Tag } from '../../components/Tag';
import { WorkProgress } from '../../components/WorkProgress';
import {
  api,
  type BatchPlan,
  type Invoice,
} from '../../lib/api';
import { MOCK_RAIL_TOAST } from '../../lib/copy';
import { formatDay } from '../../lib/invoice-display';
import { displayInvoiceId } from '../../lib/tags';

/** Lote demo A5: varias ALLOW + presupuesto corto */
const CASH_LOAD = ['N05', 'N06', 'N07', 'N08', 'N09', 'N10'] as const;

function formatUsd(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

/** Score relativo 0–1 para UI (el motor usa urgencia − monto). */
function displayScore(score: number, maxScore: number) {
  if (!maxScore || maxScore <= 0) return '-';
  return (score / maxScore).toFixed(2);
}

type RankedItem = {
  id: string;
  amount: number;
  score: number;
  label?: string;
  outcome: 'PAY' | 'HOLD' | 'SKIP';
  reason?: string;
  priority: number;
};

export default function CashPage() {
  const [batch, setBatch] = useState<Invoice[]>([]);
  const [budget, setBudget] = useState(900);
  const [plan, setPlan] = useState<BatchPlan | null>(null);
  const [committed, setCommitted] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [work, setWork] = useState<{
    title: string;
    detail?: string;
    current: number;
    total: number;
  } | null>(null);

  const pending = useMemo(
    () => batch.filter((i) => i.status !== 'decided'),
    [batch],
  );

  /** Demanda del lote cargado (no se borra al ejecutar). */
  const demandTotal = useMemo(
    () => batch.reduce((s, i) => s + i.amount, 0),
    [batch],
  );

  const ranked = useMemo((): RankedItem[] => {
    if (!plan) return [];
    const rows: Omit<RankedItem, 'priority'>[] = [
      ...plan.selected.map((s) => ({
        ...s,
        outcome: 'PAY' as const,
      })),
      ...plan.deferred.map((d) => ({
        ...d,
        outcome:
          d.reason === 'not_eligible' ? ('SKIP' as const) : ('HOLD' as const),
        reason: d.reason,
      })),
    ];
    return rows
      .sort((a, b) => b.score - a.score || a.amount - b.amount)
      .map((row, i) => ({ ...row, priority: i + 1 }));
  }, [plan]);

  const priorityById = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of ranked) m.set(r.id, r.priority);
    return m;
  }, [ranked]);

  const maxScore = useMemo(
    () => Math.max(0, ...ranked.map((r) => r.score)),
    [ranked],
  );

  const deferredTotal = useMemo(
    () =>
      plan
        ? plan.deferred
            .filter((d) => d.reason === 'budget_deferred')
            .reduce((s, d) => s + d.amount, 0)
        : 0,
    [plan],
  );

  const sortedBatch = useMemo(() => {
    return [...batch].sort((a, b) => {
      if (!plan) return 0;
      return (
        (priorityById.get(a.id) ?? 99) - (priorityById.get(b.id) ?? 99)
      );
    });
  }, [batch, plan, priorityById]);

  const pagedBatch = useMemo(
    () => paginate(sortedBatch, page),
    [sortedBatch, page],
  );

  function invoiceLabel(id: string, fallback?: string) {
    const inv = batch.find((c) => c.id === id);
    if (inv) return displayInvoiceId(inv.invoiceNumber);
    if (fallback && /[A-Z]/.test(fallback) && fallback.includes('-')) {
      return displayInvoiceId(fallback);
    }
    return fallback ? String(fallback) : `…${id.slice(-6)}`;
  }

  function whySelected(s: BatchPlan['selected'][number]): string {
    const p = priorityById.get(s.id) ?? '-';
    return `#${p} · urgencia/monto · cabe bajo el cap`;
  }

  function whyDeferred(d: BatchPlan['deferred'][number]): string {
    const p = priorityById.get(d.id) ?? '-';
    if (d.reason === 'not_eligible') {
      return `#${p} · no elegible a nivel individual`;
    }
    if (!plan) return `#${p}`;
    if (d.amount > plan.remainingBudget) {
      return `#${p} · no cabe ni sola (${formatUsd(d.amount)} > presupuesto)`;
    }
    return `#${p} · menor prioridad · no cabe tras las de arriba (sobrante ${formatUsd(plan.leftover)})`;
  }

  const counterfactual = useMemo(() => {
    if (!plan) return null;
    const first = plan.deferred.find((d) => d.reason === 'budget_deferred');
    if (!first) return null;
    const need = plan.spent + first.amount;
    const inv = batch.find((c) => c.id === first.id);
    const label = inv
      ? displayInvoiceId(inv.invoiceNumber)
      : first.label ?? first.id.slice(-6);
    return `Contrafactual: con ${formatUsd(need)} de presupuesto, ${label} también sería PAY.`;
  }, [plan, batch]);

  async function ensureAutopilot(): Promise<boolean> {
    const t = await api.tenant();
    if (t.autonomyMode === 'autopilot') return false;
    await api.patchTenant({ autonomyMode: 'autopilot' });
    return true;
  }

  async function loadCashSet() {
    setBusy(true);
    setToast(null);
    setWork({
      title: 'Cargando lote cash-aware…',
      detail: CASH_LOAD[0],
      current: 0,
      total: CASH_LOAD.length,
    });
    try {
      const switched = await ensureAutopilot();
      const uniqueSuffix = `c${Date.now().toString(36)}`;
      const loaded: Invoice[] = [];
      for (let i = 0; i < CASH_LOAD.length; i++) {
        const id = CASH_LOAD[i];
        setWork({
          title: 'Cargando lote cash-aware…',
          detail: id,
          current: i + 1,
          total: CASH_LOAD.length,
        });
        loaded.push(await api.fromFixture(id, { uniqueSuffix }));
      }
      setBatch(loaded);
      setPlan(null);
      setCommitted(false);
      setPage(1);
      setWork(null);
      setToast(
        switched
          ? `Lote ${CASH_LOAD.join(' · ')} · autonomía → Autopilot`
          : `Lote cash-aware: ${CASH_LOAD.join(' · ')}`,
      );
    } catch (e) {
      setWork(null);
      setToast(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function run(commit: boolean) {
    if (!pending.length) {
      setToast(
        committed
          ? 'Este lote ya se ejecutó. Carga otro lote demo.'
          : 'Carga el lote demo primero',
      );
      return;
    }
    const remainingBudget = Number(budget);
    if (!Number.isFinite(remainingBudget) || remainingBudget < 0) {
      setToast('Presupuesto inválido');
      return;
    }
    setBusy(true);
    setToast(null);
    setWork({
      title: commit ? 'Ejecutando lote…' : 'Optimizando lote…',
      detail: `${pending.length} candidatas · ${formatUsd(remainingBudget)}`,
      current: 1,
      total: 1,
    });
    try {
      await ensureAutopilot();
      const res = await api.decideBatch({
        invoiceIds: pending.map((i) => i.id),
        remainingBudget,
        commit,
      });
      setPlan(res.plan);
      if (commit) {
        const deferred = res.plan.deferred.filter(
          (d) => d.reason === 'budget_deferred',
        ).length;
        // Sync status desde API (fuente de verdad)
        const fresh = await api.invoices();
        const byId = new Map(fresh.map((i) => [i.id, i]));
        setBatch((prev) =>
          prev.map((inv) => byId.get(inv.id) ?? { ...inv, status: 'decided' }),
        );
        setCommitted(true);
        setWork(null);
        setToast(
          `Scheduler A5: ${res.plan.selected.length} PAY · ${deferred} HOLD budget_deferred · saldos debitados`,
        );
      } else {
        setCommitted(false);
        setWork(null);
        setToast(
          `Vista previa: ${res.plan.selected.length} caben · ${formatUsd(res.plan.spent)} / ${formatUsd(remainingBudget)}`,
        );
      }
    } catch (e) {
      setWork(null);
      setToast(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell
      title="Presupuesto"
      subtitle="Planificador cash-aware · A5"
      actions={
        <>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setToast(MOCK_RAIL_TOAST)}
          >
            <Unplug className="icon" aria-hidden />
            Rail mock
          </button>
          <Link className="btn btn-sm" href="/eval">
            <Play className="icon" aria-hidden />
            Ejecutar eval
          </Link>
        </>
      }
    >
      <Guide
        icon={Waypoints}
        items={[
          'Cargar lote demo (N05–N10) · presupuesto por defecto $900',
          'Optimizar = vista previa · Ejecutar = PAY + HOLD budget_deferred en ledger',
          'Prioridad = urgencia por vencimiento; a igualdad, monto menor',
        ]}
      >
        Diferenciador A5: cuando varias facturas son válidas pero el presupuesto
        no alcanza para todas, EzAllow no hace FIFO: optimiza el set admisible.
      </Guide>

      <div className="toolbar">
        <div>
          <h2>Planificador bajo presupuesto</h2>
          <p>
            {committed
              ? 'Lote ejecutado · revisa Decisiones / Historial / Cuentas'
              : 'Decisión bajo restricciones · no es «IA mágica»'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy}
            onClick={() => void loadCashSet()}
          >
            <Upload className="icon" aria-hidden />
            Cargar lote demo
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy || !pending.length}
            onClick={() => void run(false)}
          >
            <Sparkles className="icon" aria-hidden />
            Optimizar lote
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy || !pending.length}
            onClick={() => void run(true)}
          >
            <Play className="icon" aria-hidden />
            Ejecutar lote
          </button>
          {committed && (
            <>
              <Link className="btn btn-sm" href="/decisions?outcome=HOLD&awaiting=1">
                Ver HOLDs
              </Link>
              <Link className="btn btn-sm" href="/historial">
                Historial
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="callout callout-info">
        <Wallet className="icon" aria-hidden />
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            alignItems: 'center',
          }}
        >
          <span>
            Presupuesto restante:{' '}
            <input
              id="budget"
              type="number"
              min={0}
              value={budget}
              disabled={busy || committed}
              onChange={(e) => {
                setBudget(Number(e.target.value));
                setPlan(null);
                setCommitted(false);
              }}
              className="input-inline"
              style={{ width: 96, margin: '0 4px' }}
              aria-label="Presupuesto restante USD"
            />
          </span>
          <span className="muted">
            ·{' '}
            {batch.length
              ? `${batch.length} en lote · ${pending.length} pendientes · demanda ${formatUsd(demandTotal)}`
              : 'carga el lote demo (N05–N10)'}
          </span>
        </div>
      </div>

      {plan && (
        <div className="grid-3" style={{ marginBottom: 14 }}>
          <div className="metric">
            <div className="k">Demanda del lote</div>
            <div className="v mono">
              {formatUsd(demandTotal || plan.spent + deferredTotal)}
            </div>
            <div className="h">
              {plan.selected.length + plan.deferred.length} facturas · cap{' '}
              {formatUsd(plan.remainingBudget)}
            </div>
          </div>
          <div className="metric">
            <div className="k">PAY · seleccionadas</div>
            <div className="v mono ok">{formatUsd(plan.spent)}</div>
            <div className="h">
              {plan.selected.length} facturas · sobrante{' '}
              {formatUsd(plan.leftover)}
            </div>
            <div className="bar">
              <i
                style={{
                  width: `${Math.min(
                    100,
                    Math.round(
                      (plan.spent / Math.max(plan.remainingBudget, 1)) * 100,
                    ),
                  )}%`,
                }}
              />
            </div>
          </div>
          <div className="metric">
            <div className="k">HOLD · diferidas</div>
            <div className="v mono">{formatUsd(deferredTotal)}</div>
            <div className="h">
              {
                plan.deferred.filter((d) => d.reason === 'budget_deferred')
                  .length
              }{' '}
              por presupuesto · no es FIFO
            </div>
          </div>
        </div>
      )}

      {batch.length > 0 && (
        <div
          className="panel"
          style={{ padding: 0, overflow: 'auto', marginBottom: 14 }}
        >
          <div
            className="panel-head"
            style={{ padding: '16px 16px 12px', marginBottom: 0 }}
          >
            <div>
              <h2>Candidatas del lote</h2>
              <p>
                {pending.length} pendientes
                {committed ? ' · ejecutado' : ''}
                {plan
                  ? ' · # = prioridad del scheduler (mayor score primero)'
                  : ' · listo para optimizar'}
              </p>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                {plan && <th>#</th>}
                <th>Factura</th>
                <th>Beneficiario</th>
                <th>Monto</th>
                <th>Etiqueta</th>
                <th>Vence</th>
                {plan && <th>Resultado</th>}
              </tr>
            </thead>
            <tbody>
              {pagedBatch.slice.map((inv) => {
                const p = priorityById.get(inv.id);
                const row = ranked.find((r) => r.id === inv.id);
                return (
                  <tr
                    key={inv.id}
                    style={{
                      opacity:
                        inv.status === 'decided' && !plan ? 0.45 : 1,
                    }}
                  >
                    {plan && (
                      <td className="mono">{p != null ? `#${p}` : '-'}</td>
                    )}
                    <td className="mono" title={inv.fixtureId ?? ''}>
                      {displayInvoiceId(inv.invoiceNumber)}
                    </td>
                    <td>{inv.payeeName}</td>
                    <td className="mono">{formatUsd(inv.amount)}</td>
                    <td>
                      <Tag
                        tags={inv.tags}
                        fixtureId={inv.fixtureId}
                        expectedOutcome={inv.expectedOutcome}
                      />
                    </td>
                    <td className="mono muted">
                      {formatDay(inv.dueDate)}
                    </td>
                    {plan && (
                      <td className="muted" style={{ fontSize: 12 }}>
                        {row?.outcome === 'PAY'
                          ? '→ PAY'
                          : row?.outcome === 'HOLD'
                            ? '→ HOLD'
                            : row?.outcome === 'SKIP'
                              ? '→ SKIP'
                              : '-'}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p
            className="muted"
            style={{ margin: '10px 16px 8px', fontSize: 11 }}
          >
            Demanda total:{' '}
            <strong className="mono">{formatUsd(demandTotal)}</strong>
            {plan && (
              <>
                {' '}
                · cubierto {formatUsd(plan.spent)} (
                {Math.round(
                  (plan.spent / Math.max(demandTotal || 1, 1)) * 100,
                )}
                %) · diferido {formatUsd(deferredTotal)}
              </>
            )}
          </p>
          <Pagination {...pagedBatch} onChange={setPage} label="candidatas" />
        </div>
      )}

      <div className="grid-2">
        <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div
            className="panel-head"
            style={{ padding: '16px 16px 12px', marginBottom: 0 }}
          >
            <div>
              <h2>Seleccionadas → PAY</h2>
              <p>Caben en presupuesto · por prioridad</p>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Factura</th>
                <th>Score</th>
                <th>Monto</th>
                <th>Por qué</th>
              </tr>
            </thead>
            <tbody>
              {(plan?.selected ?? []).map((s) => (
                <tr key={s.id}>
                  <td className="mono">#{priorityById.get(s.id)}</td>
                  <td className="mono">{invoiceLabel(s.id, s.label)}</td>
                  <td className="mono">{displayScore(s.score, maxScore)}</td>
                  <td className="mono">{formatUsd(s.amount)}</td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {whySelected(s)}
                  </td>
                </tr>
              ))}
              {!plan && (
                <tr>
                  <td colSpan={5} className="muted">
                    Pulsa <strong>Optimizar lote</strong> para ver la selección.
                  </td>
                </tr>
              )}
              {plan && !plan.selected.length && (
                <tr>
                  <td colSpan={5} className="muted">
                    Ninguna cabe en el presupuesto
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {plan && (
            <p
              className="muted"
              style={{ margin: '12px 16px 16px', fontSize: 11 }}
            >
              Total:{' '}
              <strong className="mono" style={{ color: 'var(--ez-cloud)' }}>
                {formatUsd(plan.spent)}
              </strong>{' '}
              / {formatUsd(plan.remainingBudget)} · sobrante{' '}
              {formatUsd(plan.leftover)}
            </p>
          )}
        </div>

        <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div
            className="panel-head"
            style={{ padding: '16px 16px 12px', marginBottom: 0 }}
          >
            <div>
              <h2>Diferidas → HOLD</h2>
              <p>budget_deferred · por qué no entraron</p>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Factura</th>
                <th>Monto</th>
                <th>Por qué</th>
              </tr>
            </thead>
            <tbody>
              {(plan?.deferred ?? []).map((d) => (
                <tr key={d.id}>
                  <td className="mono">#{priorityById.get(d.id)}</td>
                  <td className="mono">{invoiceLabel(d.id, d.label)}</td>
                  <td className="mono">{formatUsd(d.amount)}</td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {whyDeferred(d)}
                  </td>
                </tr>
              ))}
              {!plan && (
                <tr>
                  <td colSpan={4} className="muted">
                    Las diferidas aparecen tras optimizar.
                  </td>
                </tr>
              )}
              {plan && !plan.deferred.length && (
                <tr>
                  <td colSpan={4} className="muted">
                    Nada diferido
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {counterfactual && (
            <p
              className="muted"
              style={{ margin: '12px 16px 16px', fontSize: 11 }}
            >
              {counterfactual}
            </p>
          )}
        </div>
      </div>

      {work && <WorkProgress {...work} />}
      {!work && toast && <div className="toast">{toast}</div>}
    </Shell>
  );
}
