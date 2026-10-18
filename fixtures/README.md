# Fixtures EzAllow

Dataset del brief Blinka (sin datos reales).

| Tipo | IDs | Expected (Operator) |
|------|-----|---------------------|
| Normales | N01–N15 | PAY |
| Duplicado | T-DUP | DENY (mismo fingerprint que N01) |
| Beneficiario nuevo | T-NEW | HOLD |
| Mismatch | T-MISMATCH | HOLD |
| Hard cap | T-OVER | DENY |
| Soft→hard (Autopilot) | T-SOFT | PAY (Assist → HOLD) |
| Presupuesto | T-BUDGET | HOLD (`context.remainingBudget`) |
| Math fail | T-MATH | DENY |
| Inyección prompt | T-INJECT | DENY (`untrusted_content`) |
| Redirect bancario | T-INJECT-BANK | DENY (`untrusted_content`) |

- Policy demo: `policies/demo.json`
- Índice: `manifest.json`
- Regenerar: `node scripts/generate-fixtures.mjs`
