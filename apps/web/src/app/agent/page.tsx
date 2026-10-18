'use client';

import Link from 'next/link';
import { Bot, Play, Save, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Guide } from '../../components/Guide';
import { Shell } from '../../components/Shell';
import { StatusBadge } from '../../components/StatusBadge';
import { Tag } from '../../components/Tag';
import { WorkProgress } from '../../components/WorkProgress';
import {
  api,
  type AgentRunResult,
  type AgentSchedule,
  type AgentWave,
} from '../../lib/api';
import {
  PAYMENT_CATEGORIES,
  categoryLabel,
} from '../../lib/invoice-display';

/** Opciones de ola: las de Facturas + resto pendiente. */
const WAVE_CAT_OPTIONS: string[] = [...PAYMENT_CATEGORIES, '*'];

const MODE_LABEL: Record<string, string> = {
  advise: 'Advise',
  assist: 'Assist',
  autopilot: 'Autopilot',
  advisor: 'Advise',
  collaborator: 'Assist',
  operator: 'Autopilot',
};

function sortWaves(waves: AgentWave[]): AgentWave[] {
  return [...waves].sort((a, b) => a.timeLocal.localeCompare(b.timeLocal));
}

/** Normaliza a HH:mm (el input time a veces entrega H:mm). */
function normalizeTime(raw: string): string {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return raw;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

function toggleCategory(current: string[], cat: string): string[] {
  if (cat === '*') {
    return current.includes('*') ? current.filter((c) => c !== '*') : ['*'];
  }
  const withoutStar = current.filter((c) => c !== '*');
  if (withoutStar.includes(cat)) {
    const next = withoutStar.filter((c) => c !== cat);
    return next.length ? next : withoutStar;
  }
  return [...withoutStar, cat];
}

export default function AgentPage() {
  const [schedule, setSchedule] = useState<AgentSchedule | null>(null);
  const [draft, setDraft] = useState<AgentWave[] | null>(null);
  const [lastRun, setLastRun] = useState<AgentRunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [work, setWork] = useState<{
    title: string;
    detail?: string;
    current: number;
    total: number;
    alive?: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([api.agentSchedule(), api.agentRunLatest()])
      .then(([sch, run]) => {
        if (cancelled) return;
        setSchedule(sch);
        setDraft(sch.waves.map((w) => ({ ...w, categories: [...w.categories] })));
        if (run) setLastRun(run);
      })
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

  const dirty =
    !!draft &&
    !!schedule &&
    JSON.stringify(draft) !== JSON.stringify(schedule.waves);

  async function saveSchedule() {
    if (!draft) return;
    for (const w of draft) {
      if (!w.categories.length) {
        setError(`La ola «${w.label}» necesita al menos una categoría.`);
        return;
      }
      if (!/^\d{2}:\d{2}$/.test(w.timeLocal)) {
        setError(`Hora inválida en «${w.label}». Usa formato 24 h (ej. 14:00).`);
        return;
      }
    }
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const sorted = sortWaves(draft);
      const sch = await api.patchAgentSchedule(sorted);
      setSchedule(sch);
      setDraft(sch.waves.map((w) => ({ ...w, categories: [...w.categories] })));
      setSavedMsg('Horario de olas guardado.');
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  function updateWave(
    id: string,
    patch: Partial<Pick<AgentWave, 'label' | 'timeLocal' | 'categories'>>,
  ) {
    setDraft((prev) =>
      prev
        ? prev.map((w) => (w.id === id ? { ...w, ...patch } : w))
        : prev,
    );
    setSavedMsg(null);
    setError(null);
  }

  async function runNow() {
    setBusy(true);
    setError(null);
    const waveCount = draft?.length ?? schedule?.waves.length ?? 3;
    setWork({
      title: 'Corrida del agente…',
      current: 0,
      total: Math.max(waveCount, 1),
      alive: true,
    });
    try {
      const res = await api.agentRun();
      setLastRun(res);
      setWork(null);
    } catch (e) {
      setWork(null);
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const t = lastRun?.totals;
  const reviewed =
    lastRun?.waves.reduce((n, w) => n + (w.reviewed ?? 0), 0) ?? 0;
  const modeKey = schedule?.autonomyMode ?? '';
  const modeLabel = MODE_LABEL[modeKey] ?? modeKey;

  return (
    <Shell
      title="Corrida del agente"
      subtitle="Configura las horas de cada ola · un clic para correr ahora"
      actions={
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy || loading}
          onClick={() => void runNow()}
        >
          <Play className="icon" aria-hidden />
          {busy ? 'Ejecutando…' : 'Ejecutar corrida ahora'}
        </button>
      }
    >
      <Guide
        icon={Bot}
        items={[
          'Define hora (24 h) y categorías de cada ola (mismas que en Facturas)',
          'Guarda el horario; en demo dispara con «Ejecutar corrida ahora»',
          'HOLD → Decisiones; la autonomía se fija en Política',
        ]}
      >
        Programación del agente: ustedes eligen cuándo y qué categorías
        procesa. Las reglas de Política siguen mandando.
      </Guide>

      {work && <WorkProgress {...work} />}

      {error && <div className="callout callout-warn">{error}</div>}
      {savedMsg && <div className="callout callout-ok">{savedMsg}</div>}

      {lastRun && reviewed > 0 && (
        <div className="callout callout-ok">{lastRun.message}</div>
      )}
      {lastRun && reviewed === 0 && (
        <div className="callout callout-info">
          {lastRun.message}{' '}
          <Link href="/invoices">Ir a Facturas</Link>
        </div>
      )}

      <div className="grid-3" style={{ marginBottom: 16 }}>
        <div className="metric">
          <div className="k">PAY</div>
          <div className={`v ${t && t.PAY > 0 ? 'ok' : ''}`}>
            {t ? t.PAY : '-'}
          </div>
          <div className="h">Autorizados en la última corrida</div>
        </div>
        <div className="metric">
          <div className="k">HOLD</div>
          <div className="v" style={{ color: 'var(--ez-hold)' }}>
            {t ? t.HOLD : '-'}
          </div>
          <div className="h">Requieren permiso humano</div>
        </div>
        <div className="metric">
          <div className="k">DENY</div>
          <div className="v" style={{ color: 'var(--ez-deny)' }}>
            {t ? t.DENY : '-'}
          </div>
          <div className="h">Bloqueados por política</div>
        </div>
      </div>

      {(draft || schedule) && (
        <>
          <div className="toolbar">
            <div>
              <h2>Horario de olas</h2>
              <p>
                Modo <Tag label={modeLabel} /> · {schedule?.hint}{' '}
                <Link href="/policy">Cambiar en Política</Link>
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Link className="btn btn-sm" href="/decisions">
                <ShieldCheck className="icon icon-sm" aria-hidden />
                Ver decisiones
              </Link>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!dirty || saving || loading}
                onClick={() => void saveSchedule()}
              >
                <Save className="icon icon-sm" aria-hidden />
                {saving ? 'Guardando…' : 'Guardar horario'}
              </button>
            </div>
          </div>

          <div className="callout callout-info" style={{ marginBottom: 12 }}>
            <Bot className="icon" aria-hidden />
            <div>
              <strong>Corrida automática.</strong> Hora en formato 24 h.
              Categorías: las mismas de Facturas (General, Operaciones,
              Proveedores, Servicios, Nómina) o «Resto pendiente». En demo:
              «Ejecutar corrida ahora»; en producción un job usa estas horas.
            </div>
          </div>

          <div className="panel" style={{ padding: 0, overflow: 'auto', marginBottom: 16 }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 108 }}>Hora</th>
                  <th style={{ width: 200 }}>Ola</th>
                  <th>Categorías</th>
                </tr>
              </thead>
              <tbody>
                {(draft ?? schedule!.waves).map((w) => (
                  <tr key={w.id}>
                    <td>
                      <input
                        type="time"
                        className="input-time"
                        step={60}
                        value={w.timeLocal}
                        aria-label={`Hora de ${w.label}`}
                        onChange={(e) =>
                          updateWave(w.id, {
                            timeLocal: normalizeTime(e.target.value),
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className="input-inline"
                        value={w.label}
                        aria-label={`Nombre de ola ${w.id}`}
                        onChange={(e) =>
                          updateWave(w.id, { label: e.target.value })
                        }
                      />
                    </td>
                    <td>
                      <div className="cat-picks" role="group" aria-label={`Categorías de ${w.label}`}>
                        {WAVE_CAT_OPTIONS.map((c) => {
                          const on = w.categories.includes(c);
                          return (
                            <button
                              key={c}
                              type="button"
                              className={`cat-pick${on ? ' is-on' : ''}`}
                              aria-pressed={on}
                              onClick={() =>
                                updateWave(w.id, {
                                  categories: toggleCategory(w.categories, c),
                                })
                              }
                            >
                              {categoryLabel(c)}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="toolbar">
        <div>
          <h2>Última corrida</h2>
          <p>
            {loading
              ? 'Cargando…'
              : lastRun
                ? `${reviewed} revisadas · ${MODE_LABEL[lastRun.autonomyMode] ?? lastRun.autonomyMode}`
                : 'Sin corrida aún. Ejecuta arriba'}
            {lastRun?.createdAt
              ? ` · ${new Date(lastRun.createdAt).toLocaleString('es')}`
              : ''}
          </p>
        </div>
      </div>

      <div className="panel" style={{ padding: 0, overflow: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Ola</th>
              <th>Revisadas</th>
              <th>PAY</th>
              <th>HOLD</th>
              <th>DENY</th>
            </tr>
          </thead>
          <tbody>
            {lastRun?.waves.map((w) => (
              <tr key={w.waveId}>
                <td>
                  <span className="mono muted">{w.timeLocal}</span>
                  <span className="muted"> · </span>
                  {w.label}
                </td>
                <td className="mono">{w.reviewed}</td>
                <td>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <StatusBadge outcome="PAY" />
                    <span className="mono">{w.tally.PAY}</span>
                  </span>
                </td>
                <td>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <StatusBadge outcome="HOLD" />
                    <span className="mono">{w.tally.HOLD}</span>
                  </span>
                </td>
                <td>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <StatusBadge outcome="DENY" />
                    <span className="mono">{w.tally.DENY}</span>
                  </span>
                </td>
              </tr>
            ))}
            {!lastRun && !loading && (
              <tr>
                <td colSpan={5} className="muted">
                  Aún no hay informe. Carga facturas y pulsa Ejecutar corrida
                  ahora.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
