'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  Building2,
  Compass,
  FileStack,
  FlaskConical,
  History,
  Info,
  Landmark,
  LayoutDashboard,
  Lock,
  Bot,
  ShieldCheck,
  SlidersHorizontal,
  Waypoints,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Onboarding, openOnboardingEvent } from './Onboarding';

const ops: Array<{ href: string; label: string; Icon: LucideIcon }> = [
  { href: '/', label: 'Resumen', Icon: LayoutDashboard },
  { href: '/policy', label: 'Política', Icon: SlidersHorizontal },
  { href: '/accounts', label: 'Cuentas', Icon: Landmark },
  { href: '/invoices', label: 'Facturas', Icon: FileStack },
  { href: '/agent', label: 'Corrida', Icon: Bot },
  { href: '/decisions', label: 'Decisiones', Icon: ShieldCheck },
  { href: '/historial', label: 'Historial', Icon: History },
];

const diffs: Array<{ href: string; label: string; Icon: LucideIcon }> = [
  { href: '/cash', label: 'Presupuesto', Icon: Waypoints },
  { href: '/eval', label: 'Eval', Icon: FlaskConical },
];

export function Shell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-mark" />
        <div className="brand-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {/* basePath: Next no reescribe <img src> absolutos */}
          <img
            src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/brand/imagotipo_light.png`}
            alt="EzAllow"
          />
          <div className="brand-tag">Payments. Authorized.</div>
        </div>

        <div className="tenant">
          <Building2 className="icon" aria-hidden />
          <div>
            <strong>blinka-demo</strong>
            <span>Delegar decisión · no el control</span>
          </div>
        </div>

        <nav className="nav">
          <div className="nav-label">Operación</div>
          {ops.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={isActive(l.href) ? 'active' : undefined}
            >
              <l.Icon className="icon" aria-hidden />
              <span className="label">{l.label}</span>
            </Link>
          ))}
          <div className="nav-label">Diferenciadores</div>
          {diffs.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={isActive(l.href) ? 'active' : undefined}
            >
              <l.Icon className="icon" aria-hidden />
              <span className="label">{l.label}</span>
            </Link>
          ))}
        </nav>

        <div className="side-foot">
          EzAllow · 30X × Blinka
          <br />
          cierre seguro · rail mock
          <button
            type="button"
            className="side-tour"
            onClick={() => openOnboardingEvent()}
          >
            Tour del flujo →
          </button>
          <p className="powered-by">
            Powered by{' '}
            <a
              href="https://dgartech.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              DG ARTECH Studio
            </a>
          </p>
        </div>
      </aside>

      <div className="main">
        <div className="ribbon">
          <Info className="icon icon-sm ribbon-icon" aria-hidden />
          <span>
            <strong>EzAllow</strong>: sin mover dinero. Amarillo = marca ·
            Verde/Ámbar/Rojo = PAY / HOLD / DENY.
          </span>
        </div>
        <header className="topbar">
          <div>
            <h1>{title}</h1>
            <div className="sub">{subtitle}</div>
          </div>
          <div className="top-actions">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => openOnboardingEvent()}
              title="Ver el tour del flujo"
            >
              <Compass className="icon icon-sm" aria-hidden />
              Tour
            </button>
            <span className="chip-mode" title="Nunca PAY por error no controlado">
              <Lock className="icon icon-sm" aria-hidden />
              Cierre seguro
            </span>
            {actions}
          </div>
        </header>
        <div className="content">{children}</div>
      </div>
      <Onboarding />
    </div>
  );
}
