'use client';

import { useEffect, useId, useRef } from 'react';
import { ShieldPlus, X } from 'lucide-react';

type Props = {
  open: boolean;
  title: string;
  /** Nombre destacado (p. ej. beneficiario) */
  highlight?: string;
  body: string;
  footnote?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({
  open,
  title,
  highlight,
  body,
  footnote,
  confirmLabel = 'Aceptar',
  cancelLabel = 'Cancelar',
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  const titleId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => confirmRef.current?.focus(), 40);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="modal-root"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <button
          type="button"
          className="modal-close"
          aria-label="Cerrar"
          disabled={busy}
          onClick={onCancel}
        >
          <X className="icon icon-sm" aria-hidden />
        </button>

        <div className="modal-icon" aria-hidden>
          <ShieldPlus className="icon" />
        </div>

        <h2 id={titleId} className="modal-title">
          {title}
        </h2>

        {highlight && (
          <p className="modal-highlight">
            <span className="muted">Beneficiario</span>
            <strong>{highlight}</strong>
          </p>
        )}

        <p className="modal-body">{body}</p>
        {footnote && <p className="modal-foot muted">{footnote}</p>}

        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? 'Aplicando…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
