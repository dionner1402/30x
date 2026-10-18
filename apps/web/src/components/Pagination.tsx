'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

export const PAGE_SIZE = 10;

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 500] as const;

export function paginate<T>(items: T[], page: number, size = PAGE_SIZE) {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / size) || 1);
  const safe = Math.min(Math.max(1, page), pageCount);
  const start = (safe - 1) * size;
  return {
    page: safe,
    pageCount,
    total,
    pageSize: size,
    slice: items.slice(start, start + size),
    from: total === 0 ? 0 : start + 1,
    to: Math.min(start + size, total),
  };
}

export function Pagination({
  page,
  pageCount,
  total,
  from,
  to,
  onChange,
  label = 'filas',
  pageSize = PAGE_SIZE,
  pageSizeOptions,
  onPageSizeChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  from: number;
  to: number;
  onChange: (page: number) => void;
  label?: string;
  pageSize?: number;
  pageSizeOptions?: readonly number[];
  onPageSizeChange?: (size: number) => void;
}) {
  const showPager = total > pageSize;
  const showSize = Boolean(pageSizeOptions?.length && onPageSizeChange);
  if (!showPager && !showSize) return null;

  return (
    <div
      className="toolbar"
      style={{
        marginTop: 0,
        marginBottom: 0,
        padding: '10px 16px',
        borderTop: '1px solid var(--line)',
      }}
    >
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>
        {total === 0 ? `0 ${label}` : `${from}–${to} de ${total} ${label}`}
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {showSize && (
          <label
            className="muted"
            style={{
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            Ver
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange?.(Number(e.target.value))}
              aria-label="Filas por página"
              style={{
                background: '#0d1219',
                border: '1px solid var(--line-strong)',
                borderRadius: 'var(--r)',
                padding: '4px 8px',
                color: 'var(--ez-cloud)',
                fontSize: 12,
              }}
            >
              {pageSizeOptions!.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
        {showPager && (
          <>
            <button
              type="button"
              className="btn btn-sm"
              disabled={page <= 1}
              onClick={() => onChange(page - 1)}
              aria-label="Página anterior"
            >
              <ChevronLeft className="icon" aria-hidden />
            </button>
            <span
              className="muted mono"
              style={{ fontSize: 12, minWidth: 52, textAlign: 'center' }}
            >
              {page} / {pageCount}
            </span>
            <button
              type="button"
              className="btn btn-sm"
              disabled={page >= pageCount}
              onClick={() => onChange(page + 1)}
              aria-label="Página siguiente"
            >
              <ChevronRight className="icon" aria-hidden />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
