/**
 * Defensa en profundidad contra inyección indirecta en texto de factura.
 *
 * Consenso de mercado (Surehand, OWASP LLM01, AWS Bedrock Agents, Sofy/ERP):
 * los filtros de patrón NO son la defensa principal — la autoridad de outcome
 * debe vivir fuera del modelo. Este módulo es la capa heurística: si el texto
 * libre parece instrucción al agente (no dato de factura), fail-closed → DENY.
 *
 * Nunca es suficiente solo: bank/vendor master no se mutan desde el documento;
 * evaluatePolicy sigue siendo la única autoridad de PAY.
 */

export type InjectionHit = {
  patternId: string;
  /** Fragmento corto para auditoría (sin volcar el payload completo) */
  snippet: string;
};

export type UntrustedScanResult = {
  clean: boolean;
  hits: InjectionHit[];
};

/** Patrones típicos de prompt injection / bank redirect en AP (EN + ES). */
const INJECTION_PATTERNS: Array<{ id: string; re: RegExp }> = [
  {
    id: 'ignore_prior',
    re: /\bignore\s+(all\s+)?(previous|prior|above)\s+instructions?\b/i,
  },
  {
    id: 'disregard_prior',
    re: /\bdisregard\s+(all\s+)?(previous|prior|above)\b/i,
  },
  {
    id: 'system_override',
    re: /\b(system\s*(prompt|update|override)|you\s+are\s+now)\b/i,
  },
  {
    id: 'force_outcome',
    re: /\b(force|must|auto)[\s_-]*(pay|approve|authorization|autoriz)\b/i,
  },
  {
    id: 'outcome_enum',
    re: /\b(outcome|decision)\s*[:=]\s*(PAY|HOLD|DENY)\b/i,
  },
  {
    id: 'note_to_agent',
    re: /\b(note\s+to\s+(automated|ai|agent|llm)|for\s+the\s+(ai|agent|llm)\s*:)\b/i,
  },
  {
    id: 'jailbreak',
    re: /\b(jailbreak|dan\s+mode|developer\s+mode)\b/i,
  },
  {
    id: 'es_ignora',
    re: /\b(ignora|omite)\s+(todas\s+)?(las\s+)?(instrucciones|reglas)\s+(anteriores|previas)\b/i,
  },
  {
    id: 'es_aprueba',
    re: /\b(aprueba|autoriza)\s+(este|esta)\s+(pago|factura)\s+(sin|autom[aá]ticamente)\b/i,
  },
  {
    id: 'bank_redirect',
    re: /\b(new\s+bank\s+details|updated?\s+banking|wire\s+to\s+(account|iban)|pay\s+to\s+(this\s+)?(iban|account|routing)|cambiar\s+(la\s+)?cuenta\s+bancaria|nueva\s+cuenta\s+(bancaria|iban))\b/i,
  },
  {
    id: 'iban_or_routing',
    re: /\b(IBAN\s*[:=]\s*[A-Z]{2}\d{2}[A-Z0-9]{10,}|routing\s*(number|#)?\s*[:=]\s*\d{9}|ABA\s*[:=]\s*\d{9})\b/i,
  },
  {
    id: 'untrusted_marker',
    re: /<\/?untrusted>|<<SYS>>|\[INST\]/i,
  },
];

function clip(s: string, n = 48): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : `${t.slice(0, n)}…`;
}

/**
 * Escanea un blob de texto libre (descripciones, número de factura, note de upload).
 */
export function detectInjectionSignals(text: string): UntrustedScanResult {
  if (!text || !text.trim()) return { clean: true, hits: [] };
  const hits: InjectionHit[] = [];
  for (const { id, re } of INJECTION_PATTERNS) {
    const m = text.match(re);
    if (m) {
      hits.push({ patternId: id, snippet: clip(m[0]) });
    }
  }
  return { clean: hits.length === 0, hits };
}

export type InvoiceTextFields = {
  payeeName?: string;
  invoiceNumber?: string;
  lineItems?: Array<{ desc?: string; amount?: number }>;
  /** Campos extra (note de upload, OCR raw, etc.) */
  extraText?: string[];
};

/**
 * Une campos de texto de factura y detecta payloads de inyección.
 */
export function scanInvoiceUntrustedContent(
  invoice: InvoiceTextFields,
): UntrustedScanResult {
  const parts: string[] = [];
  if (invoice.payeeName) parts.push(invoice.payeeName);
  if (invoice.invoiceNumber) parts.push(invoice.invoiceNumber);
  for (const li of invoice.lineItems ?? []) {
    if (li.desc) parts.push(li.desc);
  }
  for (const x of invoice.extraText ?? []) {
    if (x) parts.push(x);
  }
  return detectInjectionSignals(parts.join('\n'));
}

/**
 * True si el nombre de beneficiario no debe promoverse a allowlist
 * (inyección / bank redirect en el string).
 */
export function isUnsafePayeeName(payeeName: string): boolean {
  return !detectInjectionSignals(payeeName).clean;
}
