import { Ban, CheckCircle2, Clock3 } from 'lucide-react';

export function StatusBadge({ outcome }: { outcome: string }) {
  const cls =
    outcome === 'PAY' ? 'st-pay' : outcome === 'HOLD' ? 'st-hold' : 'st-deny';
  const Icon =
    outcome === 'PAY' ? CheckCircle2 : outcome === 'HOLD' ? Clock3 : Ban;
  return (
    <span className={`status ${cls}`}>
      <Icon className="icon icon-xs" aria-hidden />
      {outcome}
    </span>
  );
}
