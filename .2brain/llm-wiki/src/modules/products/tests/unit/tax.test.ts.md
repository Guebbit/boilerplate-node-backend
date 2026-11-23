---
source: src/modules/products/tests/unit/tax.test.ts
source_sha256: c42109de0385aae28993b8c953a434f936cd2dd6ee50f98db33ded18fb14bc62
context_sha256: 5a14dfb97f5af9ed2cd9058363f8c853e72ed59b9effd0dd0514b748bccdd4af
generated_at: 2026-11-22T07:20:08.839933+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/tests/unit/tax.test.ts

## Purpose
Unit tests for `resolveTaxRate`, the single place that decides which tax rate a product gets. The suite checks that an absent or known tax class always resolves to a real numeric rate, driven by environment-variable configuration.

## Key elements
- `describe('resolveTaxRate')` contains four cases:
  - An `undefined` tax class resolves to the shop default (`NODE_VAT_RATE_DEFAULT`, set to `'0.22'`, giving `0.22`).
  - `'reduced'` resolves to the reduced rate (`NODE_VAT_RATE_REDUCED`, `'0.1'`, giving `0.1`) and not the default.
  - `'zero'` resolves to `0` even when the default and reduced rates are configured.
  - Across `undefined`, `'reduced'` and `'zero'`, the result is always `typeof 'number'`. This case sets no env vars, so it relies on the suite-wide fallback.

## Relationships
- `src/modules/products/tax.ts`: provides `resolveTaxRate`, the function under test.
- `tests/support/environment.ts`: provides `setEnvironment`, imported via the `@tests/environment` alias. The tests use it to set `NODE_VAT_RATE_DEFAULT` and `NODE_VAT_RATE_REDUCED` per case.

## Notes
- The header comment says the two rate env vars are restored after each case so the suite-wide fallback does not leak between cases. No restore hook appears in this file, so that behavior presumably lives in the environment support code.
- The header comment attributes the suite-wide fallback rates to a separate setup file. The "never returns undefined" case depends on that fallback, because it does not call `setEnvironment`.
