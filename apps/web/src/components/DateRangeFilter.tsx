'use client';

import {
  type DatePreset,
  type DateRange,
  rangeFromPreset,
} from '../lib/date-range';

const PRESETS: Array<{ id: DatePreset; label: string }> = [
  { id: 'all', label: 'Todo' },
  { id: 'today', label: 'Hoy' },
  { id: '7d', label: '7 días' },
  { id: '30d', label: '30 días' },
];

export function DateRangeFilter({
  value,
  onChange,
  preset,
  onPreset,
}: {
  value: DateRange;
  onChange: (next: DateRange) => void;
  preset: DatePreset;
  onPreset: (p: DatePreset) => void;
}) {
  return (
    <div
      className="date-range-filter"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center',
      }}
    >
      <div className="seg" role="group" aria-label="Rango rápido">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={preset === p.id ? 'active' : ''}
            onClick={() => {
              onPreset(p.id);
              onChange(rangeFromPreset(p.id));
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      <label
        className="muted"
        style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}
      >
        Desde
        <input
          type="date"
          className="input-date"
          value={value.from}
          onChange={(e) => {
            onPreset('all');
            onChange({ ...value, from: e.target.value });
          }}
        />
      </label>
      <label
        className="muted"
        style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}
      >
        Hasta
        <input
          type="date"
          className="input-date"
          value={value.to}
          onChange={(e) => {
            onPreset('all');
            onChange({ ...value, to: e.target.value });
          }}
        />
      </label>
    </div>
  );
}
