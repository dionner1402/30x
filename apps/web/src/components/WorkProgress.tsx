'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

type Props = {
  title: string;
  detail?: string;
  current: number;
  total: number;
  /**
   * Barra viva mientras espera una sola request larga:
   * avanza suave hacia ~90% y completa al terminar.
   */
  alive?: boolean;
};

export function WorkProgress({
  title,
  detail,
  current,
  total,
  alive = false,
}: Props) {
  const safeTotal = Math.max(total, 1);
  const discrete = Math.min(100, Math.round((current / safeTotal) * 100));
  const done = current >= total && total > 0;

  const [pulse, setPulse] = useState(Math.max(discrete, alive ? 8 : discrete));

  useEffect(() => {
    if (!alive || done) {
      setPulse(done ? 100 : Math.max(discrete, 6));
      return;
    }
    setPulse((p) => Math.max(p, Math.max(discrete, 8)));
    const started = Date.now();
    const id = window.setInterval(() => {
      const elapsed = Date.now() - started;
      // Ease toward 90% over ~12s (nunca se queda congelado)
      const eased = 8 + 82 * (1 - Math.exp(-elapsed / 4500));
      setPulse((p) => Math.max(p, Math.min(90, eased)));
    }, 120);
    return () => window.clearInterval(id);
  }, [alive, done, discrete]);

  const pct = done ? 100 : alive ? pulse : Math.max(discrete, 6);
  const shown = Math.min(current, total);

  return (
    <div
      className="work-progress"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <div className="work-progress-head">
        <Loader2 className="icon spin" aria-hidden />
        <div className="work-progress-copy">
          <strong>{title}</strong>
          {detail ? <p className="muted">{detail}</p> : null}
        </div>
        <span className="mono muted work-progress-count">
          {alive && !done ? `${Math.round(pct)}%` : `${shown}/${total}`}
        </span>
      </div>
      <div className="work-bar" aria-hidden>
        <div
          className={`work-bar-fill${done ? ' is-done' : ''}${alive && !done ? ' is-alive' : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
