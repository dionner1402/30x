/** Formato UI compartido para facturas / recibos. */

const CATEGORY_LABEL: Record<string, string> = {
  services: 'Servicios',
  suppliers: 'Proveedores',
  payroll: 'Nómina',
  ops: 'Operaciones',
  general: 'General',
};

/** Categorías de pago (mismas que Facturas). */
export const PAYMENT_CATEGORIES = [
  'general',
  'ops',
  'suppliers',
  'services',
  'payroll',
] as const;

export type PaymentCategory = (typeof PAYMENT_CATEGORIES)[number];

export function categoryLabel(cat?: string | null): string {
  if (!cat) return '-';
  if (cat === '*') return 'Resto pendiente';
  return CATEGORY_LABEL[cat] ?? cat;
}

export function formatMoney(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

/** MM-DD desde ISO date o datetime. */
export function formatDay(iso?: string | null): string {
  if (!iso) return '-';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[2]}-${m[3]}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}-${dd}`;
}

/** Fecha + hora local legible (p. ej. pago / decisión). */
export function formatDateTime(iso?: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('es', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}
