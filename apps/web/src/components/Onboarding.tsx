'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Bot,
  ChevronRight,
  FlaskConical,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
  X,
} from 'lucide-react';
import Link from 'next/link';

/** Bump cuando cambie el copy del tour (fuerza reaparición). */
const STORAGE_KEY = 'ezallow-onboarding-v2';

const STEPS = [
  {
    icon: SlidersHorizontal,
    role: 'Administrador · CFO',
    title: '1 · Ustedes escriben las reglas',
    body: 'En Política fijan techos (soft/hard), quién puede cobrar (allowlist) y cuánta autonomía tiene el agente (Advise → Assist → Autopilot). El agente no inventa permiso: cumple lo que ustedes activaron.',
    href: '/policy',
    cta: 'Abrir Política',
  },
  {
    icon: Upload,
    role: 'Quien paga / cuentas por pagar',
    title: '2 · Entran las facturas',
    body: 'La bandeja es el trabajo diario: cargar, categorizar y enlazar con el banco que corresponde. Cuando la empresa quiera (horario, lote o corrida manual), el agente las toma bajo esas mismas reglas.',
    href: '/invoices',
    cta: 'Abrir Facturas',
  },
  {
    icon: Bot,
    role: 'Operación',
    title: '3 · El agente decide a su ritmo',
    body: 'En Corrida configuran la hora de cada ola y guardan. PAY si cabe en política; HOLD si hace falta un humano; DENY si choca con un muro. En demo: «Ejecutar ahora»; en prod el job usa esas horas.',
    href: '/agent',
    cta: 'Abrir Corrida',
  },
  {
    icon: ShieldCheck,
    role: 'CFO · autorizador',
    title: '4 · Ustedes conservan el control',
    body: 'HOLD = pedir permiso real. Al aprobar pueden promover el proveedor a regla (no aprobar la misma factura para siempre). DENY por duplicado es fail-closed; si es falso positivo, se excepciona y queda quién lo hizo.',
    href: '/decisions',
    cta: 'Abrir Decisiones',
  },
  {
    icon: FlaskConical,
    role: 'Confianza / Demo Day',
    title: '5 · Se prueba que no paga de más',
    body: 'Eval adversaria: un falso PAY descalifica (false_pay = 0). Incluye casos de inyección. No es CI de fondo: es la prueba de que las reglas se cumplen.',
    href: '/eval',
    cta: 'Abrir Eval',
  },
] as const;

export function markOnboardingDone() {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function openOnboardingEvent() {
  window.dispatchEvent(new Event('ezallow:onboarding'));
}

export function Onboarding() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  const close = useCallback(() => {
    markOnboardingDone();
    setOpen(false);
    setStep(0);
  }, []);

  useEffect(() => {
    let show = false;
    try {
      show = localStorage.getItem(STORAGE_KEY) !== '1';
    } catch {
      show = true;
    }
    if (show) setOpen(true);

    const reopen = () => {
      setStep(0);
      setOpen(true);
    };
    window.addEventListener('ezallow:onboarding', reopen);
    return () => window.removeEventListener('ezallow:onboarding', reopen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;

  const s = STEPS[step];
  const Icon = s.icon;
  const last = step === STEPS.length - 1;

  return (
    <div
      className="modal-root"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className="modal-card onboarding-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
      >
        <button
          type="button"
          className="modal-close"
          aria-label="Cerrar"
          onClick={close}
        >
          <X className="icon icon-sm" aria-hidden />
        </button>

        <p className="onboarding-kicker">
          EzAllow · Powered by DG ARTECH Studio
        </p>
        <h2 id="onboarding-title" className="modal-title">
          Reglas primero. El agente las cumple.
        </h2>
        <p className="modal-body" style={{ marginBottom: 16 }}>
          Pensado para quien define política, quien autoriza y quien paga.
          Ustedes fijan caps, allowlist y autonomía; el agente decide PAY /
          HOLD / DENY bajo eso. No movemos dinero: decidimos si debería
          moverse.
        </p>

        <div className="onboarding-steps" aria-hidden>
          {STEPS.map((_, i) => (
            <span
              key={STEPS[i].title}
              className={`onboarding-dot${i === step ? ' is-on' : ''}${i < step ? ' is-done' : ''}`}
            />
          ))}
        </div>

        <div className="onboarding-panel">
          <p className="onboarding-role">{s.role}</p>
          <div className="modal-icon" aria-hidden>
            <Icon className="icon" />
          </div>
          <h3 className="onboarding-step-title">{s.title}</h3>
          <p className="modal-body">{s.body}</p>
        </div>

        <div className="modal-actions onboarding-actions">
          <button type="button" className="btn btn-sm" onClick={close}>
            Saltar
          </button>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {step > 0 && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setStep((x) => x - 1)}
              >
                Atrás
              </button>
            )}
            <Link
              className="btn btn-sm"
              href={s.href}
              onClick={() => {
                if (last) markOnboardingDone();
              }}
            >
              {s.cta}
            </Link>
            {last ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={close}
              >
                Entendido
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setStep((x) => x + 1)}
              >
                Siguiente
                <ChevronRight className="icon icon-sm" aria-hidden />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
