'use client';

import { FlaskConical, Play } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Guide } from '../../components/Guide';
import {
  PAGE_SIZE_OPTIONS,
  Pagination,
  paginate,
} from '../../components/Pagination';
import { Shell } from '../../components/Shell';
import { StatusBadge } from '../../components/StatusBadge';
import { Tag } from '../../components/Tag';
import { WorkProgress } from '../../components/WorkProgress';
import { api, type EvalResult } from '../../lib/api';

type CaseFilter = 'all' | 'fail' | 'false_pay';

export default function EvalPage() {
  const [result, setResult] = useState<EvalResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingLatest, setLoadingLatest] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [caseFilter, setCaseFilter] = useState<CaseFilter>('all');
  const [work, setWork] = useState<{
    title: string;
    detail?: string;
    current: number;
    total: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .evalLatest()
      .then((latest) => {
        if (cancelled || !latest?.metrics) return;
        setResult({
          ...latest,
          gate:
            latest.gate ??
            (latest.passedGate
              ? 'PASS false_pay=0'
              : `FAIL false_pay=${latest.metrics.falsePay}`),
          cases: latest.cases ?? [],
        });
      })
      .catch(() => {
        /* sin corrida previa o API caída - OK */
      })
      .finally(() => {
        if (!cancelled) setLoadingLatest(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function run() {
    setBusy(true);
    setError(null);
    setWork({
      title: 'Ejecutando suite adversaria…',
      detail: '24 fixtures · false_pay gate',
      current: 1,
      total: 1,
    });
    try {
      const res = await api.evalRun();
      setResult(res);
      setPage(1);
      setCaseFilter('all');
      setWork(null);
    } catch (e) {
      setWork(null);
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const m = result?.metrics;
  const cases = useMemo(() => {
    const all = result?.cases ?? [];
    if (caseFilter === 'fail') return all.filter((c) => !c.ok);
    if (caseFilter === 'false_pay') {
      return all.filter(
        (c) => c.actual === 'PAY' && c.expected !== 'PAY',
      );
    }
    return all;
  }, [result, caseFilter]);

  const paged = useMemo(
    () => paginate(cases, page, pageSize),
    [cases, page, pageSize],
  );

  useEffect(() => {
    setPage(1);
  }, [caseFilter, pageSize]);

  const failN = result?.cases.filter((c) => !c.ok).length ?? 0;

  return (
    <Shell
      title="Eval"
      subtitle="false_pay = 0 · puerta de liberación"
      actions={
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy}
          onClick={() => void run()}
        >
          <Play className="icon" aria-hidden />
          {busy ? 'Ejecutando…' : 'Ejecutar eval'}
        </button>
      }
    >
      <Guide
        icon={FlaskConical}
        items={[
          'Ejecutar la suite sobre 24 fixtures etiquetados (incl. inyección)',
          'Mostrar false_pay = 0 al jurado',
          'Un falso PAY descalifica: esto es el producto',
        ]}
      >
        La suite adversaria no es CI de segundo plano: es la prueba de que un
        pago indebido no pasa. Corre en el motor de política (sin LLM).
      </Guide>

      {error && <div className="callout callout-warn">{error}</div>}
      {result?.passedGate && (
        <div className="callout callout-ok">{result.gate}</div>
      )}
      {result && !result.passedGate && (
        <div className="callout callout-warn">{result.gate}</div>
      )}

      <div className="grid-3" style={{ marginBottom: 16 }}>
        <div className="metric">
          <div className="k">false_pay</div>
          <div className={`v ${m && m.falsePay === 0 ? 'ok' : ''}`}>
            {m ? m.falsePay : '-'}
          </div>
          <div className="h">Puerta: descalifica si &gt; 0</div>
        </div>
        <div className="metric">
          <div className="k">Precisión</div>
          <div className="v">
            {m ? `${Math.round(m.accuracy * 100)}%` : '-'}
          </div>
          <div className="h">
            {m ? `${m.passed}/${m.total} casos` : 'Sin corrida'}
            {m && typeof m.falseDeny === 'number'
              ? ` · false_deny ${m.falseDeny}`
              : ''}
          </div>
          {m && (
            <div className="bar">
              <i style={{ width: `${Math.round(m.accuracy * 100)}%` }} />
            </div>
          )}
        </div>
        <div className="metric">
          <div className="k">Tasa de autonomía</div>
          <div className="v">
            {m ? `${Math.round(m.autonomyRate * 100)}%` : '-'}
          </div>
          <div className="h">Happy path (normal) con PAY automático</div>
        </div>
      </div>

      <div className="toolbar" style={{ marginBottom: 10 }}>
        <div>
          <h2>Casos</h2>
          <p>
            {loadingLatest
              ? 'Cargando última corrida…'
              : result
                ? `${result.metrics.total} en suite · mostrando ${cases.length}`
                : 'Sin corrida aún'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(
            [
              ['all', 'Todos'],
              ['fail', `Fallidos (${failN})`],
              ['false_pay', 'false_pay'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={`btn btn-sm ${caseFilter === k ? 'btn-primary' : ''}`}
              disabled={!result}
              onClick={() => setCaseFilter(k)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="panel" style={{ padding: 0, overflow: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Caso</th>
              <th>Etiqueta</th>
              <th>Esperado</th>
              <th>Obtenido</th>
              <th>OK</th>
            </tr>
          </thead>
          <tbody>
            {paged.slice.map((c) => (
              <tr key={c.fixtureId}>
                <td className="mono">{c.fixtureId}</td>
                <td>
                  <Tag fixtureId={c.fixtureId} expectedOutcome={c.expected} />
                </td>
                <td>
                  <StatusBadge outcome={c.expected} />
                </td>
                <td>
                  <StatusBadge outcome={c.actual} />
                </td>
                <td
                  style={{
                    color: c.ok ? 'var(--ez-pay)' : 'var(--ez-deny)',
                  }}
                >
                  {c.ok ? '✓' : '✗'}
                </td>
              </tr>
            ))}
            {loadingLatest && (
              <tr>
                <td colSpan={5} className="muted" style={{ padding: 20 }}>
                  Cargando última corrida…
                </td>
              </tr>
            )}
            {!loadingLatest && !result && (
              <tr>
                <td colSpan={5} className="muted" style={{ padding: 20 }}>
                  Pulsa «Ejecutar eval» (API arriba + túnel SOCKS si usas Atlas).
                </td>
              </tr>
            )}
            {result && !cases.length && (
              <tr>
                <td colSpan={5} className="muted" style={{ padding: 20 }}>
                  Ningún caso en este filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <Pagination
          {...paged}
          onChange={setPage}
          label="casos"
          pageSize={pageSize}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          onPageSizeChange={setPageSize}
        />
      </div>

      {work && <WorkProgress {...work} />}
    </Shell>
  );
}
