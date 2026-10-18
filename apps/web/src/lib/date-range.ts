/** Filtro por rango de fechas (día local, inclusive). */

export type DateRange = {
  from: string; // YYYY-MM-DD o ''
  to: string;
};

export const EMPTY_RANGE: DateRange = { from: '', to: '' };

/** Inicio del día local en ms. */
function startOfDayLocal(ymd: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

/** Fin del día local en ms. */
function endOfDayLocal(ymd: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

export function inDateRange(
  iso: string | undefined | null,
  range: DateRange,
): boolean {
  if (!range.from && !range.to) return true;
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  if (range.from) {
    const a = startOfDayLocal(range.from);
    if (a != null && t < a) return false;
  }
  if (range.to) {
    const b = endOfDayLocal(range.to);
    if (b != null && t > b) return false;
  }
  return true;
}

export function todayYmd(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function daysAgoYmd(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export type DatePreset = 'all' | 'today' | '7d' | '30d';

export function rangeFromPreset(preset: DatePreset): DateRange {
  if (preset === 'all') return EMPTY_RANGE;
  if (preset === 'today') {
    const t = todayYmd();
    return { from: t, to: t };
  }
  if (preset === '7d') return { from: daysAgoYmd(6), to: todayYmd() };
  return { from: daysAgoYmd(29), to: todayYmd() };
}
