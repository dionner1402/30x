'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  CheckSquare,
  Eraser,
  ShieldCheck,
  Square,
  UserCheck,
  UserX,
} from 'lucide-react';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { ConfirmModal } from '../../components/ConfirmModal';
import { Guide } from '../../components/Guide';
import {
  PAGE_SIZE,
  Pagination,
  paginate,
} from '../../components/Pagination';
import { Shell } from '../../components/Shell';
import { StatusBadge } from '../../components/StatusBadge';
import { Tag } from '../../components/Tag';
import { WorkProgress } from '../../components/WorkProgress';
import { api, type Decision, type Invoice, type PaymentAccount } from '../../lib/api';
import {
  formatAccountLine,
  pickPaymentAccount,
  usageFromInvoice,
} from '../../lib/account-routing';
import {
  DEMO_ACTORS,
  actorById,
  formatActor,
  loadActorId,
  saveActorId,
} from '../../lib/actor';
import {
  categoryLabel,
  formatDateTime,
  formatDay,
  formatMoney,
} from '../../lib/invoice-display';
import {
  autonomyLabel,
  displayCounterfactual,
  displayExplanation,
  displayMockRail,
  humanizeRule,
  motiveFromRules,
  policyVersionLabel,
} from '../../lib/receipt-display';
import { displayInvoiceId } from '../../lib/tags';

function ruleIds(d: Decision) {
  return new Set((d.rulesFired ?? []).map((r) => r.id));
}

/** HOLD que pide permiso de verdad (soft / nuevo / desfase / budget). */
function isPolicyHold(d: Decision) {
  if (d.outcome !== 'HOLD') return false;
  const ids = ruleIds(d);
  return (
    ids.has('over_soft_cap') ||
    ids.has('block_new_payee') ||
    ids.has('mismatch') ||
    ids.has('budget_deferred') ||
    ids.has('budget_insufficient')
  );
}

/** HOLD solo porque el modo era Advise (ruido histórico). */
function isAdviseNoiseHold(d: Decision) {
  if (d.outcome !== 'HOLD') return false;
  const ids = ruleIds(d);
  return (
    (ids.has('advise_escalate') || ids.has('advisor_escalate')) &&
    !isPolicyHold(d)
  );
}

function isAwaiting(d: Decision) {
  return (
    d.outcome === 'HOLD' &&
    !d.resolvedByDecisionId &&
    d.awaitingHuman !== false
  );
}

/**
 * Clave lógica de factura: al recargar Demo Day hay varios invoiceId
 * para el mismo fixture (T-SOFT, T-NEW…). Agrupamos por fixture / nº.
 */
function invoiceGroupKey(
  d: Decision,
  byInvoice: Map<string, Invoice>,
): string {
  const inv = byInvoice.get(d.invoiceId);
  if (inv?.fixtureId) return `fx:${inv.fixtureId}`;
  if (inv?.invoiceNumber) {
    return `num:${displayInvoiceId(inv.invoiceNumber)}`;
  }
  return `id:${d.invoiceId}`;
}

/** Una fila por factura lógica: la decisión más reciente (lista ya ordenada). */
function latestPerInvoice(
  rows: Decision[],
  byInvoice: Map<string, Invoice>,
) {
  const seen = new Set<string>();
  const out: Decision[] = [];
  for (const d of rows) {
    const key = invoiceGroupKey(d, byInvoice);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}

function DecisionsInner() {
  const params = useSearchParams();
  const focusId = params.get('id');
  const outcomeParam = params.get('outcome');
  const awaitingParam = params.get('awaiting') === '1';
  const [list, setList] = useState<Decision[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [selected, setSelected] = useState<Decision | null>(null);
  const [filter, setFilter] = useState<string>(
    outcomeParam === 'PAY' ||
      outcomeParam === 'HOLD' ||
      outcomeParam === 'DENY'
      ? outcomeParam
      : 'all',
  );
  /** policy = soft/new; awaiting = cualquier HOLD abierto; all in filter */
  const [viewMode, setViewMode] = useState<'all' | 'awaiting' | 'policy'>(
    awaitingParam ? 'policy' : 'all',
  );
  const [latestOnly, setLatestOnly] = useState(true);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [autonomyMode, setAutonomyMode] = useState<string | null>(null);
  const [actorId, setActorId] = useState(DEMO_ACTORS[0].id);
  /** HOLD abiertos marcados al revisar → Autorizar / Rechazar lote */
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const [batchWork, setBatchWork] = useState<{
    title: string;
    detail?: string;
    current: number;
    total: number;
    alive?: boolean;
  } | null>(null);
  const [promoteAsk, setPromoteAsk] = useState<{
    payeeName: string;
    resolve: (ok: boolean) => void;
  } | null>(null);
  const [promoteBusy, setPromoteBusy] = useState(false);

  useEffect(() => {
    setActorId(loadActorId());
  }, []);

  const reload = useCallback(
    async (preferId?: string | null) => {
      // Siempre el ledger completo: contadores (p. ej. requiere permiso) no
      // dependen del filtro PAY/HOLD/DENY activo.
      const [rows, inv, tenant, acc] = await Promise.all([
        api.decisions(),
        api.invoices(),
        api.tenant().catch(() => null),
        api.accounts().catch(() => [] as PaymentAccount[]),
      ]);
      setList(rows);
      setInvoices(inv);
      setAccounts(Array.isArray(acc) ? acc : []);
      if (tenant) setAutonomyMode(tenant.autonomyMode);
      const id = preferId ?? focusId;
      if (id) {
        const focused =
          rows.find((d) => d.id === id) ?? (await api.decision(id));
        setSelected(focused);
      } else if (rows[0]) {
        setSelected(rows[0]);
      } else {
        setSelected(null);
      }
    },
    [focusId],
  );

  useEffect(() => {
    void reload().catch((e) => setError(String(e)));
  }, [reload]);

  useEffect(() => {
    if (
      outcomeParam === 'PAY' ||
      outcomeParam === 'HOLD' ||
      outcomeParam === 'DENY'
    ) {
      setFilter(outcomeParam);
      setPage(1);
    }
    if (awaitingParam) {
      setViewMode('policy');
      setLatestOnly(true);
    }
  }, [outcomeParam, awaitingParam]);

  const byInvoice = useMemo(() => {
    const m = new Map<string, Invoice>();
    for (const i of invoices) m.set(i.id, i);
    return m;
  }, [invoices]);

  const visible = useMemo(() => {
    // 1) Última por factura lógica (fixture) - PAY tras permiso gana al HOLD
    let rows = latestOnly ? latestPerInvoice(list, byInvoice) : list;
    // 2) Filtros de vista
    if (viewMode === 'policy') {
      rows = rows.filter((d) => isAwaiting(d) && isPolicyHold(d));
    } else if (viewMode === 'awaiting') {
      rows = rows.filter(isAwaiting);
    } else if (filter === 'HOLD') {
      // HOLD = pendientes de permiso, no el recibo histórico ya resuelto
      rows = rows.filter(isAwaiting);
    } else if (filter !== 'all') {
      rows = rows.filter((d) => d.outcome === filter);
    }
    return rows;
  }, [list, filter, viewMode, latestOnly, byInvoice]);

  const paged = useMemo(() => paginate(visible, page), [visible, page]);

  useEffect(() => {
    // Mantener selección visible en la página actual
    if (!selected) return;
    const idx = visible.findIndex((d) => d.id === selected.id);
    if (idx >= 0) setPage(Math.floor(idx / PAGE_SIZE) + 1);
  }, [visible, selected]);

  /** Contadores alineados con Por factura / Completo (misma regla que la tabla). */
  const countForView = useCallback(
    (rows: Decision[]) =>
      latestOnly ? latestPerInvoice(rows, byInvoice).length : rows.length,
    [latestOnly, byInvoice],
  );

  const awaitingN = useMemo(
    () => countForView(list.filter(isAwaiting)),
    [list, countForView],
  );
  const policyHoldN = useMemo(
    () =>
      countForView(
        list.filter((d) => isAwaiting(d) && isPolicyHold(d)),
      ),
    [list, countForView],
  );
  const advisorNoiseN = useMemo(
    () =>
      countForView(
        list.filter((d) => isAwaiting(d) && isAdviseNoiseHold(d)),
      ),
    [list, countForView],
  );

  const selectedInv = selected
    ? byInvoice.get(selected.invoiceId)
    : undefined;

  /** Cuenta real (PAY) o prevista (HOLD): uso → si sin saldo, otra que cubra. */
  const receiptAccount = useMemo(() => {
    if (!selected || selected.outcome === 'DENY') return null;
    if (selected.paymentAccount) {
      const r = selected.paymentAccount.routing;
      return {
        bank: selected.paymentAccount.bank,
        name: selected.paymentAccount.name,
        usage: selected.paymentAccount.usage,
        projected: false,
        balanceFallback: Boolean(r?.balanceFallback),
        fromLabel: r?.fromLabel,
        covered: r?.covered !== false,
      };
    }
    if (selected.outcome !== 'HOLD' && selected.outcome !== 'PAY') {
      return null;
    }
    const picked = pickPaymentAccount(
      accounts,
      usageFromInvoice(selectedInv),
      selectedInv?.amount,
    );
    if (!picked) return null;
    return {
      bank: picked.account.bank,
      name: picked.account.name,
      usage: picked.account.usage,
      projected: selected.outcome === 'HOLD',
      balanceFallback: picked.balanceFallback,
      fromLabel: picked.fromLabel,
      covered: picked.covered,
    };
  }, [selected, selectedInv, accounts]);

  const mockRailNote = selected ? displayMockRail(selected) : null;

  const canResolve =
    selected?.outcome === 'HOLD' &&
    selected.awaitingHuman !== false &&
    !selected.resolvedByDecisionId;

  const canOverrideDup =
    Boolean(selected?.canOverrideDuplicate) &&
    !selected?.resolvedByDecisionId;

  const batchSet = useMemo(() => new Set(batchIds), [batchIds]);

  const batchableVisible = useMemo(
    () => visible.filter(isAwaiting),
    [visible],
  );

  // Quitar del lote los que ya no están abiertos
  useEffect(() => {
    const open = new Set(list.filter(isAwaiting).map((d) => d.id));
    setBatchIds((prev) => {
      const next = prev.filter((id) => open.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [list]);

  function toggleBatch(id: string, force?: boolean) {
    setBatchIds((prev) => {
      const has = prev.includes(id);
      const on = force ?? !has;
      if (on && !has) return [...prev, id];
      if (!on && has) return prev.filter((x) => x !== id);
      return prev;
    });
  }

  /** Abrir recibo; si es HOLD abierto, entra al lote de permiso. */
  function openDecision(d: Decision) {
    setSelected(d);
    if (isAwaiting(d)) toggleBatch(d.id, true);
  }

  function selectAllVisible() {
    setBatchIds((prev) => {
      const set = new Set(prev);
      for (const d of batchableVisible) set.add(d.id);
      return [...set];
    });
  }

  function askPromote(payeeName: string): Promise<boolean> {
    return new Promise((resolve) => {
      setPromoteAsk({ payeeName, resolve });
    });
  }

  async function maybePromote(
    suggestion?: { kind: string; payeeName: string } | null,
  ) {
    if (suggestion?.kind !== 'add_allowlist' || !suggestion.payeeName) return;
    const ok = await askPromote(suggestion.payeeName);
    if (!ok) return;
    try {
      const res = await api.promotePayee(suggestion.payeeName);
      setToast(res.message);
    } catch (e) {
      setToast(String(e));
    } finally {
      setPromoteBusy(false);
      setPromoteAsk(null);
    }
  }

  function closePromote(ok: boolean) {
    if (promoteBusy || !promoteAsk) return;
    if (!ok) {
      promoteAsk.resolve(false);
      setPromoteAsk(null);
      return;
    }
    setPromoteBusy(true);
    promoteAsk.resolve(true);
  }

  async function resolve(action: 'approve' | 'reject') {
    if (!selected) return;
    const actor = actorById(actorId);
    setBusy(true);
    setToast(null);
    try {
      const next = await api.resolveDecision(selected.id, action, actor);
      setBatchIds((prev) => prev.filter((id) => id !== selected.id));
      setToast(
        selected.canOverrideDuplicate && action === 'approve'
          ? `${formatActor(actor)} excepcionó duplicado → PAY`
          : action === 'approve'
            ? `${formatActor(actor)} aprobó → PAY`
            : `${formatActor(actor)} rechazó → DENY`,
      );
      await reload(next.id);
      setFilter(action === 'approve' ? 'PAY' : 'DENY');
      setViewMode('all');
      if (action === 'approve') {
        await maybePromote(next.policySuggestion);
      }
    } catch (e) {
      setToast(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function resolveBatch(action: 'approve' | 'reject') {
    const ids = batchIds.filter((id) =>
      list.some((d) => d.id === id && isAwaiting(d)),
    );
    if (!ids.length) {
      setToast('No hay HOLD en el lote. Revisa filas para marcarlas.');
      return;
    }
    const actor = actorById(actorId);
    const verb = action === 'approve' ? 'Autorizando' : 'Rechazando';
    setBusy(true);
    setToast(null);
    setBatchWork({
      title: `${verb} ${ids.length}…`,
      detail: formatActor(actor),
      current: 0,
      total: ids.length,
      alive: true,
    });
    try {
      const res = await api.resolveBatch({
        decisionIds: ids,
        action,
        resolvedBy: actor,
      });
      setBatchWork({
        title: 'Listo',
        current: ids.length,
        total: ids.length,
        alive: false,
      });
      setBatchIds([]);
      const lastId = res.decisions[res.decisions.length - 1]?.id ?? null;
      await reload(lastId);
      setViewMode('all');
      setFilter(action === 'approve' ? 'PAY' : 'DENY');
      setBatchWork(null);
      setToast(
        res.failed === 0
          ? `${formatActor(actor)} · ${res.message}`
          : res.message,
      );
      for (const payee of res.promotePayees ?? []) {
        await maybePromote({ kind: 'add_allowlist', payeeName: payee });
      }
    } catch (e) {
      setBatchWork(null);
      setToast(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function switchToAutopilot() {
    setBusy(true);
    try {
      const t = await api.patchTenant({ autonomyMode: 'autopilot' });
      setAutonomyMode(t.autonomyMode);
      setToast('Autonomía → Autopilot. Los HOLD nuevos ya no serán por Advise.');
    } catch (e) {
      setToast(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function resetDemo() {
    if (
      !window.confirm(
        '¿Borrar facturas y decisiones de demo?\nQuedan política y cuentas. Autonomía → Autopilot.',
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await api.resetDemo();
      setToast(res.message);
      setFilter('all');
      setViewMode('all');
      await reload();
    } catch (e) {
      setToast(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell
      title="Decisiones"
      subtitle="El agente decide · si duda, pide permiso a una persona"
      actions={
        <button
          type="button"
          className="btn btn-sm"
          disabled={busy}
          onClick={() => void resetDemo()}
        >
          <Eraser className="icon" aria-hidden />
          Limpiar demo
        </button>
      }
    >
      <Guide
        icon={ShieldCheck}
        items={[
          '«Requiere permiso» = soft cap / beneficiario nuevo → Aprobar / Denegar',
          'Tras aprobar un HOLD: opcional promover proveedor a allowlist',
          'DENY por duplicado: fail-closed; se puede excepcionar si es FP',
          'Autorizar lote o uno solo desde el recibo',
        ]}
      >
        Cola de autorización. Soft cap y payee nuevo = permiso real. El humano
        no aprueba facturas para siempre: escribe la regla.
      </Guide>

      {error && <div className="callout callout-warn">{error}</div>}

      {autonomyMode === 'advise' && (
        <div className="callout callout-warn">
          <ShieldCheck className="icon" aria-hidden />
          <div>
            <strong>Modo actual: Advise</strong>: todo escalará a HOLD.{' '}
            <button
              type="button"
              className="btn btn-sm"
              disabled={busy}
              onClick={() => void switchToAutopilot()}
              style={{ marginLeft: 8 }}
            >
              Pasar a Autopilot
            </button>
          </div>
        </div>
      )}

      {autonomyMode === 'autopilot' && advisorNoiseN > 0 && (
        <div className="callout callout-info">
          <ShieldCheck className="icon" aria-hidden />
          <div>
            <strong>Ya estás en Autopilot.</strong> Hay {advisorNoiseN} HOLD
            históricos solo por Advise (corridas viejas). No son el modo
            actual. Filtra <strong>Requiere permiso</strong> ({policyHoldN}):
            soft cap (Assist) / beneficiario nuevo.
          </div>
        </div>
      )}

      <div className="toolbar">
        <div>
          <h2>Decisiones</h2>
          <p>
            {visible.length} visibles · {list.length} en ledger
            {awaitingN > 0 ? ` · ${awaitingN} abiertos` : ''}
            {autonomyMode ? ` · ${autonomyMode}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['all', 'PAY', 'HOLD', 'DENY'].map((f) => (
            <button
              key={f}
              type="button"
              className={`btn btn-sm ${
                filter === f && viewMode === 'all' ? 'btn-primary' : ''
              }`}
              onClick={() => {
                setFilter(f);
                setViewMode('all');
                setPage(1);
              }}
            >
              {f === 'all' ? 'Todas' : f}
            </button>
          ))}
          <button
            type="button"
            className={`btn btn-sm ${viewMode === 'policy' ? 'btn-primary' : ''}`}
            onClick={() => {
              if (viewMode === 'policy') {
                setViewMode('all');
                setFilter('all');
              } else {
                setFilter('HOLD');
                setViewMode('policy');
              }
              setPage(1);
            }}
          >
            Requiere permiso ({policyHoldN})
          </button>
          <div
            className="seg"
            role="group"
            aria-label="Cómo agrupar el listado"
          >
            <button
              type="button"
              className={latestOnly ? 'active' : ''}
              title="Solo la decisión más reciente de cada factura"
              onClick={() => {
                setLatestOnly(true);
                setPage(1);
              }}
            >
              Por factura
            </button>
            <button
              type="button"
              className={!latestOnly ? 'active' : ''}
              title="Todas las filas del ledger, sin agrupar"
              onClick={() => {
                setLatestOnly(false);
                setPage(1);
              }}
            >
              Completo
            </button>
          </div>
          {batchableVisible.length > 0 && (
            <button
              type="button"
              className="btn btn-sm"
              disabled={busy}
              title="Marca todos los HOLD abiertos de esta vista"
              onClick={() => selectAllVisible()}
            >
              Marcar visibles ({batchableVisible.length})
            </button>
          )}
        </div>
      </div>

      <div className="grid-2">
        <div
          className="panel"
          style={{ padding: 0, overflow: 'auto', maxHeight: 540 }}
        >
          <table>
            <thead>
              <tr>
                <th style={{ width: 36 }} title="Lote de permiso">
                  <span className="sr-only">Lote</span>
                </th>
                <th>Factura</th>
                <th>Resultado</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {paged.slice.map((d) => {
                const inv = byInvoice.get(d.invoiceId);
                const waiting = isAwaiting(d);
                const noise = isAdviseNoiseHold(d);
                const inBatch = batchSet.has(d.id);
                return (
                  <tr
                    key={d.id}
                    className="clickable"
                    style={{
                      background: inBatch
                        ? 'rgba(255,214,0,0.08)'
                        : selected?.id === d.id
                          ? 'rgba(255,214,0,0.05)'
                          : undefined,
                      opacity: noise ? 0.55 : 1,
                    }}
                    onClick={() => openDecision(d)}
                  >
                    <td
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!waiting) return;
                        toggleBatch(d.id);
                        setSelected(d);
                      }}
                    >
                      {waiting ? (
                        inBatch ? (
                          <CheckSquare
                            className="icon"
                            aria-label="En el lote"
                            style={{ color: 'var(--ez-yellow)' }}
                          />
                        ) : (
                          <Square
                            className="icon"
                            aria-label="Añadir al lote"
                            style={{ color: 'var(--ez-neutral)' }}
                          />
                        )
                      ) : (
                        <span className="muted">·</span>
                      )}
                    </td>
                    <td className="mono">
                      {displayInvoiceId(inv?.invoiceNumber) ||
                        `…${d.invoiceId.slice(-6)}`}
                    </td>
                    <td>
                      <StatusBadge outcome={d.outcome} />
                      {waiting && (
                        <span
                          className="muted"
                          style={{ display: 'block', fontSize: 10 }}
                        >
                          {noise ? 'histórico Advise' : 'espera permiso'}
                          {inBatch ? ' · en lote' : ''}
                        </span>
                      )}
                    </td>
                    <td className="muted">
                      {motiveFromRules(
                        d.outcome,
                        d.rulesFired,
                        d.resolvedBy,
                      )}
                    </td>
                  </tr>
                );
              })}
              {!paged.slice.length && (
                <tr>
                  <td colSpan={4} className="muted" style={{ padding: 20 }}>
                    Sin filas en este filtro.{' '}
                    <Link href="/invoices">Facturas</Link> → cargar set →
                    Revisar bandeja (modo Autopilot).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <Pagination {...paged} onChange={setPage} label="decisiones" />
        </div>

        <div className="receipt">
          {!selected && (
            <div className="receipt-body muted">Selecciona una decisión</div>
          )}
          {selected && (
            <>
              <div className="receipt-top">
                <div>
                  <div
                    className="muted"
                    style={{
                      fontSize: 10,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      fontWeight: 600,
                      marginBottom: 4,
                    }}
                  >
                    Recibo de decisión
                  </div>
                  <strong>
                    {displayInvoiceId(selectedInv?.invoiceNumber) ||
                      `…${selected.invoiceId.slice(-6)}`}
                  </strong>
                  <span className="muted"> · </span>
                  <span className="muted">
                    {selectedInv?.payeeName ?? '-'}
                  </span>
                  <div
                    style={{
                      marginTop: 8,
                      display: 'flex',
                      gap: 8,
                      flexWrap: 'wrap',
                    }}
                  >
                    <Tag
                      tags={selectedInv?.tags}
                      fixtureId={selectedInv?.fixtureId}
                      expectedOutcome={selectedInv?.expectedOutcome}
                    />
                    <span className="muted" style={{ fontSize: 12 }}>
                      Modo {autonomyLabel(selected.autonomyMode)} · política{' '}
                      {policyVersionLabel(selected.policyVersion)}
                    </span>
                  </div>
                </div>
                <StatusBadge outcome={selected.outcome} />
              </div>
              <div className="receipt-body">
                {isAdviseNoiseHold(selected) && (
                  <div
                    className="callout callout-info"
                    style={{ marginBottom: 12 }}
                  >
                    Este recibo es de una corrida en <strong>Advise</strong>.
                    No refleja el modo actual (
                    {autonomyLabel(autonomyMode) || '…'}).
                  </div>
                )}
                <div className="rb">
                  <h4>Factura</h4>
                  <dl className="receipt-facts">
                    <div>
                      <dt>Monto</dt>
                      <dd className="mono">
                        {selectedInv
                          ? formatMoney(
                              selectedInv.amount,
                              selectedInv.currency || 'USD',
                            )
                          : '-'}
                      </dd>
                    </div>
                    <div>
                      <dt>Categoría</dt>
                      <dd>{categoryLabel(selectedInv?.paymentCategory)}</dd>
                    </div>
                    {receiptAccount && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <dt>
                          {receiptAccount.projected
                            ? 'Se pagaría desde'
                            : 'Pagado desde'}
                        </dt>
                        <dd>
                          {formatAccountLine(receiptAccount)}
                          <span
                            className="muted"
                            style={{ display: 'block', fontSize: 11 }}
                          >
                            Cuenta de {categoryLabel(receiptAccount.usage)}
                            {receiptAccount.balanceFallback &&
                            receiptAccount.fromLabel
                              ? ` · la preferida (${receiptAccount.fromLabel}) no tenía saldo`
                              : ''}
                            {!receiptAccount.covered
                              ? ' · aviso: ninguna cuenta cubría el monto'
                              : ''}
                            {receiptAccount.projected &&
                            !receiptAccount.balanceFallback
                              ? ' · al aprobar se debita esta cuenta'
                              : ''}
                            {receiptAccount.projected &&
                            receiptAccount.balanceFallback
                              ? ' · al aprobar se debita la cuenta con saldo'
                              : ''}
                          </span>
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt>Emitida</dt>
                      <dd className="mono">
                        {formatDay(selectedInv?.issueDate)}
                      </dd>
                    </div>
                    <div>
                      <dt>Recibida</dt>
                      <dd className="mono">
                        {formatDay(selectedInv?.createdAt)}
                      </dd>
                    </div>
                    <div>
                      <dt>Vence</dt>
                      <dd className="mono">
                        {formatDay(selectedInv?.dueDate)}
                      </dd>
                    </div>
                    {selected.resolvedBy && (
                      <div>
                        <dt>
                          {selected.outcome === 'DENY'
                            ? 'Rechazado por'
                            : 'Aprobado por'}
                        </dt>
                        <dd>{formatActor(selected.resolvedBy)}</dd>
                      </div>
                    )}
                    <div>
                      <dt>
                        {selected.outcome === 'PAY'
                          ? 'Pagado'
                          : selected.outcome === 'DENY'
                            ? 'Denegado'
                            : 'Decidido'}
                      </dt>
                      <dd className="mono" title={selected.createdAt}>
                        {formatDateTime(selected.createdAt)}
                      </dd>
                    </div>
                  </dl>
                </div>
                <div className="rb">
                  <h4>Explicación</h4>
                  <p style={{ fontSize: 13.5, lineHeight: 1.55 }}>
                    {displayExplanation(selected)}
                  </p>
                </div>
                <div className="rb">
                  <h4>Qué se comprobó</h4>
                  <ul className="rules">
                    {selected.rulesFired.map((r) => {
                      const h = humanizeRule(r);
                      return (
                        <li key={r.id}>
                          <strong>{h.title}</strong>
                          <div className="muted" style={{ marginTop: 3 }}>
                            {h.detail}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <div className="rb">
                  <h4>Si algo hubiera fallado</h4>
                  <p style={{ fontSize: 13, color: '#c4c9d1' }}>
                    {displayCounterfactual(selected)}
                  </p>
                </div>
                <div className="rb">
                  <h4>Sello de verificación</h4>
                  <p style={{ fontSize: 12.5, lineHeight: 1.5, marginBottom: 6 }}>
                    Recibo inmutable · modo{' '}
                    {autonomyLabel(selected.autonomyMode)} · política{' '}
                    {policyVersionLabel(selected.policyVersion)}
                  </p>
                  <p className="hash" title="Huella del recibo (auditoría)">
                    {selected.receiptHash}
                  </p>
                </div>
                {mockRailNote && (
                  <div
                    className="callout callout-info"
                    style={{ marginBottom: 12 }}
                  >
                    {mockRailNote}
                  </div>
                )}
                {canResolve && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    <p className="muted" style={{ fontSize: 12 }}>
                      {batchSet.has(selected.id)
                        ? 'En el lote de permiso. Sigue revisando o autoriza el lote abajo.'
                        : 'No está en el lote.'}{' '}
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={busy}
                        onClick={() => toggleBatch(selected.id)}
                      >
                        {batchSet.has(selected.id)
                          ? 'Quitar del lote'
                          : 'Añadir al lote'}
                      </button>
                    </p>
                    <label
                      className="muted"
                      style={{ fontSize: 12, display: 'grid', gap: 4 }}
                    >
                      Autorizado que decide
                      <select
                        value={actorId}
                        disabled={busy}
                        onChange={(e) => {
                          setActorId(e.target.value);
                          saveActorId(e.target.value);
                        }}
                        style={{
                          background: '#0d1219',
                          border: '1px solid var(--line-strong)',
                          borderRadius: 'var(--r)',
                          padding: '7px 8px',
                          color: 'var(--ez-cloud)',
                          fontSize: 12,
                          maxWidth: 280,
                        }}
                      >
                        {DEMO_ACTORS.map((a) => (
                          <option key={a.id} value={a.id}>
                            {formatActor(a)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={busy}
                        onClick={() => void resolve('approve')}
                      >
                        <UserCheck className="icon" aria-hidden />
                        Aprobar solo esta
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={busy}
                        onClick={() => void resolve('reject')}
                      >
                        <UserX className="icon" aria-hidden />
                        Rechazar solo esta
                      </button>
                    </div>
                  </div>
                )}
                {canOverrideDup && (
                  <div
                    className="callout callout-warn"
                    style={{
                      marginTop: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    <p style={{ fontSize: 13, margin: 0 }}>
                      Fail-closed: el motor denegó por firma idéntica. Si
                      revisaste y es un <strong>falso positivo</strong>, puedes
                      excepcionar (queda en el ledger quién lo autorizó).
                    </p>
                    <label
                      className="muted"
                      style={{ fontSize: 12, display: 'grid', gap: 4 }}
                    >
                      Quién excepciona
                      <select
                        value={actorId}
                        disabled={busy}
                        onChange={(e) => {
                          setActorId(e.target.value);
                          saveActorId(e.target.value);
                        }}
                        style={{
                          background: '#0d1219',
                          border: '1px solid var(--line-strong)',
                          borderRadius: 'var(--r)',
                          padding: '7px 8px',
                          color: 'var(--ez-cloud)',
                          fontSize: 12,
                          maxWidth: 280,
                        }}
                      >
                        {DEMO_ACTORS.map((a) => (
                          <option key={a.id} value={a.id}>
                            {formatActor(a)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={busy}
                      onClick={() => void resolve('approve')}
                    >
                      <UserCheck className="icon" aria-hidden />
                      Excepcionar → PAY
                    </button>
                  </div>
                )}
                {(selected.outcome === 'HOLD' || selected.outcome === 'DENY') &&
                  selected.resolvedByDecisionId && (
                    <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                      Ya resuelto · ver decisión{' '}
                      <span className="mono">
                        …{selected.resolvedByDecisionId.slice(-6)}
                      </span>
                    </p>
                  )}
              </div>
            </>
          )}
        </div>
      </div>

      {batchIds.length > 0 && !batchWork && (
        <div className="batch-bar" role="region" aria-label="Lote de permiso">
          <strong>
            Lote · {batchIds.length} HOLD
          </strong>
          <label className="muted" style={{ fontSize: 11, display: 'flex', gap: 6, alignItems: 'center' }}>
            Como
            <select
              value={actorId}
              disabled={busy}
              onChange={(e) => {
                setActorId(e.target.value);
                saveActorId(e.target.value);
              }}
              style={{
                background: '#0d1219',
                border: '1px solid var(--line-strong)',
                borderRadius: 'var(--r)',
                padding: '5px 8px',
                color: 'var(--ez-cloud)',
                fontSize: 12,
              }}
            >
              {DEMO_ACTORS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={() => void resolveBatch('approve')}
          >
            <UserCheck className="icon" aria-hidden />
            Autorizar lote
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy}
            onClick={() => void resolveBatch('reject')}
          >
            <UserX className="icon" aria-hidden />
            Rechazar lote
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy}
            onClick={() => setBatchIds([])}
          >
            Vaciar
          </button>
        </div>
      )}
      {batchWork && <WorkProgress {...batchWork} />}
      {!batchWork && toast && <div className="toast">{toast}</div>}

      <ConfirmModal
        open={Boolean(promoteAsk)}
        title="¿Promover a regla?"
        highlight={promoteAsk?.payeeName}
        body="Se añade a la lista de beneficiarios autorizados. Las próximas facturas similares podrán ir a PAY sin pedir permiso otra vez."
        footnote="D3 · Exception→Policy: el humano no aprueba facturas para siempre; escribe la regla."
        confirmLabel="Promover a allowlist"
        cancelLabel="Ahora no"
        busy={promoteBusy}
        onConfirm={() => closePromote(true)}
        onCancel={() => closePromote(false)}
      />
    </Shell>
  );
}

export default function DecisionsPage() {
  return (
    <Suspense fallback={<div className="content">Cargando…</div>}>
      <DecisionsInner />
    </Suspense>
  );
}
