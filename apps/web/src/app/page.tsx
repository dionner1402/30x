'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Eraser,
  FileStack,
  Fingerprint,
  FlaskConical,
  Gauge,
  Play,
  Quote,
  Scale,
  ShieldBan,
  ShieldCheck,
  Unplug,
  Wallet,
  Waypoints,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Guide } from '../components/Guide';
import { Shell } from '../components/Shell';
import { StatusBadge } from '../components/StatusBadge';
import { Tag } from '../components/Tag';
import {
  api,
  type Decision,
  type EvalResult,
  type Invoice,
  type PaymentAccount,
  type Policy,
  type Tenant,
} from '../lib/api';
import { MOCK_RAIL_TOAST } from '../lib/copy';
import { displayInvoiceId } from '../lib/tags';
import { formatMoney as formatMoneyFull } from '../lib/invoice-display';

function formatCompact(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `$${n.toFixed(0)}`;
}

const MODE_LABEL: Record<Tenant['autonomyMode'], string> = {
  advise: 'Advise',
  assist: 'Assist',
  autopilot: 'Autopilot',
};

/** Una decisión por factura lógica (lista ya newest-first). */
function latestPerInvoice(
  decisions: Decision[],
  byInvoice: Map<string, Invoice>,
): Decision[] {
  const seen = new Set<string>();
  const out: Decision[] = [];
  for (const d of decisions) {
    const inv = byInvoice.get(d.invoiceId);
    const key = inv?.fixtureId
      ? `fx:${inv.fixtureId}`
      : inv?.invoiceNumber
        ? `num:${displayInvoiceId(inv.invoiceNumber)}`
        : `id:${d.invoiceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}

function isAwaiting(d: Decision) {
  return (
    d.outcome === 'HOLD' &&
    !d.resolvedByDecisionId &&
    d.awaitingHuman !== false
  );
}

/** Misma regla que Decisiones → «Requiere permiso». */
function isPolicyHold(d: Decision) {
  if (d.outcome !== 'HOLD') return false;
  const ids = new Set((d.rulesFired ?? []).map((r) => r.id));
  return (
    ids.has('over_soft_cap') ||
    ids.has('block_new_payee') ||
    ids.has('mismatch') ||
    ids.has('budget_deferred') ||
    ids.has('budget_insufficient')
  );
}

export default function HomePage() {
  const router = useRouter();
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [evalLatest, setEvalLatest] = useState<EvalResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadDashboard() {
    const [p, t, d, inv, acc, ev] = await Promise.all([
      api.policyActive(),
      api.tenant(),
      api.decisions(),
      api.invoices(),
      api.accounts(),
      api.evalLatest(),
    ]);
    setPolicy(p);
    setTenant(t);
    setDecisions(d);
    setInvoices(inv);
    setAccounts(acc);
    setEvalLatest(ev?.metrics ? ev : null);
  }

  useEffect(() => {
    let cancelled = false;
    void loadDashboard()
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function resetDemo() {
    if (
      !window.confirm(
        '¿Borrar facturas, decisiones y eval de este tenant?\nSe conserva política y cuentas bancarias. Autonomía → Autopilot.',
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await api.resetDemo();
      await loadDashboard();
      setToast(
        `${res.message} (−${res.deleted.decisions} dec · −${res.deleted.invoices} facturas)`,
      );
    } catch (e) {
      setToast(String(e));
    } finally {
      setBusy(false);
    }
  }

  const byInvoice = useMemo(() => {
    const m = new Map<string, Invoice>();
    for (const i of invoices) m.set(i.id, i);
    return m;
  }, [invoices]);

  const latest = useMemo(
    () => latestPerInvoice(decisions, byInvoice),
    [decisions, byInvoice],
  );

  const rows = useMemo(() => {
    return latest.slice(0, 5).map((d) => {
      const inv = byInvoice.get(d.invoiceId);
      return {
        decision: d,
        invoiceNumber: inv?.invoiceNumber ?? `…${d.invoiceId.slice(-6)}`,
        payee: inv?.payeeName ?? '-',
        amount: inv?.amount,
        currency: inv?.currency ?? 'USD',
        fixtureId: inv?.fixtureId,
        tags: inv?.tags,
        expectedOutcome: inv?.expectedOutcome,
      };
    });
  }, [latest, byInvoice]);

  const periodBudget = policy?.periodBudget ?? 25000;
  const spent = useMemo(() => {
    return latest
      .filter((d) => d.outcome === 'PAY')
      .reduce((sum, d) => sum + (byInvoice.get(d.invoiceId)?.amount ?? 0), 0);
  }, [latest, byInvoice]);
  const budgetPct = Math.min(
    100,
    Math.round((spent / Math.max(periodBudget, 1)) * 100),
  );
  const overBudget = spent > periodBudget;

  const pendingInbox = useMemo(
    () => invoices.filter((i) => i.status === 'ready').length,
    [invoices],
  );
  const needsPermission = useMemo(
    () => latest.filter((d) => isAwaiting(d) && isPolicyHold(d)).length,
    [latest],
  );
  const liquidity = useMemo(
    () =>
      accounts
        .filter((a) => a.active)
        .reduce((s, a) => s + (a.mockBalance ?? 0), 0),
    [accounts],
  );

  const autonomyPct =
    evalLatest?.metrics?.autonomyRate != null
      ? Math.round(evalLatest.metrics.autonomyRate * 100)
      : null;
  const falsePay =
    evalLatest?.metrics?.falsePay != null ? evalLatest.metrics.falsePay : null;

  return (
    <Shell
      title="Resumen"
      subtitle="El agente revisa cuentas · decide bajo reglas · pide permiso si duda"
      actions={
        <>
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy}
            onClick={() => void resetDemo()}
            title="Borra ledger de demo"
          >
            <Eraser className="icon" aria-hidden />
            Limpiar demo
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setToast(MOCK_RAIL_TOAST)}
          >
            <Unplug className="icon" aria-hidden />
            Rail mock
          </button>
          <Link className="btn btn-primary btn-sm" href="/eval">
            <Play className="icon" aria-hidden />
            Ejecutar eval
          </Link>
        </>
      }
    >
      <Guide
        items={[
          'Monitorear autonomía, false_pay y presupuesto del periodo',
          'Abrir un recibo reciente y verificar explicación + hash',
          'Flujo Demo Day: Política → Corrida → Decisiones → Eval',
        ]}
      >
        Mesa de autorización: salud del agente, presupuesto y últimas
        decisiones. No es un chat de IA: es un tablero financiero.
      </Guide>

      {error && <div className="callout callout-warn">{error}</div>}

      <div className="toolbar" style={{ marginBottom: 14 }}>
        <div className="chips" style={{ margin: 0 }}>
          <Link
            className="chip"
            href="/invoices"
            title="Facturas listas para Revisar bandeja"
          >
            <FileStack className="icon icon-xs" aria-hidden />
            Bandeja {loading ? '…' : pendingInbox}
          </Link>
          <Link
            className="chip"
            href="/decisions?awaiting=1"
            title="HOLD que piden permiso humano"
          >
            <ShieldCheck className="icon icon-xs" aria-hidden />
            Requiere permiso {loading ? '…' : needsPermission}
          </Link>
          <Link className="chip" href="/policy" title="Modo de autonomía activo">
            <Scale className="icon icon-xs" aria-hidden />
            Modo{' '}
            {tenant ? MODE_LABEL[tenant.autonomyMode] ?? tenant.autonomyMode : '…'}
          </Link>
          <Link className="chip" href="/accounts" title="Suma de saldos mock activos">
            <Wallet className="icon icon-xs" aria-hidden />
            Liquidez {loading ? '…' : formatCompact(liquidity)}
          </Link>
        </div>
      </div>

      <div className="grid-3" style={{ marginBottom: 14 }}>
        <div className="metric">
          <div className="k">
            <Gauge className="icon icon-xs" aria-hidden /> Autonomía
          </div>
          <div className="v">
            {loading ? '…' : autonomyPct != null ? `${autonomyPct}%` : '-'}
          </div>
          <div className="h">
            {autonomyPct != null
              ? 'Casos normales sin intervención humana'
              : 'Ejecuta Eval para medir la tasa de autonomía'}
          </div>
          {autonomyPct != null && (
            <div className="bar">
              <i style={{ width: `${autonomyPct}%` }} />
            </div>
          )}
        </div>
        <div className="metric">
          <div className="k">
            <ShieldBan className="icon icon-xs" aria-hidden /> Seguridad ·
            false_pay
          </div>
          <div className={`v ${falsePay === 0 ? 'ok' : ''}`}>
            {loading ? '…' : falsePay != null ? falsePay : '-'}
          </div>
          <div className="h">Puerta adversaria: descalifica si &gt; 0</div>
        </div>
        <div className="metric">
          <div className="k">
            <Wallet className="icon icon-xs" aria-hidden /> Presupuesto del
            periodo
          </div>
          <div
            className={`v mono ${overBudget ? '' : ''}`}
            style={overBudget ? { color: 'var(--ez-deny)' } : undefined}
          >
            {loading ? '…' : formatCompact(spent)}
          </div>
          <div className="h">
            de {formatCompact(periodBudget)} USD · policy{' '}
            {policy?.version ?? '…'}
            {overBudget ? ' · sobre techo' : ''}
          </div>
          <div className="bar">
            <i
              style={{
                width: `${budgetPct}%`,
                background: overBudget ? 'var(--ez-deny)' : undefined,
              }}
            />
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div
            className="panel-head"
            style={{ padding: '16px 16px 12px', marginBottom: 0 }}
          >
            <div>
              <h2>Últimas decisiones</h2>
              <p>Una por factura · libro de solo escritura</p>
            </div>
            <Link className="btn btn-sm" href="/decisions">
              Ver todas
              <ArrowRight className="icon" aria-hidden />
            </Link>
          </div>
          <table>
            <thead>
              <tr>
                <th>Factura</th>
                <th>Beneficiario</th>
                <th>Monto</th>
                <th>Etiqueta</th>
                <th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.decision.id}
                  className="clickable"
                  onClick={() =>
                    router.push(
                      `/decisions?id=${encodeURIComponent(r.decision.id)}`,
                    )
                  }
                >
                  <td className="mono">{displayInvoiceId(r.invoiceNumber)}</td>
                  <td>{r.payee}</td>
                  <td className="mono">
                    {r.amount != null
                      ? formatMoneyFull(r.amount, r.currency)
                      : '-'}
                  </td>
                  <td>
                    <Tag
                      tags={r.tags}
                      fixtureId={r.fixtureId}
                      expectedOutcome={r.expectedOutcome}
                    />
                  </td>
                  <td>
                    <StatusBadge outcome={r.decision.outcome} />
                  </td>
                </tr>
              ))}
              {loading && (
                <tr>
                  <td colSpan={5} className="muted" style={{ padding: 20 }}>
                    Cargando mesa…
                  </td>
                </tr>
              )}
              {!loading && !rows.length && (
                <tr>
                  <td colSpan={5} className="muted" style={{ padding: 20 }}>
                    Sin decisiones. Carga el set Demo Day en Facturas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Posición de producto</h2>
              <p>No competimos en OCR</p>
            </div>
          </div>
          <p className="muted" style={{ marginBottom: 12, fontSize: 12.5 }}>
            EzAllow es autorización (clearance): el LLM extrae y narra; el{' '}
            <strong style={{ color: 'var(--ez-cloud)' }}>
              motor de reglas autoriza
            </strong>
            . Si el presupuesto no alcanza, el planificador elige el conjunto
            admisible.
          </p>
          <div className="chips" style={{ marginBottom: 12 }}>
            <Link className="chip" href="/policy">
              <Scale className="icon icon-xs" aria-hidden /> Política primero
            </Link>
            <Link className="chip" href="/historial">
              <Fingerprint className="icon icon-xs" aria-hidden /> Hash de recibo
            </Link>
            <Link className="chip" href="/eval">
              <FlaskConical className="icon icon-xs" aria-hidden /> Adversarial
            </Link>
            <Link className="chip" href="/cash">
              <Waypoints className="icon icon-xs" aria-hidden /> Presupuesto
            </Link>
          </div>
          <div className="callout callout-info" style={{ margin: 0 }}>
            <Quote className="icon" aria-hidden />
            <div>
              <strong>Payments. Authorized.</strong> Automatizar sin perder el
              control humano.
            </div>
          </div>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </Shell>
  );
}
