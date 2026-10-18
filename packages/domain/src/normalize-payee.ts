const LEGAL_SUFFIXES = new Set([
  'llc',
  'inc',
  'ltd',
  'corp',
  'co',
  'sa',
  'sas',
  'srl',
  'gmbh',
  'plc',
]);

/**
 * A1 — normalización determinista de beneficiario (base para fingerprint + allowlist).
 */
export function normalizePayee(name: string): string {
  const nfkc = name.normalize('NFKC').toLowerCase();
  const noPunct = nfkc.replace(/[^\p{L}\p{N}\s]/gu, ' ');
  const tokens = noPunct
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !LEGAL_SUFFIXES.has(t));
  tokens.sort();
  return tokens.join(' ');
}

export function normalizeInvoiceNumber(invoiceNumber: string): string {
  return invoiceNumber
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
