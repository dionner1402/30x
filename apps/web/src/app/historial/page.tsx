'use client';

import Link from 'next/link';
import { Check, History } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { DateRangeFilter } from '../../components/DateRangeFilter';
import { Guide } from '../../components/Guide';
import {
  PAGE_SIZE_OPTIONS,
  Pagination,
  paginate,
} from '../../components/Pagination';
import { Shell } from '../../components/Shell';
import { StatusBadge } from '../../components/StatusBadge';
import { api, type Decision, type Invoice } from '../../lib/api';
import {
  EMPTY_RANGE,
  inDateRange,
  type DatePreset,
  type DateRange,
} from '../../lib/date-range';
import {
  formatDateTime,
  formatMoney,
} from '../../lib/invoice-display';
import { displayInvoiceId } from '../../lib/tags';

export default function HistorialPage() {
  const [list, setList] = useState<Decision[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'reconciled'>('all');
  const [dateRange, setDateRange] = useState<DateRange>(EMPTY_RANGE);
  const [datePreset, setDatePreset] = useState<DatePreset>('all');

  async function refresh() {
    const [pays, inv] = await Promise.all([
      api.decisions('PAY'),
      api.invoices(),
    ]);
    setList(Array.isArray(pays) ? pays : []);
    setInvoices(Array.isArray(inv) ? inv : []);
  }

  useEffect(() => {
    void refresh().catch((e) => setToast(String(e)));
  }, []);

  const byInvoice = useMemo(() => {
    const m = new Map<string, Invoice>();
    for (const i of invoices) m.set(i.id, i);
    return m;
  }, [invoices]);

  const filtered = useMemo(() => {
    let rows = list.filter((d) => inDateRange(d.createdAt, dateRange));
    if (filter === 'pending') {
      rows = rows.filter((d) => d.reconcileStatus !== 'reconciled');
    } else if (filter === 'reconciled') {
      rows = rows.filter((d) => d.reconcileStatus === 'reconciled');
    }
    return rows;
  }, [list, filter, dateRange]);

  useEffect(() => {
    setPage(1);
  }, [filter, list.length, dateRange, pageSize]);

  const paged = useMemo(
    () => paginate(filtered, page, pageSize),
    [filtered, page, pageSize],
  );

  async function reconcile(id: string) {
    setBusy(true);
    try {
      await api.reconcileDecision(id);
      await refresh();
      setToast('Marcado conciliado (mock · extracto OK)');
    } catch (e) {
      setToast(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function reconcilePendingVisible() {
    const ids = paged.slice
      .filter((d) => d.reconcileStatus !== 'reconciled')
      .map((d) => d.id);
    if (!ids.length) {
      setToast('No hay pendientes en esta página');
      return;
    }
    setBusy(true);
    try {
      for (const id of ids) {
        await api.reconcileDecision(id);
      }
      await refresh();
      setToast(`${ids.length} conciliados (mock)`);
    } catch (e) {
      setToast(String(e));
    } finally {
      setBusy(false);
    }
  }

  const pendingN = list.filter(
    (d) => d.reconcileStatus !== 'reconciled',
  ).length;
  const reconciledN = list.length - pendingN;

  function amountFor(d: Decision, inv?: Invoice) {
    if (inv) return formatMoney(inv.amount, inv.currency || 'USD');
    if (d.paymentAccount?.debited != null) {
      return formatMoney(d.paymentAccount.debited, 'USD');
    }
    return '-';
  }

  const emptyCopy =
    list.length === 0
      ? 'Sin PAY aún. En Facturas: cargar set → Revisar bandeja (o aprobar un HOLD).'
      : filtered.length === 0 && (dateRange.from || dateRange.to)
        ? 'Ningún PAY en ese rango de fechas. Prueba «Todo» o amplía Desde/Hasta.'
        : filter === 'reconciled'
          ? 'Ningún pago conciliado todavía. Usa «Conciliar» cuando el extracto lo confirme.'
          : filter === 'pending'
            ? 'No hay pendientes: todos los PAY de esta vista ya están conciliados.'
            : 'Sin filas en esta página.';

  return (
    <Shell
      title="Historial"
      subtitle="Conciliación · de qué cuenta salió cada PAY"
    >
      <Guide
        icon={History}
        items={[
          'Cada PAY elige cuenta y descuenta el saldo mock',
          'Filtra por fecha (Hoy / 7 / 30 días) y estado de conciliación',
          'Pendientes → Conciliar cuando finanzas confirma el movimiento',
        ]}
      >
        Cierra el ciclo: el agente decidió y debitó la cuenta; finanzas
        concilia el movimiento real (aquí mock).
      </Guide>

      <div className="toolbar">
        <div>
          <h2>Pagos autorizados</h2>
          <p>
            {list.length} PAY · {pendingN} por conciliar
            {reconciledN > 0 ? ` · ${reconciledN} conciliados` : ''}
            {` · vista ${filtered.length}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(
            [
              ['all', 'Todos'],
              ['pending', 'Pendientes'],
              ['reconciled', 'Conciliados'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={`btn btn-sm ${filter === k ? 'btn-primary' : ''}`}
              onClick={() => setFilter(k)}
            >
              {label}
            </button>
          ))}
          {pendingN > 0 && (
            <button
              type="button"
              className="btn btn-sm"
              disabled={busy}
              onClick={() => void reconcilePendingVisible()}
            >
              <Check className="icon" aria-hidden />
              Conciliar página
            </button>
          )}
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <DateRangeFilter
          value={dateRange}
          onChange={setDateRange}
          preset={datePreset}
          onPreset={setDatePreset}
        />
      </div>

      <div className="panel" style={{ padding: 0, overflow: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Factura</th>
              <th>Beneficiario</th>
              <th>Monto</th>
              <th>Cuenta</th>
              <th>Pagado</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {paged.slice.map((d) => {
              const inv = byInvoice.get(d.invoiceId);
              const acc = d.paymentAccount;
              const done = d.reconcileStatus === 'reconciled';
              return (
                <tr key={d.id}>
                  <td className="mono">
                    <Link href={`/decisions?id=${encodeURIComponent(d.id)}`}>
                      {displayInvoiceId(inv?.invoiceNumber) ||
                        `…${d.invoiceId.slice(-6)}`}
                    </Link>
                  </td>
                  <td>{inv?.payeeName ?? '-'}</td>
                  <td className="mono">{amountFor(d, inv)}</td>
                  <td>
                    {acc ? (
                      <>
                        <strong>{acc.bank}</strong>
                        <span
                          className="muted"
                          style={{ display: 'block', fontSize: 11 }}
                        >
                          {acc.name} · {acc.usage}
                        </span>
                      </>
                    ) : (
                      <span className="muted">sin cuenta (PAY anterior)</span>
                    )}
                  </td>
                  <td className="mono muted" title={d.createdAt}>
                    {formatDateTime(d.createdAt)}
                  </td>
                  <td>
                    <StatusBadge outcome="PAY" />
                    <span
                      className="muted"
                      style={{ display: 'block', fontSize: 10 }}
                    >
                      {done ? 'conciliado' : 'pendiente'}
                    </span>
                  </td>
                  <td>
                    {!done && (
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={busy}
                        onClick={() => void reconcile(d.id)}
                      >
                        <Check className="icon" aria-hidden />
                        Conciliar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {!paged.slice.length && (
              <tr>
                <td colSpan={7} className="muted" style={{ padding: 24 }}>
                  {emptyCopy}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <Pagination
          {...paged}
          onChange={setPage}
          label="pagos"
          pageSize={pageSize}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          onPageSizeChange={setPageSize}
        />
      </div>

      {toast && <div className="toast">{toast}</div>}
    </Shell>
  );
}
