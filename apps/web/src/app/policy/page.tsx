'use client';

import {
  Plus,
  Save,
  ScanSearch,
  SlidersHorizontal,
  TriangleAlert,
  Unplug,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Guide } from '../../components/Guide';
import { Shell } from '../../components/Shell';
import { api, type Policy, type PolicyWarning, type Tenant } from '../../lib/api';
import { MOCK_RAIL_TOAST } from '../../lib/copy';

function normalizePayee(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function uniquePayees(list: string[]) {
  return [...new Set(list.map(normalizePayee).filter(Boolean))];
}

export default function PolicyPage() {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [softCap, setSoftCap] = useState(1000);
  const [hardCap, setHardCap] = useState(5000);
  const [periodBudget, setPeriodBudget] = useState(25000);
  const [maxMismatchPercent, setMaxMismatchPercent] = useState(5);
  const [blockNewPayees, setBlockNewPayees] = useState(true);
  const [allowFuzzy, setAllowFuzzy] = useState(false);
  const [trustLadder, setTrustLadder] = useState(true);
  const [autonomyWindow, setAutonomyWindow] = useState(false);
  const [payees, setPayees] = useState<string[]>([]);
  const [newPayee, setNewPayee] = useState('');
  const [warnings, setWarnings] = useState<PolicyWarning[]>([]);
  const [analyzed, setAnalyzed] = useState(false);
  const [pendingForceId, setPendingForceId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [t, p] = await Promise.all([api.tenant(), api.policyActive()]);
    setTenant(t);
    setPolicy(p);
    setSoftCap(p.softCap);
    setHardCap(p.hardCap);
    setPeriodBudget(p.periodBudget ?? 25000);
    setMaxMismatchPercent(p.maxMismatchPercent ?? 5);
    setBlockNewPayees(p.blockNewPayees !== false);
    setAllowFuzzy(Boolean(p.allowFuzzyPayeeMatch));
    setTrustLadder(p.trustLadderEnabled !== false);
    setAutonomyWindow(Boolean(p.autonomyWindowEnabled));
    setPayees(uniquePayees(p.allowlistPayees));
  }

  useEffect(() => {
    void load().catch((e) => setToast(String(e)));
  }, []);

  const analyzerHint = useMemo(() => {
    if (!analyzed && warnings.length === 0) {
      return allowFuzzy
        ? 'Fuzzy → PAY activo. Analiza antes de activar en Autopilot.'
        : 'Fuzzy → PAY desactivado (recomendado en Autopilot). Analiza antes de activar.';
    }
    if (warnings.length === 0) {
      return 'Sin problemas graves. Puedes activar.';
    }
    const highs = warnings.filter((w) => w.severity === 'high').length;
    return `${warnings.length} aviso(s)${highs ? ` · ${highs} de severidad alta` : ''}.`;
  }, [analyzed, warnings, allowFuzzy]);

  async function setMode(mode: Tenant['autonomyMode']) {
    setBusy(true);
    try {
      setTenant(await api.patchTenant({ autonomyMode: mode }));
      setToast(`Autonomía → ${mode}`);
    } catch (e) {
      setToast(String(e));
    } finally {
      setBusy(false);
    }
  }

  function addPayee() {
    const n = normalizePayee(newPayee);
    if (!n) return;
    if (payees.includes(n)) {
      setToast(`Ya está en allowlist: ${n}`);
      return;
    }
    setPayees((prev) => [...prev, n]);
    setNewPayee('');
  }

  function removePayee(p: string) {
    setPayees((prev) => prev.filter((x) => x !== p));
  }

  function buildBody() {
    return {
      version: `ui-${Date.now().toString(36)}`,
      softCap: Number(softCap),
      hardCap: Number(hardCap),
      periodBudget: Number(periodBudget),
      maxMismatchPercent: Number(maxMismatchPercent),
      blockNewPayees,
      allowFuzzyPayeeMatch: allowFuzzy,
      currency: 'USD',
      allowlistPayees: uniquePayees(payees),
      trustLadderEnabled: trustLadder,
      trustMinCleanPays: 3,
      trustSoftCapBoost: 2,
      autonomyWindowEnabled: autonomyWindow,
      autonomyStartHour: 8,
      autonomyEndHour: 20,
    };
  }

  async function runAnalyze() {
    setBusy(true);
    try {
      const soft = Number(softCap);
      const hard = Number(hardCap);
      if (soft > hard) {
        setToast('El soft cap no puede ser mayor que el hard cap');
        return;
      }
      const preview = await api.analyzePolicy(buildBody());
      setWarnings(preview.warnings);
      setAnalyzed(true);
      setToast(
        preview.blocked
          ? `Revisión: ${preview.warnings.length} avisos, alguno grave`
          : preview.warnings.length
            ? `Revisión: ${preview.warnings.length} aviso(s) · se puede activar`
            : 'Revisión: sin avisos · se puede activar',
      );
    } catch (e) {
      setToast(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveActivate(force = false) {
    const soft = Number(softCap);
    const hard = Number(hardCap);
    const budget = Number(periodBudget);
    const mismatch = Number(maxMismatchPercent);

    if (![soft, hard, budget, mismatch].every((n) => Number.isFinite(n) && n >= 0)) {
      setToast('Caps, presupuesto y desfase deben ser números ≥ 0');
      return;
    }
    if (soft > hard) {
      setToast('El soft cap no puede ser mayor que el hard cap');
      return;
    }

    setBusy(true);
    try {
      const body = buildBody();
      const preview = await api.analyzePolicy(body);
      setWarnings(preview.warnings);
      setAnalyzed(true);

      let policyId = pendingForceId;
      if (!force || !policyId) {
        const created = await api.createPolicy(body);
        policyId = created.id;
      }

      try {
        const active = await api.activatePolicy(policyId, { force });
        setPolicy(active);
        setPayees(uniquePayees(active.allowlistPayees));
        setWarnings(active.warnings ?? preview.warnings);
        setPendingForceId(null);
        setToast(
          `Policy ${active.version} activada · ${active.allowlistPayees.length} beneficiarios`,
        );
      } catch (e) {
        const msg = String(e);
        setPendingForceId(policyId);
        if (msg.includes('warnings') || msg.includes('A4b') || msg.includes('400')) {
          try {
            const parsed = JSON.parse(msg.replace(/^\d+\s+/, ''));
            if (Array.isArray(parsed?.warnings)) setWarnings(parsed.warnings);
            else if (Array.isArray(parsed?.message?.warnings)) {
              setWarnings(parsed.message.warnings);
            }
          } catch {
            /* toast */
          }
          setToast(
            'La revisión bloqueó la activación: hay un aviso grave. Corrígelo o fuerza.',
          );
        } else {
          throw e;
        }
      }
    } catch (e) {
      setToast(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell
      title="Política"
      subtitle="Reglas versionadas · revisión antes de activar"
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
          {pendingForceId && (
            <button
              type="button"
              className="btn btn-sm"
              disabled={busy}
              onClick={() => void saveActivate(true)}
            >
              Forzar activación
            </button>
          )}
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy}
            onClick={() => void runAnalyze()}
          >
            <ScanSearch className="icon" aria-hidden />
            Analizar
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={() => void saveActivate(false)}
          >
            <Save className="icon" aria-hidden />
            Guardar / Activar
          </button>
        </>
      }
    >
      <Guide
        icon={SlidersHorizontal}
        items={[
          'Elegir Advise → Assist → Autopilot',
          'Ajustar soft/hard cap y presupuesto del periodo',
          'Mantener la lista de beneficiarios y flags de seguridad',
          'Revisar la configuración y activar la versión',
        ]}
      >
        Define las reglas que el agente no puede saltarse: autonomía, caps,
        allowlist y análisis estático antes de activar.
      </Guide>

      <div className="toolbar">
        <div>
          <h2>Política {policy?.version ? `v${policy.version}` : '…'}</h2>
          <p>Reglas versionadas · única autoridad del resultado</p>
        </div>
      </div>

      <div className="callout callout-warn">
        <TriangleAlert className="icon" aria-hidden />
        <div>
          <strong>Revisión de reglas:</strong> {analyzerHint}
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="panel" style={{ marginBottom: 14 }}>
          <div className="panel-head">
            <h2>Avisos</h2>
            <p>{warnings.length} encontrados</p>
          </div>
          <ul className="rules">
            {warnings.map((w) => (
              <li key={w.id}>
                <strong>[{w.severity}]</strong> {w.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid-2">
        <div className="panel">
          <div className="field">
            <label>Modo de autonomía</label>
            <div className="modes">
              {(
                [
                  ['advise', '1 · Advise', 'Recomienda · humano confirma siempre'],
                  ['assist', '2 · Assist', 'Auto-PAY hasta soft cap'],
                  ['autopilot', '3 · Autopilot', 'Auto-PAY hasta hard cap'],
                ] as const
              ).map(([mode, title, desc]) => (
                <button
                  key={mode}
                  type="button"
                  className={`mode ${tenant?.autonomyMode === mode ? 'active' : ''}`}
                  disabled={busy}
                  onClick={() => void setMode(mode)}
                >
                  <strong>{title}</strong>
                  <span>{desc}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Soft cap: HOLD / aprobación humana (USD)</label>
            <input
              type="number"
              min={0}
              step={1}
              value={softCap}
              onChange={(e) => setSoftCap(Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label>Hard cap: DENY o HOLD forzado (USD)</label>
            <input
              type="number"
              min={0}
              step={1}
              value={hardCap}
              onChange={(e) => setHardCap(Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label>Presupuesto del periodo (USD)</label>
            <input
              type="number"
              min={0}
              step={1}
              value={periodBudget}
              onChange={(e) => setPeriodBudget(Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label>Desfase máx. vs acordado (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={maxMismatchPercent}
              onChange={(e) => setMaxMismatchPercent(Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label>Autoridad progresiva (D1)</label>
            <label
              className="muted"
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
                fontSize: 12.5,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={trustLadder}
                onChange={(e) => setTrustLadder(e.target.checked)}
                style={{ marginTop: 3 }}
              />
              <span>
                <strong style={{ color: 'var(--ez-cloud)' }}>Trust ladder</strong>
                {' · '}
                allowlist + ≥3 PAY limpios → softCap ×2 (sin pasar hardCap). Más
                autonomía sin más riesgo.
              </span>
            </label>
            <label
              className="muted"
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
                fontSize: 12.5,
                cursor: 'pointer',
                marginTop: 8,
              }}
            >
              <input
                type="checkbox"
                checked={autonomyWindow}
                onChange={(e) => setAutonomyWindow(e.target.checked)}
                style={{ marginTop: 3 }}
              />
              <span>
                <strong style={{ color: 'var(--ez-cloud)' }}>
                  Ventana Autopilot 8:00-20:00
                </strong>
                {' · '}
                fuera de esa franja, lo admisible pasa a HOLD. Las horas de cada
                ola se configuran en <Link href="/agent">Corrida</Link>.
              </span>
            </label>
          </div>
        </div>

        <div className="panel">
          <div className="field">
            <label>Beneficiarios registrados de la empresa (allowlist)</label>
            <div className="chips">
              {payees.map((p) => (
                <span key={p} className="chip">
                  {p}{' '}
                  <button
                    type="button"
                    aria-label={`Quitar ${p}`}
                    onClick={() => removePayee(p)}
                  >
                    ×
                  </button>
                </span>
              ))}
              {!payees.length && (
                <span className="muted" style={{ fontSize: 12 }}>
                  Vacía: todo beneficiario nuevo será HOLD si bloqueas nuevos.
                </span>
              )}
            </div>
          </div>
          <div className="field">
            <label>Agregar beneficiario (normalizado)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={newPayee}
                placeholder="vendor name llc"
                style={{ flex: 1 }}
                onChange={(e) => setNewPayee(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addPayee();
                  }
                }}
              />
              <button
                type="button"
                className="btn btn-sm"
                onClick={addPayee}
                disabled={!newPayee.trim()}
              >
                <Plus className="icon" aria-hidden />
              </button>
            </div>
          </div>
          <div className="check">
            <input
              type="checkbox"
              id="blockNew"
              checked={blockNewPayees}
              onChange={(e) => setBlockNewPayees(e.target.checked)}
            />
            <label htmlFor="blockNew">Bloquear beneficiarios nuevos (HOLD)</label>
          </div>
          <div className="check">
            <input
              type="checkbox"
              id="fuzzy"
              checked={allowFuzzy}
              onChange={(e) => setAllowFuzzy(e.target.checked)}
            />
            <label htmlFor="fuzzy">
              Permitir coincidencia aproximada (fuzzy) → PAY (apagado por defecto)
            </label>
          </div>
          <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>
            Cierre seguro: fallo de math, duplicado o hard deny → nunca PAY sin
            humano.
          </p>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </Shell>
  );
}
