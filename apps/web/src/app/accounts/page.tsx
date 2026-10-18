'use client';

import Link from 'next/link';
import { ChevronDown, ChevronRight, Landmark, Plus } from 'lucide-react';
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
import {
  api,
  type Decision,
  type Invoice,
  type PaymentAccount,
} from '../../lib/api';
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

const USAGE_LABEL: Record<string, string> = {
  services: 'Servicios',
  suppliers: 'Proveedores',
  payroll: 'Nómina',
  ops: 'Operaciones',
  general: 'General',
};

const USAGE_ORDER = [
  'services',
  'suppliers',
  'payroll',
  'ops',
  'general',
] as const;

type UsageKey = (typeof USAGE_ORDER)[number];

export default function AccountsPage() {
  const [rows, setRows] = useState<PaymentAccount[]>([]);
  const [pays, setPays] = useState<Decision[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [bank, setBank] = useState('Banco D');
  const [name, setName] = useState('');
  const [usage, setUsage] = useState('suppliers');
  const [priority, setPriority] = useState(40);
  const [movPage, setMovPage] = useState(1);
  const [movPageSize, setMovPageSize] = useState(10);
  const [dateRange, setDateRange] = useState<DateRange>(EMPTY_RANGE);
  const [datePreset, setDatePreset] = useState<DatePreset>('all');

  async function refresh() {
    const [acc, decisions, inv] = await Promise.all([
      api.accounts(),
      api.decisions('PAY'),
      api.invoices(),
    ]);
    setRows(acc);
    setPays(Array.isArray(decisions) ? decisions : []);
    setInvoices(Array.isArray(inv) ? inv : []);
    setOpenGroups((prev) => {
      const next = { ...prev };
      for (const u of USAGE_ORDER) {
        if (next[u] === undefined) next[u] = true;
      }
      return next;
    });
    setSelectedId((prev) => {
      if (prev && acc.some((a) => a.id === prev)) return prev;
      return null;
    });
  }

  useEffect(() => {
    void refresh().catch((e) => setToast(String(e)));
  }, []);

  const byInvoice = useMemo(() => {
    const m = new Map<string, Invoice>();
    for (const i of invoices) m.set(i.id, i);
    return m;
  }, [invoices]);

  const movCountByAccount = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of pays) {
      const id = d.paymentAccount?.accountId;
      if (!id) continue;
      m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  }, [pays]);

  const grouped = useMemo(() => {
    const map = new Map<string, PaymentAccount[]>();
    for (const u of USAGE_ORDER) map.set(u, []);
    for (const a of rows) {
      const key = USAGE_ORDER.includes(a.usage as UsageKey)
        ? a.usage
        : 'general';
      const list = map.get(key) ?? [];
      list.push(a);
      map.set(key, list);
    }
    return USAGE_ORDER.map((u) => ({
      usage: u,
      label: USAGE_LABEL[u] ?? u,
      accounts: map.get(u) ?? [],
    })).filter((g) => g.accounts.length > 0);
  }, [rows]);

  const selected = rows.find((a) => a.id === selectedId) ?? null;

  const movements = useMemo(() => {
    if (!selectedId) return [];
    return pays
      .filter(
        (d) =>
          d.paymentAccount?.accountId === selectedId &&
          inDateRange(d.createdAt, dateRange),
      )
      .slice()
      .sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      });
  }, [pays, selectedId, dateRange]);

  const movedTotal = useMemo(
    () =>
      movements.reduce((sum, d) => {
        const inv = byInvoice.get(d.invoiceId);
        const amt = d.paymentAccount?.debited ?? inv?.amount ?? 0;
        return sum + Number(amt);
      }, 0),
    [movements, byInvoice],
  );

  const pagedMov = useMemo(
    () => paginate(movements, movPage, movPageSize),
    [movements, movPage, movPageSize],
  );

  useEffect(() => {
    setMovPage(1);
  }, [selectedId, movPageSize, dateRange]);

  const activeN = rows.filter((a) => a.active).length;

  function toggleGroup(usageKey: string) {
    setOpenGroups((prev) => ({ ...prev, [usageKey]: !prev[usageKey] }));
  }

  function selectAccount(id: string) {
    setSelectedId((prev) => (prev === id ? null : id));
  }

  async function create() {
    if (!name.trim()) {
      setToast('Indica un nombre de cuenta');
      return;
    }
    setBusy(true);
    try {
      await api.createAccount({
        bank: bank.trim() || 'Banco',
        name: name.trim(),
        usage,
        priority,
        mockBalance: 10000,
      });
      setName('');
      setShowForm(false);
      await refresh();
      setToast('Cuenta registrada. El agente ya puede usarla en PAY');
    } catch (e) {
      setToast(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function savePriority(id: string, value: number) {
    setBusy(true);
    try {
      await api.patchAccount(id, { priority: value });
      await refresh();
    } catch (e) {
      setToast(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(a: PaymentAccount) {
    setBusy(true);
    try {
      await api.patchAccount(a.id, { active: !a.active });
      await refresh();
    } catch (e) {
      setToast(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell
      title="Cuentas"
      subtitle="De dónde paga la empresa · uso + prioridad · movimientos"
      actions={
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy}
          onClick={() => setShowForm((v) => !v)}
        >
          <Plus className="icon" aria-hidden />
          {showForm ? 'Cerrar' : 'Registrar cuenta'}
        </button>
      }
    >
      <Guide
        icon={Landmark}
        items={[
          'Grupos por uso (colapsables). Clic en una cuenta → movimientos abajo',
          'Filtra movimientos por fecha · paginación 10–500',
          'El saldo baja al autorizar PAY; concilia en Historial',
        ]}
      >
        El agente no inventa la fuente de fondos: paga solo desde cuentas
        registradas. Elige un banco para ver de qué facturas salió el dinero.
      </Guide>

      <div className="toolbar">
        <div>
          <h2>Cuentas de pago</h2>
          <p>
            {activeN} activas · {rows.length} registradas · ordenadas por
            prioridad
          </p>
        </div>
        <Link className="btn btn-sm" href="/historial">
          Conciliación global
        </Link>
      </div>

      <div className="callout callout-info" style={{ marginBottom: 14 }}>
        <Landmark className="icon" aria-hidden />
        <div>
          Ejemplo: <strong>Banco A</strong> → servicios ·{' '}
          <strong>Banco B</strong> → proveedores · <strong>Banco C</strong> →
          nómina. Si el uso no tiene saldo suficiente, el PAY cae a otra cuenta
          que sí cubra (p. ej. <em>General</em>).
        </div>
      </div>

      {showForm && (
        <div className="panel" style={{ marginBottom: 14 }}>
          <div className="panel-head">
            <div>
              <h2>Nueva cuenta</h2>
              <p>Queda disponible para el agente en el próximo PAY</p>
            </div>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 12,
              alignItems: 'end',
            }}
          >
            <div className="field" style={{ margin: 0 }}>
              <label>Banco</label>
              <input value={bank} onChange={(e) => setBank(e.target.value)} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Alias</label>
              <input
                value={name}
                placeholder="Proveedores LATAM"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Uso</label>
              <select
                value={usage}
                onChange={(e) => setUsage(e.target.value)}
                style={{
                  width: '100%',
                  background: '#0d1219',
                  border: '1px solid var(--line-strong)',
                  borderRadius: 'var(--r)',
                  padding: '9px 11px',
                  color: 'var(--ez-cloud)',
                }}
              >
                {Object.entries(USAGE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Prioridad</label>
              <input
                type="number"
                className="input-inline"
                style={{ width: '100%' }}
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
              />
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy}
              onClick={() => void create()}
              style={{ height: 38 }}
            >
              Guardar
            </button>
          </div>
        </div>
      )}

      <div className="panel" style={{ padding: 0, overflow: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: 28 }}></th>
              <th>Banco</th>
              <th>Alias</th>
              <th>Prioridad</th>
              <th>Saldo</th>
              <th>Mov.</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {grouped.flatMap((g) => {
              const open = openGroups[g.usage] !== false;
              const header = (
                <tr key={`g-${g.usage}`}>
                  <td
                    colSpan={7}
                    style={{
                      background: 'rgba(255,214,0,0.04)',
                      padding: 0,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleGroup(g.usage)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        width: '100%',
                        border: 0,
                        background: 'transparent',
                        color: 'var(--ez-neutral)',
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        padding: '12px 16px 8px',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      {open ? (
                        <ChevronDown className="icon-sm" aria-hidden />
                      ) : (
                        <ChevronRight className="icon-sm" aria-hidden />
                      )}
                      {g.label} · {g.accounts.length} cuenta
                      {g.accounts.length === 1 ? '' : 's'}
                    </button>
                  </td>
                </tr>
              );
              if (!open) return [header];
              return [
                header,
                ...g.accounts.map((a) => {
                  const n = movCountByAccount.get(a.id) ?? 0;
                  const on = a.id === selectedId;
                  return (
                    <tr
                      key={a.id}
                      className="clickable"
                      style={{
                        opacity: a.active ? 1 : 0.45,
                        background: on
                          ? 'rgba(255,214,0,0.06)'
                          : undefined,
                      }}
                      onClick={() => selectAccount(a.id)}
                    >
                      <td className="muted" style={{ fontSize: 11 }}>
                        {on ? '▸' : ''}
                      </td>
                      <td>
                        <strong>{a.bank}</strong>
                      </td>
                      <td>{a.name}</td>
                      <td
                        className="mono"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="number"
                          className="input-inline"
                          style={{ width: 64 }}
                          defaultValue={a.priority}
                          disabled={busy}
                          onBlur={(e) => {
                            const v = Number(e.target.value);
                            if (v !== a.priority) void savePriority(a.id, v);
                          }}
                          aria-label={`Prioridad ${a.name}`}
                        />
                      </td>
                      <td className="mono">
                        {formatMoney(a.mockBalance, a.currency || 'USD')}
                      </td>
                      <td className="mono muted">{n}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="btn btn-sm"
                          disabled={busy}
                          onClick={() => void toggleActive(a)}
                        >
                          {a.active ? 'Off' : 'On'}
                        </button>
                      </td>
                    </tr>
                  );
                }),
              ];
            })}
            {!rows.length && (
              <tr>
                <td colSpan={7} className="muted" style={{ padding: 24 }}>
                  Sin cuentas. Pulsa «Registrar cuenta» o recarga para el seed
                  demo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="panel" style={{ padding: 0, overflow: 'auto', marginTop: 14 }}>
        <div className="panel-head" style={{ padding: '14px 16px' }}>
          <div>
            <h2>
              {selected
                ? `Movimientos · ${selected.bank} · ${selected.name}`
                : 'Movimientos'}
            </h2>
            <p>
              {selected
                ? `${movements.length} PAY · debitado ${formatMoney(movedTotal)} · saldo ${formatMoney(selected.mockBalance, selected.currency || 'USD')}`
                : 'Selecciona una cuenta arriba para ver su historial'}
            </p>
          </div>
        </div>
        {selected && (
          <div style={{ padding: '0 16px 12px' }}>
            <DateRangeFilter
              value={dateRange}
              onChange={setDateRange}
              preset={datePreset}
              onPreset={setDatePreset}
            />
          </div>
        )}
        <table>
          <thead>
            <tr>
              <th>Factura</th>
              <th>Beneficiario</th>
              <th>Débito</th>
              <th>Cuándo</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {selected &&
              pagedMov.slice.map((d) => {
                const inv = byInvoice.get(d.invoiceId);
                const amt =
                  d.paymentAccount?.debited ?? inv?.amount ?? null;
                const done = d.reconcileStatus === 'reconciled';
                return (
                  <tr key={d.id}>
                    <td className="mono">
                      <Link
                        href={`/decisions?id=${encodeURIComponent(d.id)}`}
                      >
                        {displayInvoiceId(inv?.invoiceNumber) ||
                          `…${d.invoiceId.slice(-6)}`}
                      </Link>
                    </td>
                    <td>{inv?.payeeName ?? '-'}</td>
                    <td className="mono">
                      {amt != null
                        ? `−${formatMoney(amt, inv?.currency || 'USD')}`
                        : '-'}
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
                  </tr>
                );
              })}
            {selected && !movements.length && (
              <tr>
                <td colSpan={5} className="muted" style={{ padding: 24 }}>
                  {dateRange.from || dateRange.to
                    ? 'Sin movimientos en ese rango. Prueba «Todo» o amplía las fechas.'
                    : 'Sin movimientos en esta cuenta.'}
                </td>
              </tr>
            )}
            {!selected && (
              <tr>
                <td colSpan={5} className="muted" style={{ padding: 24 }}>
                  Elige un banco en la tabla de arriba.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {selected && (
          <Pagination
            {...pagedMov}
            onChange={setMovPage}
            label="movimientos"
            pageSize={movPageSize}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            onPageSizeChange={setMovPageSize}
          />
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </Shell>
  );
}
