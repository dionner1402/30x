'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bot,
  FileStack,
  Gavel,
  Loader2,
  Play,
  Unplug,
  Upload,
  Waypoints,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Guide } from '../../components/Guide';
import { Pagination, paginate } from '../../components/Pagination';
import { Shell } from '../../components/Shell';
import { Tag } from '../../components/Tag';
import { WorkProgress } from '../../components/WorkProgress';
import { api, type Invoice } from '../../lib/api';
import { MOCK_RAIL_TOAST } from '../../lib/copy';
import { formatDay, formatMoney } from '../../lib/invoice-display';
import { displayInvoiceId } from '../../lib/tags';

/** Orden Demo Day: PAY → bloqueo → HOLD humano → dup */
const DEMO_LOAD = ['N05', 'T-NEW', 'T-SOFT', 'N01', 'T-DUP'] as const;
const DEMO_SET = new Set<string>(DEMO_LOAD);

/** Una fila por fixtureId (la más reciente). */
function dedupeByFixtureNewest(list: Invoice[]): Invoice[] {
  const seen = new Set<string>();
  const out: Invoice[] = [];
  for (const inv of list) {
    const key = inv.fixtureId ?? inv.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(inv);
  }
  return out;
}

export default function InvoicesPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  /** demo = solo guion; all = toda pendiente dedupe */
  const [scope, setScope] = useState<'demo' | 'all'>('demo');
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [work, setWork] = useState<{
    title: string;
    detail?: string;
    current: number;
    total: number;
    alive?: boolean;
  } | null>(null);

  async function refresh() {
    setInvoices(await api.invoices());
  }

  useEffect(() => {
    void refresh().catch((e) => setToast(String(e)));
  }, []);

  /** Demo Day requiere Autopilot; Advise convierte todo en HOLD. */
  async function ensureAutopilotForDemo(): Promise<{ switched: boolean }> {
    const t = await api.tenant();
    if (t.autonomyMode === 'autopilot') return { switched: false };
    await api.patchTenant({ autonomyMode: 'autopilot' });
    return { switched: true };
  }

  async function loadDemoSet() {
    setBusy(true);
    try {
      const { switched } = await ensureAutopilotForDemo();
      const uniqueSuffix = `d${Date.now().toString(36)}`;
      for (const id of DEMO_LOAD) {
        await api.fromFixture(id, { uniqueSuffix });
      }
      setScope('demo');
      setPage(1);
      await refresh();
      setToast(
        switched
          ? `Set Demo Day: ${DEMO_LOAD.join(' → ')} · autonomía pasada a Autopilot`
          : `Set Demo Day: ${DEMO_LOAD.join(' → ')} · modo Autopilot`,
      );
    } catch (e) {
      setToast(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function decide(invoiceId: string, label?: string) {
    setBusy(true);
    try {
      const d = await api.decide(invoiceId);
      setToast(`${label ?? 'factura'} → ${d.outcome}`);
      await refresh();
      router.push(`/decisions?id=${encodeURIComponent(d.id)}`);
    } catch (e) {
      setToast(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function reviewInbox() {
    if (!rows.length) {
      setToast('No hay pendientes en esta vista. Carga el set Demo Day primero.');
      return;
    }
    const list = rows;
    const total = list.length;
    setBusy(true);
    setToast(null);
    setWork({
      title: `Revisando ${total} factura${total === 1 ? '' : 's'}…`,
      current: 0,
      total,
      alive: true,
    });

    try {
      await ensureAutopilotForDemo();
      const res = await api.reviewInbox({
        invoiceIds: list.map((r) => r.id),
      });
      setWork({
        title: 'Listo',
        current: total,
        total,
        alive: false,
      });
      await refresh();
      await new Promise((r) => window.setTimeout(r, 280));
      setWork(null);
      setToast(res.message);
      if (res.reviewed === 0) return;
      // Solo HOLDs “de regla” (soft/new/…) - no el ruido histórico
      if (res.tally.HOLD > 0) {
        router.push('/decisions?outcome=HOLD&awaiting=1');
      } else if (res.tally.PAY > 0) {
        router.push('/historial');
      } else {
        router.push('/decisions?outcome=DENY');
      }
    } catch (e) {
      setWork(null);
      setToast(String(e));
    } finally {
      setBusy(false);
    }
  }

  const rows = useMemo(() => {
    let pending = invoices.filter((i) => i.status !== 'decided');
    if (scope === 'demo') {
      pending = pending.filter(
        (i) => i.fixtureId && DEMO_SET.has(i.fixtureId),
      );
    }
    pending = dedupeByFixtureNewest(pending);
    return [...pending].sort((a, b) => {
      const ai = DEMO_LOAD.indexOf(a.fixtureId as (typeof DEMO_LOAD)[number]);
      const bi = DEMO_LOAD.indexOf(b.fixtureId as (typeof DEMO_LOAD)[number]);
      const aDemo = ai === -1 ? 99 : ai;
      const bDemo = bi === -1 ? 99 : bi;
      if (aDemo !== bDemo) return aDemo - bDemo;
      return 0;
    });
  }, [invoices, scope]);

  const paged = useMemo(() => paginate(rows, page), [rows, page]);

  return (
    <Shell
      title="Facturas"
      subtitle="Cuentas por pagar de la empresa · el agente las revisa"
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
        icon={FileStack}
        items={[
          'Demo Day: N05 PAY · T-NEW HOLD · T-SOFT PAY · N01 PAY · T-DUP DENY (misma firma; se puede excepcionar si FP)',
          'Ajustar categoría → define con qué banco (uso) se pagará',
          'Revisar bandeja: el agente decide y elige la cuenta por categoría',
        ]}
      >
        Bandeja de cuentas por pagar. La categoría (servicios / proveedores / …)
        enlaza con las cuentas bancarias registradas.
      </Guide>

      <div className="toolbar">
        <div>
          <h2>Cuentas por pagar</h2>
          <p>Bandeja pendiente · dataset demo (sin PDF real aún)</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`btn btn-sm ${scope === 'all' ? 'btn-primary' : ''}`}
            disabled={busy}
            onClick={() => {
              setScope((s) => (s === 'demo' ? 'all' : 'demo'));
              setPage(1);
            }}
          >
            {scope === 'demo' ? 'Ver todas' : 'Solo Demo Day'}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy}
            onClick={() =>
              setToast(
                'Subida PDF / imagen / chat: aún stub. Usa «Cargar set Demo Day».',
              )
            }
          >
            <Upload className="icon" aria-hidden />
            Subir
          </button>
          <Link className="btn btn-sm" href="/cash">
            <Waypoints className="icon" aria-hidden />
            Decidir lote
          </Link>
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy}
            onClick={() => void loadDemoSet()}
          >
            <Upload className="icon" aria-hidden />
            Cargar set Demo Day
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy || !rows.length}
            onClick={() => void reviewInbox()}
          >
            {work ? (
              <Loader2 className="icon spin" aria-hidden />
            ) : (
              <Bot className="icon" aria-hidden />
            )}
            {work ? 'Revisando…' : 'Revisar bandeja'}
          </button>
        </div>
      </div>

      <div className="panel" style={{ padding: 0, overflow: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Beneficiario</th>
              <th>Monto</th>
              <th>Categoría</th>
              <th>Emitida</th>
              <th>Recibida</th>
              <th>Vence</th>
              <th>Etiqueta</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {paged.slice.map((inv) => (
              <tr key={inv.id}>
                <td
                  className="mono"
                  title={`${inv.fixtureId ?? ''} · ${inv.invoiceNumber}`}
                >
                  {displayInvoiceId(inv.invoiceNumber)}
                </td>
                <td>{inv.payeeName}</td>
                <td className="mono">
                  {formatMoney(inv.amount, inv.currency || 'USD')}
                </td>
                <td>
                  <select
                    value={inv.paymentCategory ?? 'suppliers'}
                    disabled={busy}
                    aria-label={`Categoría ${inv.invoiceNumber}`}
                    onChange={(e) =>
                      void (async () => {
                        setBusy(true);
                        try {
                          await api.setInvoiceCategory(inv.id, e.target.value);
                          await refresh();
                          setToast(
                            `${displayInvoiceId(inv.invoiceNumber)} → ${e.target.value}`,
                          );
                        } catch (err) {
                          setToast(String(err));
                        } finally {
                          setBusy(false);
                        }
                      })()
                    }
                    style={{
                      background: '#0d1219',
                      border: '1px solid var(--line-strong)',
                      borderRadius: 'var(--r)',
                      padding: '6px 8px',
                      color: 'var(--ez-cloud)',
                      fontSize: 12,
                      maxWidth: 130,
                    }}
                  >
                    <option value="services">Servicios</option>
                    <option value="suppliers">Proveedores</option>
                    <option value="payroll">Nómina</option>
                    <option value="ops">Operaciones</option>
                    <option value="general">General</option>
                  </select>
                </td>
                <td
                  className="mono muted"
                  title={inv.issueDate ?? undefined}
                >
                  {formatDay(inv.issueDate)}
                </td>
                <td
                  className="mono muted"
                  title={inv.createdAt ?? undefined}
                >
                  {formatDay(inv.createdAt)}
                </td>
                <td className="mono muted" title={inv.dueDate ?? undefined}>
                  {formatDay(inv.dueDate)}
                </td>
                <td>
                  <Tag
                    tags={inv.tags}
                    fixtureId={inv.fixtureId}
                    expectedOutcome={inv.expectedOutcome}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={busy}
                    onClick={() => void decide(inv.id, inv.fixtureId)}
                  >
                    <Gavel className="icon" aria-hidden />
                    Decidir
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={9} className="muted" style={{ padding: 24 }}>
                  {scope === 'demo' ? (
                    <>
                      Sin set Demo Day pendiente. Pulsa{' '}
                      <strong>Cargar set Demo Day</strong> (N05 → T-NEW → T-SOFT
                      → N01 → T-DUP).
                    </>
                  ) : (
                    <>Bandeja vacía.</>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <Pagination {...paged} onChange={setPage} label="facturas" />
      </div>

      {work && <WorkProgress {...work} />}
      {!work && toast && <div className="toast">{toast}</div>}
    </Shell>
  );
}
